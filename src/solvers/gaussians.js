import { fieldDecl, voxelCount } from "../gpu.js";
export async function gaussians(g) {
  const buffers = [g.buffer(2048 * 16), g.buffer(2048 * 16)];
  const common = `
 const gd=vec3u(16,8,16);const spacing=vec3f(2.5,2.25,2.);
 fn gi(p:vec3u)->u32{return p.x+16u*(p.y+8u*p.z);}
 fn center(p:vec3u)->vec3f{return (vec3f(p)+.5)*spacing;}
 fn lobe(p:vec3f)->vec3f{
 let axis=normalize(vec3f(1.,-.25,.35));let d=p-vec3f(15.,5.,5.+u.a*20.);let t=dot(d,axis);
 let r=d-axis*t;let amp=exp(-.5*(dot(r,r)/3.8+t*t/(22.*u.b*u.b)));
 let cool=exp(-.5*dot((p-vec3f(29,4,10))/vec3f(3,4,4),(p-vec3f(29,4,10))/vec3f(3,4,4)));
 return amp*mix(vec3f(1.65,.32,.08),vec3f(.13,.85,1.45),u.variant)+cool*vec3f(.14,.32,.93);
 }
 // Integrate an ellipsoidal Gaussian extinction density over a finite segment.
 fn erf(x:f32)->f32{let a=abs(x);let t=1./(1.+.3275911*a);let poly=((((1.0614054*t-1.453152)*t+1.421414)*t-.284497)*t+.2548296)*t;return sign(x)*(1.-poly*exp(-a*a));}
 fn visibility(a:vec3f,b:vec3f)->f32{var depth=0.;let v=b-a;
 for(var j=3u;j<u32(u.count);j++){
 let sigma=max(boxes[j].halfSize.xyz*.73,vec3f(.55));let q=(a-boxes[j].center.xyz)/sigma;let d=v/sigma;
 let dd=max(dot(d,d),.0001);let t=-dot(q,d)/dd;let perp=q+t*d;let scale=sqrt(dd*.5);
 depth+=length(v)*exp(-.5*dot(perp,perp))*1.253314/sqrt(dd)*(erf((1.-t)*scale)-erf(-t*scale));
 }return exp(-1.6*depth);}
 `;
  const spread = await g.kernel(
    "Gaussian overlap exchange",
    common +
      `
 @group(0) @binding(3) var<storage,read> a:array<vec4f>;
 @group(0) @binding(4) var<storage,read_write> b:array<vec4f>;
 @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;let p=vec3u(i%16,(i/16)%8,i/128);let c=center(p);
 var sum=vec3f(0);var weights=0.;for(var z=-1;z<=1;z++){for(var y=-1;y<=1;y++){for(var x=-1;x<=1;x++){
 let q=vec3i(p)+vec3i(x,y,z);if(all(q>=vec3i(0))&&all(q<vec3i(gd))&&any(q!=vec3i(p))){
 let d=center(vec3u(q))-c;let weight=exp(-dot(d,d)/(4.*2.1*2.1));weights+=weight;
 sum+=a[gi(vec3u(q))].rgb*weight*visibility(c,c+d);}
 }}}
 let k=boxId(c);var rho=vec3f(.88);if(k>=0){rho=boxes[k].tint.rgb;}
 b[i]=vec4f(lobe(c)+rho*sum/max(weights,.001),1);
 }`,
    [0, 1].map((k) => [
      [0, g.params],
      [1, g.boxes],
      [3, buffers[k]],
      [4, buffers[1 - k]],
    ]),
  );
  const gather = await g.kernel(
    "Reconstruct Gaussian radiance",
    common +
      fieldDecl +
      `
 @group(0) @binding(3) var<storage,read> values:array<vec4f>;
 @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u){
 let p=pos(id.x);let w=vec3f(p)+.5;let cell=vec3i(floor(w/spacing));
 var sum=vec3f(0);var weights=0.;for(var z=-1;z<=1;z++){for(var y=-1;y<=1;y++){for(var x=-1;x<=1;x++){
 let q=cell+vec3i(x,y,z);if(all(q>=vec3i(0))&&all(q<vec3i(gd))){
 let d=w-center(vec3u(q));let weight=exp(-dot(d,d)/4.5);sum+=values[gi(vec3u(q))].rgb*weight;weights+=weight;}
 }}}
 textureStore(field,p,vec4f(sum/max(.001,weights),1));
 }`,
    buffers.map((b) => [
      [2, g.view],
      [3, b],
    ]),
  );
  let phase = 0;
  return {
    step(enc, { first, dirty }) {
      if (!first && !dirty) return;
      for (let i = 0; i < 14; i++) {
        spread(enc, 32, phase);
        phase = 1 - phase;
      }
      gather(enc, voxelCount / 64, phase);
    },
  };
}
