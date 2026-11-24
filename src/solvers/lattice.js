import { fieldDecl, voxelCount } from "../gpu.js";
export async function lattice(g) {
  const dirs = [[0, 0, 0]];
  for (let z = -1; z <= 1; z++)
    for (let y = -1; y <= 1; y++)
      for (let x = -1; x <= 1; x++) {
        const l = x * x + y * y + z * z;
        if (l === 1 || l === 2) dirs.push([x, y, z]);
      }
  const state = [
    g.buffer(voxelCount * 19 * 16),
    g.buffer(voxelCount * 19 * 16),
  ];
  const src = `
 const v=array<vec3i,19>(${dirs.map((a) => "vec3i(" + a.join(",") + ")").join(",")});
 @group(0) @binding(3) var<storage,read> prev:array<vec4f>;
 @group(0) @binding(4) var<storage,read_write> next:array<vec4f>;
 ${fieldDecl}
 @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) gid:vec3u){
 let i=gid.x;if(i>=23040u){return;} let p=pos(i); let w=vec3f(p)+.5; let k=boxId(w);
 var light=vec3f(0);var incoming:array<vec3f,19>;
 var normal=vec3f(0);var tint=vec3f(.99);
 if(k>=0){normal=face(w,u32(k));tint=boxes[k].tint.rgb;}
 for(var d=0u;d<19;d++){let q=vec3i(p)-v[d];if(inside(q)){incoming[d]=prev[idx(vec3u(q))*19+d].rgb;}light+=incoming[d];}
 let fog=.013+u.a*.32;
 let swirl=vec3f(sin(w.z*.21+u.time*.43),.24*sin(w.x*.23),-sin(w.x*.21-u.time*.37));
 let flow=swirl/max(1.,length(swirl))*smoothstep(.35,1.,u.a);
 let source=lamp(w)*vec3f(1.7,2.24,.42);
 var sum=vec3f(0);
 for(var d=0u;d<19;d++){
 let vel=vec3f(v[d]);let unit=vel/max(length(vel),1.);
 var out=mix(incoming[d],light*(1.+.95*dot(unit,flow))/19.,fog)*.982;
 if(k>=0){
 let reflected=vec3i(round(reflect(vel,normal)));var spec=vec3f(0);
 for(var j=0u;j<19;j++){if(all(v[j]==reflected)){spec=incoming[j];break;}}
 // Sum of positive direction cosines for any axis-aligned D3Q19 face.
 out=tint*(light*max(0.,dot(unit,normal))/3.828427*.84+spec*.16*max(0.,sign(dot(unit,normal))));
 }
 if(vel.x>0.){out+=source*select(.15,1.,vel.y==0. && vel.z==0.);}
 next[i*19+d]=vec4f(out,0);sum+=out;
 }
 textureStore(field,p,vec4f(sum,1));
 }`;
  const run = await g.kernel(
    "D3Q19 stream and collide",
    src,
    [0, 1].map((k) => [
      [0, g.params],
      [1, g.boxes],
      [2, g.view],
      [3, state[k]],
      [4, state[1 - k]],
    ]),
  );
  let phase = 0;
  return {
    step(enc, { first }) {
      for (let i = 0; i < (first ? 30 : 3); i++) {
        run(enc, 360, phase);
        phase = 1 - phase;
      }
    },
  };
}
