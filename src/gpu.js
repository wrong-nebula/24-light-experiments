import * as THREE from "three/webgpu";

export const size = [40, 18, 32];
export const gridWGSL = `
struct Params { a:f32, b:f32, on:f32, time:f32, tick:f32, variant:f32, dt:f32, count:f32 }
struct Box { center:vec4f, halfSize:vec4f, tint:vec4f }
@group(0) @binding(0) var<uniform> u:Params;
@group(0) @binding(1) var<storage,read> boxes:array<Box>;
const dim=vec3u(40,18,32);
fn idx(p:vec3u)->u32 {return p.x+40u*(p.y+18u*p.z);}
fn pos(i:u32)->vec3u {return vec3u(i%40u,(i/40u)%18u,i/720u);}
fn inside(p:vec3i)->bool {return all(p>=vec3i(0)) && all(p<vec3i(dim));}
fn boxId(p:vec3f)->i32 {
 for(var k=0u;k<u32(u.count);k++){if(all(abs(p-boxes[k].center.xyz)<=boxes[k].halfSize.xyz)){return i32(k);}}
 return -1;
}
fn face(p:vec3f,k:u32)->vec3f {
 let d=p-boxes[k].center.xyz; let gap=abs(d)-boxes[k].halfSize.xyz;
 if(gap.x>=max(gap.y,gap.z)){return vec3f(select(-1.,1.,d.x>0.),0,0);}
 if(gap.y>=gap.z){return vec3f(0,select(-1.,1.,d.y>0.),0);}
 return vec3f(0,0,select(-1.,1.,d.z>0.));
}
fn lamp(p:vec3f)->f32 {
 let bars=any(abs(vec3f(p.z)-vec3f(7.5,14.5,21.5))<vec3f(1.15));
 return select(0.,u.on,p.x<2. && p.y>3. && p.y<12. && bars);
}
`;
export function createGPU(renderer, field) {
  const device = renderer.backend.device;
  const params = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const boxes = device.createBuffer({
    size: 48 * 32,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const owned = [];
  renderer.initTexture(field);
  const view = renderer.backend
    .get(field)
    .texture.createView({ mipLevelCount: 1 });
  function buffer(bytes, extra = 0) {
    const b = device.createBuffer({
      size: bytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | extra,
    });
    owned.push(b);
    return b;
  }
  function texture(w, h, format, extra = 0) {
    const t = device.createTexture({
      size: [w, h],
      format,
      usage: GPUTextureUsage.TEXTURE_BINDING | extra,
    });
    owned.push(t);
    return t;
  }
  function resource(x) {
    return x instanceof GPUBuffer ? { buffer: x } : x;
  }
  async function kernel(name, source, bindings) {
    const mod = device.createShaderModule({
      label: name,
      code: gridWGSL + source,
    });
    const pipe = await device.createComputePipelineAsync({
      label: name,
      layout: "auto",
      compute: { module: mod, entryPoint: "main" },
    });
    const groups = bindings.map((entries) =>
      device.createBindGroup({
        layout: pipe.getBindGroupLayout(0),
        entries: entries.map(([binding, x]) => ({
          binding,
          resource: resource(x),
        })),
      }),
    );
    return (enc, n, which = 0, y = 1) => {
      const pass = enc.beginComputePass();
      pass.setPipeline(pipe);
      pass.setBindGroup(0, groups[which]);
      pass.dispatchWorkgroups(n, y);
      pass.end();
    };
  }
  return {
    device,
    params,
    boxes,
    view,
    buffer,
    texture,
    kernel,
    owned,
    clear() {
      for (const item of owned.splice(0)) item.destroy();
    },
    dispose() {
      this.clear();
      params.destroy();
      boxes.destroy();
    },
    uniform(values) {
      device.queue.writeBuffer(params, 0, new Float32Array(values));
    },
    geometry(items) {
      device.queue.writeBuffer(
        boxes,
        0,
        new Float32Array(
          items.flatMap((o) => [...o.c, 0, ...o.h, 0, ...o.tint, 0]),
        ),
      );
    },
  };
}
export function makeField() {
  const t = new THREE.Storage3DTexture(...size);
  t.type = THREE.HalfFloatType;
  t.generateMipmaps = false;
  return t;
}
export const fieldDecl =
  "@group(0) @binding(2) var field:texture_storage_3d<rgba16float,write>;";
export const voxelCount = 40 * 18 * 32;
