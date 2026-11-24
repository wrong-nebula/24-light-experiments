import { gridWGSL } from "../gpu.js";
export async function edges(g) {
  const image = g.texture(
    512,
    512,
    "rgba16float",
    GPUTextureUsage.RENDER_ATTACHMENT,
  );
  const view = image.createView(),
    device = g.device;
  const module = device.createShaderModule({
    code:
      gridWGSL +
      `
 struct Vertex { @builtin(position) clip:vec4f, @location(0) @interpolate(flat) edge:u32 }
 @vertex fn scanline(@builtin(vertex_index) v:u32,@builtin(instance_index) j:u32)->Vertex{
 let row=j%512u;let y=1.-(f32(row)+.5)/256.;return Vertex(vec4f(select(-1.,1.,v!=0u),y,0,1),j/512u);}
 @fragment fn integral(in:Vertex)->@location(0) vec4f{
 let p=vec3f(in.clip.x/512.*40.,.62,in.clip.y/512.*32.);let half=u.a*.5;
 let corners=array<vec3f,4>(vec3f(9,5,16.-half),vec3f(9,12,16.-half),vec3f(9,12,16.+half),vec3f(9,5,16.+half));
 let a=normalize(corners[in.edge]-p);let b=normalize(corners[(in.edge+1u)%4u]-p);
 let axis=cross(a,b);let signedTerm=-sign(p.x-9.)*atan2(length(axis),dot(a,b))*axis.y/max(length(axis),.00001)/6.283185;
 let palette=array<vec3f,4>(vec3f(.9,.23,.04),vec3f(.2,.65,1),vec3f(.2,.95,.33),vec3f(.9,.22,.76));
 let color=select(signedTerm*vec3f(5.,3.1,1.45),abs(signedTerm)*palette[in.edge]*4.,u.variant>.5);
 return vec4f(color,0);
 }
 @vertex fn fullscreen(@builtin(vertex_index) i:u32)->@builtin(position) vec4f{
 let v=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));return vec4f(v[i],0,1);}
 @fragment fn contrast(@builtin(position) coord:vec4f)->@location(0) vec4f{
 let p=coord.xy/512.-vec2f(.56,.51);let mask=exp(-dot(p,p)*12.);return vec4f(.23,.10,.035,u.b*mask);}
 `,
  });
  const pipe = async (vertex, fragment, topology, color) =>
    device.createRenderPipelineAsync({
      layout: "auto",
      vertex: { module, entryPoint: vertex },
      primitive: { topology },
      fragment: {
        module,
        entryPoint: fragment,
        targets: [
          {
            format: "rgba16float",
            blend: {
              color,
              alpha: { operation: "add", srcFactor: "zero", dstFactor: "one" },
            },
          },
        ],
      },
    });
  const lines = await pipe("scanline", "integral", "line-list", {
    operation: "add",
    srcFactor: "one",
    dstFactor: "one",
  });
  const composite = await pipe("fullscreen", "contrast", "triangle-list", {
    operation: "add",
    srcFactor: "src-alpha",
    dstFactor: "one-minus-src-alpha",
  });
  const params = (p) =>
    device.createBindGroup({
      layout: p.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: g.params } }],
    });
  const l = params(lines),
    c = params(composite);
  const copy = await g.kernel(
    "Publish contour irradiance",
    `
 @group(0) @binding(2) var dest:texture_storage_2d<rgba16float,write>;
 @group(0) @binding(3) var src:texture_2d<f32>;
 @compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) id:vec3u){textureStore(dest,id.xy,textureLoad(src,id.xy,0));}
 `,
    [
      [
        [2, g.planar],
        [3, view],
      ],
    ],
  );
  return {
    planar: true,
    step(enc, { dirty, first }) {
      if (!dirty && !first) return;
      const pass = enc.beginRenderPass({
        colorAttachments: [
          { view, loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 0] },
        ],
      });
      pass.setPipeline(lines);
      pass.setBindGroup(0, l);
      pass.draw(2, 512 * 4);
      pass.setPipeline(composite);
      pass.setBindGroup(0, c);
      pass.draw(3);
      pass.end();
      copy(enc, 64, 0, 64);
    },
  };
}
