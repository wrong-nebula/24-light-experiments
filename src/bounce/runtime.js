import * as T from "three/webgpu";
import {
  positionLocal,
  normalLocal,
  screenUV,
  texture,
  uniform,
  vec3,
  wgslFn,
} from "three/tsl";
import { atlasWidth, atlasHeight, divisions } from "./patches.js";
import { stripe } from "./wavelets.js";

const lookup =
  wgslFn(`fn patchLight(p:vec3f,n:vec3f,dims:vec3f,object:f32,screenX:f32,split:f32,pixelated:f32,t:texture_2d<f32>,s:sampler)->vec3f{
  var face=0.;var uv=p.zy+.5;var cells=dims.zy;
  if(abs(n.x)>.5){face=select(1.,0.,n.x>0.);}
  else if(abs(n.y)>.5){face=select(3.,2.,n.y>0.);uv=p.xz+.5;cells=dims.xz;}
  else{face=select(5.,4.,n.z>0.);uv=p.xy+.5;cells=dims.xy;}
  let origin=vec2f(face*16.+select(0.,96.,split>.5 && screenX<.5),object*16.);
  var pixel=clamp(uv*cells,vec2f(.5),cells-.5);
  if(pixelated>.5 && face==4.){pixel=floor(pixel)+.5;}
  return textureSampleLevel(t,s,(origin+pixel)/vec2f(192,512),0).rgb;
}`);
export function createBounceSolver(id, report, fail) {
  const atlas = new T.DataTexture(
    new Uint16Array(atlasWidth * atlasHeight * 4),
    atlasWidth,
    atlasHeight,
    T.RGBAFormat,
    T.HalfFloatType,
  );
  atlas.minFilter = atlas.magFilter = T.LinearFilter;
  atlas.needsUpdate = true;
  const map = texture(atlas),
    split = uniform(0);
  const worker = new Worker(new URL("./worker.js", import.meta.url), {
    type: "module",
  });
  let fresh = false;
  let resolve,
    reject,
    busy = false,
    disposed = false,
    pending = null,
    camera,
    cameraKey = "",
    cameraDirty = false,
    paintDirty = false,
    painted = null,
    lastStripe;
  const ready = new Promise((ok, no) => {
    resolve = ok;
    reject = no;
  });
  function send(message) {
    busy = true;
    worker.postMessage(message);
  }
  function failure(message) {
    if (disposed) return;
    const error = new Error(message);
    reject(error);
    fail(error);
  }
  worker.onerror = (e) => failure(e.message);
  worker.onmessage = ({ data }) => {
    if (disposed) return;
    if (data.error) {
      failure(data.error);
      return;
    }
    fresh = true;
    atlas.image.data = data.pixels;
    atlas.needsUpdate = true;
    split.value = Number(data.compare);
    report(data.info);
    resolve();
    busy = false;
    if (pending) {
      const next = pending;
      pending = null;
      send(next);
    }
  };
  function cameraChanged(cam, plan) {
    if (id !== "bitmask" || (plan && camera)) return false;
    const m = cam.matrixWorld.elements,
      values = [...m, cam.left, cam.right, cam.top, cam.bottom, cam.zoom];
    const key = values.map((v) => Math.round(v * 10000)).join(",");
    if (key === cameraKey) return false;
    cameraKey = key;
    cameraDirty = true;
    camera = {
      eye: m.slice(12, 15),
      right: m.slice(0, 3),
      up: m.slice(4, 7),
      back: m.slice(8, 11),
      width: (cam.right - cam.left) / cam.zoom,
      height: (cam.top - cam.bottom) / cam.zoom,
    };
    return true;
  }
  return {
    patches: true,
    ready,
    cameraChanged,
    takeFrame() {
      const value = fresh;
      fresh = false;
      return value;
    },
    surfaceLight(object, item) {
      return lookup(
        positionLocal,
        normalLocal,
        vec3(...divisions(item, id === "wavelets")),
        object,
        screenUV.x,
        split,
        Number(item.bank || (id === "wavelets" && item.kind === "lamp")),
        map,
        map,
      );
    },
    paint:
      id === "wavelets"
        ? (u, v) => {
            painted ??= stripe(lastStripe ?? 0.4);
            const x = Math.max(0, Math.min(7, Math.floor(u * 8))),
              y = Math.max(0, Math.min(7, Math.floor(v * 8)));
            painted[y * 8 + x] = 1;
            paintDirty = true;
          }
        : null,
    clearPaint() {
      painted = Array(64).fill(0);
      paintDirty = true;
    },
    get needsUpdate() {
      return paintDirty;
    },
    step(enc, s) {
      if (!(s.first || s.dirty || cameraDirty || paintDirty)) return;
      if (id === "wavelets" && lastStripe !== undefined && lastStripe !== s.a)
        painted = null;
      lastStripe = s.a;
      paintDirty = cameraDirty = false;
      const request = {
        id,
        a: s.a,
        b: s.b,
        variant: s.variant,
        items: s.items,
        camera,
        pattern: painted?.slice(),
        releases: s.releaseCount || 1,
      };
      if (busy) {
        if (
          pending &&
          id === "rotor" &&
          pending.a === request.a &&
          pending.b === request.b
        )
          request.releases += pending.releases;
        pending = request;
      } else send(request);
    },
    dispose() {
      disposed = true;
      worker.terminate();
      atlas.dispose();
      resolve();
    },
  };
}
