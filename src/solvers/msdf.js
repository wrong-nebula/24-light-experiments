import * as THREE from "three/webgpu";
import { wgslFn, texture, positionWorld, uniform } from "three/tsl";

function polygonDistances(x, y, vertices) {
  const channels = [2, 2, 2];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i],
      b = vertices[(i + 1) % vertices.length],
      dx = b[0] - a[0],
      dy = b[1] - a[1];
    const d = (dx * (y - a[1]) - dy * (x - a[0])) / Math.hypot(dx, dy);
    // Each sharp edge owns a pair of channels. Adjacent corners change pairs.
    const omit = i === vertices.length - 1 && i % 3 === 0 ? 1 : i % 3;
    for (let c = 0; c < 3; c++)
      if (c !== omit) channels[c] = Math.min(channels[c], d);
  }
  return channels;
}
function bake(alternate) {
  const n = 256,
    out = new Uint8Array(n * n * 4),
    polys = [];
  for (let i = 0; i < (alternate ? 12 : 8); i++) {
    const a = (i * Math.PI * 2) / (alternate ? 12 : 8),
      cs = Math.cos(a),
      sn = Math.sin(a);
    const vertices = alternate
      ? [
          [0.16, -0.032],
          [0.75, -0.084],
          [0.91, 0.015],
          [0.26, 0.066],
        ]
      : [
          [0.15, -0.025],
          [0.56, -0.17],
          [0.92, -0.095],
          [0.76, 0.095],
          [0.31, 0.115],
        ];
    polys.push(vertices.map(([x, y]) => [cs * x - sn * y, sn * x + cs * y]));
  }
  polys.push(
    Array.from({ length: alternate ? 4 : 8 }, (_, i) => {
      const a = (2 * Math.PI * i) / (alternate ? 4 : 8);
      return [0.12 * Math.cos(a), 0.12 * Math.sin(a)];
    }),
  );
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const p = [(x + 0.5) / 128 - 1, (y + 0.5) / 128 - 1],
        rgb = [-2, -2, -2];
      for (const poly of polys) {
        const d = polygonDistances(...p, poly);
        for (let c = 0; c < 3; c++) rgb[c] = Math.max(rgb[c], d[c]);
      }
      const off = (y * n + x) * 4;
      for (let c = 0; c < 3; c++)
        out[off + c] = Math.round(
          255 * Math.max(0, Math.min(1, 0.5 + rgb[c] * 3)),
        );
      out[off + 3] = 255;
    }
  const t = new THREE.DataTexture(out, n, n);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
const medianFn = wgslFn(
  "fn mid3(c:vec3f)->f32{return max(min(c.r,c.g),min(max(c.r,c.g),c.b));}",
);
const project = wgslFn(
  `fn projectMask(p:vec3f,t:texture_2d<f32>,s:sampler,pars:vec3f)->vec3f{
 let angle=pars.z;let v=(p.xz-vec2f(20,16)+p.y*vec2f(.32,.16))/(31.-p.y*.7);
 let uv=vec2f(.5)+vec2f(cos(angle)*v.x-sin(angle)*v.y,sin(angle)*v.x+cos(angle)*v.y);
 let rgb=textureSampleLevel(t,s,uv,0).rgb;let edge=mid3(rgb)-.5;let w=.009+pars.x*.20*max(.12,1.-p.y/18.);
 let pen=smoothstep(-w,w,edge);if(pars.y<.001){return vec3f(pen)*vec3f(1.1,1.06,.93);}
 let du=1./256.;let dx=mid3(textureSampleLevel(t,s,uv+vec2f(du,0),0).rgb)-mid3(textureSampleLevel(t,s,uv-vec2f(du,0),0).rgb);
 let dy=mid3(textureSampleLevel(t,s,uv+vec2f(0,du),0).rgb)-mid3(textureSampleLevel(t,s,uv-vec2f(0,du),0).rgb);
 let shift=vec2f(dx,dy)/max(.008,length(vec2f(dx,dy)))*pars.y*.021;
 let r=smoothstep(-w,w,mid3(textureSampleLevel(t,s,uv+shift,0).rgb)-.5);
 let b=smoothstep(-w,w,mid3(textureSampleLevel(t,s,uv-shift,0).rgb)-.5);
 return vec3f(r,pen,b)*vec3f(1.5,1.35,1.8);
}`,
  [medianFn],
);
export function msdf() {
  const masks = [bake(false), bake(true)],
    map = texture(masks[0]),
    pars = uniform(new THREE.Vector3());
  return {
    light: project(positionWorld, map, map, pars),
    step(enc, s) {
      map.value = masks[s.variant];
      pars.value.set(s.a, s.b, s.time * 0.09);
    },
    dispose() {
      masks.forEach((t) => t.dispose());
    },
  };
}
