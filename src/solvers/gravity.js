import { fieldDecl, voxelCount } from "../gpu.js";
export async function gravity(g) {
  const bins = g.buffer(voxelCount * 8);
  const trace = await g.kernel(
    "Integrate gradient-index paths",
    `
 @group(0) @binding(3) var<storage,read_write> bins:array<atomic<u32>>;
 @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u){
 let j=id.x;let f=vec2f(f32(j%64),f32(j/64))+.5;
 var p=vec3f(1.55,5.3+f.x*.089,3.5+f.y*.36);
 var d=normalize(vec3f(1.,-.145,(f.y-32.)*.001));
 let lens=vec3f(23.,3.2,6.+u.b*19.);
 for(var t=0u;t<180;t++){
 let r=p-lens;let bump=u.a*exp(-dot(r,r)/64.);let n=1.+bump;
 let grad=-r*bump/32.;let bend=(grad-d*dot(d,grad))/n;
 let halfD=normalize(d+.14*bend);let mid=p+halfD*.14;let r2=mid-lens;let bump2=u.a*exp(-dot(r2,r2)/64.);
 let grad2=-r2*bump2/32.;d=normalize(d+.28*(grad2-halfD*dot(halfD,grad2))/(1.+bump2));p+=halfD*.28;
 let q=vec3i(floor(p));if(!inside(q)){break;}
 let i=idx(vec3u(q));let k=boxId(p);
 if(k>=0){atomicAdd(&bins[i*2+1],48u);break;}
 atomicAdd(&bins[i*2],1u);
 }}
 `,
    [
      [
        [0, g.params],
        [1, g.boxes],
        [3, bins],
      ],
    ],
  );
  const resolve = await g.kernel(
    "Resolve ray density and caustics",
    fieldDecl +
      `
 @group(0) @binding(3) var<storage,read> counts:array<u32>;
 @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;let p=pos(i);let light=f32(counts[i*2])*.006;let hit=f32(counts[i*2+1])*.015;
 textureStore(field,p,vec4f(light*vec3f(.1,.84,.84)+hit*vec3f(.44,1.,.85),1));}
 `,
    [
      [
        [2, g.view],
        [3, bins],
      ],
    ],
  );
  return {
    step(enc, { dirty, first }) {
      if (!first && !dirty) return;
      enc.clearBuffer(bins);
      trace(enc, 64);
      resolve(enc, 360);
    },
  };
}
