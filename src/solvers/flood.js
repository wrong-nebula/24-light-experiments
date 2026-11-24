import { gridWGSL } from "../gpu.js";
const N = 512;
export async function flood(g) {
  const map = g.planar,
    cells = N * N,
    histories = [g.buffer(cells * 8 * 8), g.buffer(cells * 8 * 8)];
  const terrain = g.buffer(cells * 8),
    bounce = g.buffer(cells * 4);
  const strides = g.buffer(9 * 256, GPUBufferUsage.UNIFORM);
  const data = new Uint32Array(9 * 64);
  for (let i = 0; i < 9; i++) data[i * 64] = 256 >> i;
  g.device.queue.writeBuffer(strides, 0, data);
  const common = `
 struct Candidate { seed:u32, peak:f32 }
 const directions=array<vec2i,8>(vec2i(1,0),vec2i(1,1),vec2i(0,1),vec2i(-1,1),vec2i(-1,0),vec2i(-1,-1),vec2i(0,-1),vec2i(1,-1));
 fn pixel(i:u32)->vec2i{return vec2i(vec2u(i%512,i/512));}
 fn world(p:vec2i)->vec2f{return (vec2f(p)+.5)/512.*vec2f(40,32);}
 fn hue(w:vec2f)->vec3f {return select(vec3f(1.8,.48,.09),vec3f(.13,.56,1.4),w.x>22.);}
 @group(0) @binding(3) var<storage,read_write> terrain:array<vec2f>;
 @group(0) @binding(6) var<storage,read_write> bounce:array<f32>;
 `;
  const init = await g.kernel(
    "Seed directional height map",
    common +
      `
 @group(0) @binding(4) var<storage,read_write> out:array<Candidate>;
 @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;let w=world(pixel(i));var h=0.;for(var j=3u;j<u32(u.count);j++){if(all(abs(w-boxes[j].center.xz)<=boxes[j].halfSize.xz)){h=max(h,boxes[j].center.y+boxes[j].halfSize.y);}}
 var power=select(0.,u.on,length((w-vec2f(5,14))/vec2f(1.1,6.))<1.||length((w-vec2f(30,4))/vec2f(4.,1.2))<1.);
 if(h>0.){power=max(power,bounce[i]*.32);}
 terrain[i]=vec2f(h,power);let seed=select(0u,i+1,power>.002);
 for(var s=0u;s<8;s++){out[i*8+s]=Candidate(seed,h);}
 }`,
    [
      [
        [0, g.params],
        [1, g.boxes],
        [3, terrain],
        [4, histories[0]],
        [6, bounce],
      ],
    ],
  );
  // Max terrain in each dyadic directional interval supplies a conservative
  // first-half horizon. Off-axis candidates may enter from adjacent sectors.
  const code =
    common +
    `
 @group(0) @binding(4) var<storage,read> old:array<Candidate>;
 @group(0) @binding(5) var<storage,read_write> out:array<Candidate>;
 @group(0) @binding(7) var<uniform> stride:u32;
 fn score(seed:u32,w:vec2f)->f32{if(seed==0){return 0.;}let d=w-world(pixel(seed-1));return terrain[seed-1].y/(1.+dot(d,d)*.035);}
 @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;let p=pixel(i);let w=world(p);let h=terrain[i].x;
 for(var s=0u;s<8;s++){let q=p+directions[s]*i32(stride);var best=old[i*8+s];
 if(all(q>=vec2i(0))&&all(q<vec2i(512))){
 let j=u32(q.x+512*q.y);let near=old[j*8+s];let peak=max(best.peak,near.peak);var strength=score(best.seed,w);
 for(var k=0u;k<3;k++){let other=old[j*8+((s+7+k)%8)];if(other.seed==0u){continue;}
 let sourcePatch=terrain[other.seed-1];let delta=world(pixel(other.seed-1))-w;
 let along=dot(normalize(delta+vec2f(.00001)),normalize(vec2f(directions[s])));
 let slope=(max(8.,sourcePatch.x+.7)-h)/max(.01,length(delta));
 let dist=max(.08,length(world(p)-world(q)));let horizon=(max(best.peak,terrain[j].x)-h-.1)/dist;
 let v=score(other.seed,w);if(v>strength&&along>.70&&slope>=horizon){best.seed=other.seed;strength=v;}}
 best.peak=peak;}out[i*8+s]=best;}
 }`;
  const mod = g.device.createShaderModule({ code: gridWGSL + code });
  const pipe = await g.device.createComputePipelineAsync({
    layout: "auto",
    compute: { module: mod, entryPoint: "main" },
  });
  const groups = Array.from({ length: 9 }, (_, j) =>
    g.device.createBindGroup({
      layout: pipe.getBindGroupLayout(0),
      entries: [
        [3, terrain],
        [4, histories[j % 2]],
        [5, histories[1 - (j % 2)]],
      ]
        .map(([binding, buffer]) => ({ binding, resource: { buffer } }))
        .concat([
          {
            binding: 7,
            resource: { buffer: strides, offset: j * 256, size: 4 },
          },
        ]),
    }),
  );
  const resolve = await g.kernel(
    "Shade flooded rectangular patches",
    common +
      `
 @group(0) @binding(2) var out:texture_storage_2d<rgba16float,write>;
 @group(0) @binding(4) var<storage,read> seeds:array<Candidate>;
 fn edge(a:vec3f,b:vec3f)->f32{let c=cross(a,b);return c.y/max(length(c),.00001)*atan2(length(c),dot(a,b));}
 @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;let p=pixel(i);let w=world(p);var sum=vec3f(0);
 for(var s=0u;s<8;s++){let j=seeds[i*8+s].seed;if(j==0u){continue;}
 var duplicate=false;for(var k=0u;k<s;k++){if(seeds[i*8+k].seed==j){duplicate=true;}}if(duplicate){continue;}
 let sourcePatch=world(pixel(j-1));let d=vec3f(sourcePatch.x-w.x,max(.7,8.-terrain[i].x),sourcePatch.y-w.y);
 let a=d+vec3f(-1.5,0,-2);let b=d+vec3f(-1.5,0,2);let c=d+vec3f(1.5,0,2);let e=d+vec3f(1.5,0,-2);
 let form=abs(edge(a,b)+edge(b,c)+edge(c,e)+edge(e,a))/6.283185;
 sum+=hue(sourcePatch)*terrain[j-1].y*form*9.;}
 bounce[i]=min(1.,dot(sum,vec3f(.25,.5,.25)));textureStore(out,p,vec4f(sum,1));
 }`,
    histories.map((h) => [
      [2, map],
      [3, terrain],
      [4, h],
      [6, bounce],
    ]),
  );
  return {
    planar: true,
    step(enc, { first, dirty, a }) {
      if (!first && !dirty) return;
      enc.clearBuffer(bounce);
      const passes = Math.round(a);
      for (let batch = 0; batch < 2; batch++) {
        init(enc, cells / 64);
        for (let j = 0; j < passes; j++) {
          const pass = enc.beginComputePass();
          pass.setPipeline(pipe);
          pass.setBindGroup(0, groups[j]);
          pass.dispatchWorkgroups(cells / 64);
          pass.end();
        }
        resolve(enc, cells / 64, passes % 2);
      }
    },
  };
}
