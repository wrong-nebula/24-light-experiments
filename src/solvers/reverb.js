import { fieldDecl } from "../gpu.js";
export function blocked(a, b, boxes) {
  for (const { c, h } of boxes) {
    let lo = 0.001,
      hi = 0.999;
    for (let i = 0; i < 3; i++) {
      const d = b[i] - a[i];
      if (Math.abs(d) < 1e-6) {
        if (Math.abs(a[i] - c[i]) > h[i]) {
          hi = -1;
          break;
        }
      } else {
        let t = (c[i] - h[i] - a[i]) / d,
          s = (c[i] + h[i] - a[i]) / d;
        lo = Math.max(lo, Math.min(t, s));
        hi = Math.min(hi, Math.max(t, s));
      }
    }
    if (hi > lo) return true;
  }
  return false;
}
export async function reverb(g) {
  const probes = Array.from({ length: 32 }, (_, i) => [
    ((i % 4) + 0.5) * 10,
    (Math.floor(i / 16) + 0.5) * 7,
    ((Math.floor(i / 4) % 4) + 0.5) * 8,
  ]);
  const delays = probes.map((_, i) => 5 + ((i * 13) % 19)),
    lines = delays.map((n) => new Float32Array(n * 3));
  const vectors = new Float32Array(96),
    energy = new Float32Array(128);
  const data = g.buffer(energy.byteLength);
  let clock = 0,
    carry = 0,
    rot = [],
    inputs = [],
    albedos = [];
  const run = await g.kernel(
    "Reconstruct delay-tank energy",
    fieldDecl +
      `
 @group(0) @binding(3) var<storage,read> probes:array<vec4f>;
 fn clearSegment(start:vec3f,end:vec3f)->f32{
 let inv=1./(end-start+vec3f(.00001));for(var j=3u;j<u32(u.count);j++){
 let v=(boxes[j].center.xyz-boxes[j].halfSize.xyz-start)*inv;
 let b=(boxes[j].center.xyz+boxes[j].halfSize.xyz-start)*inv;
 let lo=min(v,b);let hi=max(v,b);
 if(max(max(max(lo.x,lo.y),lo.z),.001)<min(min(min(hi.x,hi.y),hi.z),.999)){return 0.;}
 }return 1.;}
 @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u){
 let p=pos(id.x);let w=vec3f(p)+.5;var e=vec3f(0);var total=0.;
 for(var j=0u;j<32;j++){let c=(vec3f(f32(j%4),f32(j/16),f32((j/4)%4))+.5)*vec3f(10,7,8);let d=w-c;let weight=exp(-dot(d,d)/28.);total+=weight;e+=probes[j].rgb*weight;}
 let src=vec3f(2,6,14);let delta=w-src;let spectrum=u.on*vec3f(.8,.16,1.4);
 var early=spectrum*clearSegment(src,w)*exp(-dot(delta,delta)/90.);
 // Mirror the source across the floor and back wall for first reflections.
 for(var surface=0u;surface<2;surface++){let axis=select(1u,2u,surface==1u);let boundary=select(.62,.90,surface==1u);
 if(w[axis]<=boundary){continue;}var reflected=src;reflected[axis]=2.*boundary-src[axis];
 let t=(boundary-reflected[axis])/(w[axis]-reflected[axis]);let hit=mix(reflected,w,t);
 let lengthSq=dot(w-reflected,w-reflected);let albedo=boxes[select(0u,2u,surface==1u)].tint.rgb;
 early+=spectrum*albedo*clearSegment(src,hit)*clearSegment(hit,w)*exp(-lengthSq/110.)*.46;}
 textureStore(field,p,vec4f(e/max(.001,total)*4.+early,1));
 }`,
    [
      [
        [0, g.params],
        [1, g.boxes],
        [2, g.view],
        [3, data],
      ],
    ],
  );
  return {
    step(enc, { first, dirty, b, a, dt, on, items }) {
      if (first || dirty) {
        rot = [];
        for (let bit = 1; bit < 32; bit *= 2)
          for (let i = 0; i < 32; i++)
            if (!(i & bit)) {
              const j = i ^ bit;
              const visible = !blocked(probes[i], probes[j], items.slice(3));
              rot.push([i, j, visible ? (b * Math.PI) / 4 : 0]);
            }
        albedos = probes.map((p) => {
          let nearest = Infinity,
            tint = items[0].tint;
          for (const item of items) {
            const gap = p.map((v, k) =>
              Math.max(0, Math.abs(v - item.c[k]) - item.h[k]),
            );
            const distance = Math.hypot(...gap);
            if (distance < nearest) {
              nearest = distance;
              tint = item.tint;
            }
          }
          return tint.map((channel) => Math.sqrt(channel));
        });
        inputs = probes.map((p) =>
          blocked([1.7, 6, 14], p, items.slice(3))
            ? 0
            : Math.exp(-Math.hypot(p[0] - 2, p[1] - 6, p[2] - 14) / 8),
        );
      }
      carry += dt * 120;
      const n = first ? 200 : Math.floor(carry);
      carry %= 1;
      for (let k = 0; k < n; k++, clock++) {
        for (let i = 0; i < 32; i++) {
          const slot = (clock % delays[i]) * 3;
          vectors.set(lines[i].subarray(slot, slot + 3), i * 3);
        }
        for (const [i, j, angle] of rot) {
          const c = Math.cos(angle),
            s = Math.sin(angle);
          for (let ch = 0; ch < 3; ch++) {
            const x = vectors[i * 3 + ch],
              y = vectors[j * 3 + ch];
            vectors[i * 3 + ch] = c * x + s * y;
            vectors[j * 3 + ch] = s * x - c * y;
          }
        }
        for (let i = 0; i < 32; i++) {
          const slot = (clock % delays[i]) * 3,
            feedback = Math.pow(0.001, delays[i] / (120 * a));
          for (let ch = 0; ch < 3; ch++) {
            const damp = albedos[i][ch];
            const v =
              vectors[i * 3 + ch] * feedback * damp +
              inputs[i] * on * [0.95, 0.34, 1.3][ch];
            lines[i][slot + ch] = v;
            energy[i * 4 + ch] = energy[i * 4 + ch] * 0.85 + v * v * 0.15;
          }
        }
      }
      g.device.queue.writeBuffer(data, 0, energy);
      run(enc, 360);
    },
  };
}
