import { fieldDecl } from "../gpu.js";
export async function nca(g) {
  const response = await fetch(import.meta.env.BASE_URL + "nca-weights.bin");
  if (!response.ok) throw Error("Could not load the trained NCA weights.");
  const weights = new Float32Array(await response.arrayBuffer());
  if (weights.length !== 10048) throw Error("Invalid NCA checkpoint.");
  const w = g.buffer(weights.byteLength);
  g.device.queue.writeBuffer(w, 0, weights);
  const cells = 40 * 32,
    rule = g.buffer(cells * 16 * 4),
    medium = g.buffer(cells * 16),
    states = [g.buffer(cells * 64), g.buffer(cells * 64)];
  const prep = await g.kernel(
    "Condition the learned scattering rule",
    `
 @group(0) @binding(3) var<storage,read> w:array<f32>;
 @group(0) @binding(4) var<storage,read_write> rule:array<f32>;
 @group(0) @binding(5) var<storage,read_write> medium:array<vec4f>;
 @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;let p=vec3f(f32(i%40)+.5,2.5,f32(i/40)+.5);let k=boxId(p);var alb=vec3f(.97);var normal=vec3f(0);
 if(k>=0){alb=boxes[k].tint.rgb;normal=face(p,u32(k));}
 let f=array<f32,8>(alb.r,alb.g,alb.b,normal.x,normal.z,select(0.,1.,k>=0),.19,1.);
 var h:array<f32,88>;var h2:array<f32,88>;
 for(var j=0u;j<88;j++){var v=w[704+j];for(var t=0u;t<8;t++){v+=f[t]*w[j*8+t];}h[j]=max(v,0.);}
 for(var j=0u;j<88;j++){var v=w[8536+j];for(var t=0u;t<88;t++){v+=h[t]*w[792+j*88+t];}h2[j]=max(v,0.);}
 for(var row=0u;row<4;row++){var logits=vec4f(0);for(var col=0u;col<4;col++){
 let j=row*4+col;var v=w[10032+j];for(var t=0u;t<88;t++){v+=h2[t]*w[8624+j*88+t];}
 logits[col]=v+select(select(0.,2.9,row==col),select(0.,1.6,(row^1u)==col),k>=0);}
 let e=exp(logits-max(max(logits.x,logits.y),max(logits.z,logits.w)));let probs=e/dot(e,vec4f(1));
 for(var col=0u;col<4;col++){rule[i*16+row*4+col]=probs[col];}}
 medium[i]=vec4f(alb,select(0.,1.,k>=0));
 }`,
    [
      [
        [0, g.params],
        [1, g.boxes],
        [3, w],
        [4, rule],
        [5, medium],
      ],
    ],
  );
  const tick = await g.kernel(
    "Local recurrent transport",
    fieldDecl +
      `
 @group(0) @binding(3) var<storage,read> rule:array<f32>;
 @group(0) @binding(4) var<storage,read> medium:array<vec4f>;
 @group(0) @binding(5) var<storage,read> prev:array<vec4f>;
 @group(0) @binding(6) var<storage,read_write> next:array<vec4f>;
 const d=array<vec2i,4>(vec2i(1,0),vec2i(-1,0),vec2i(0,1),vec2i(0,-1));
 @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;let p=vec2i(vec2u(i%40,i/40));var inc:array<vec3f,4>;
 for(var c=0u;c<4;c++){let q=p-d[c];if(all(q>=vec2i(0)) && all(q<vec2i(40,32))){inc[c]=prev[u32(q.x+q.y*40)*4+c].xyz;}}
 let emit=lamp(vec3f(vec2f(p).x+.5,6.,vec2f(p).y+.5))*vec3f(.22,1.5,.71);
 var msgs:array<vec3f,4>;var rgb=vec3f(0);for(var r=0u;r<4;r++){var m=vec3f(0);
 for(var c=0u;c<4;c++){m+=inc[c]*rule[i*16+r*4+c];}msgs[r]=m*medium[i].rgb+emit;rgb+=msgs[r]*.25;}
 let aux=vec4f(rgb,medium[i].a);for(var r=0u;r<4;r++){next[i*4+r]=vec4f(msgs[r],aux[r]);}
 for(var y=0u;y<18;y++){textureStore(field,vec3u(u32(p.x),y,u32(p.y)),vec4f(rgb*exp(-abs(f32(y)-4.)*.08)*3.6,1));}
 }`,
    [0, 1].map((k) => [
      [0, g.params],
      [2, g.view],
      [3, rule],
      [4, medium],
      [5, states[k]],
      [6, states[1 - k]],
    ]),
  );
  let phase = 0;
  return {
    step(enc, { first, dirty, action, a }) {
      if (first || dirty) prep(enc, 20);
      if (action) for (const b of states) enc.clearBuffer(b);
      for (let j = 0; j < (action ? 1 : first ? 32 : Math.round(a)); j++) {
        tick(enc, 20, phase);
        phase = 1 - phase;
      }
    },
  };
}
