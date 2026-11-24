import * as T from "three/webgpu";
import {
  positionWorld,
  positionLocal,
  texture,
  uniform,
  vec2,
  vec3,
} from "three/tsl";
import { rooms } from "./rooms.js";
import { workshop } from "./workshop.js";
import { mosaicSize, mosaicAspect, stroke } from "./mosaic.js";

const layouts = {
  talbot: [256, 256, [8, 6, 15], [0.09, 0.55, 0.16]],
  fluorescence: [128, 96, [12, 5, 14], [0.29, 0.17, 0.44]],
  winding: [160, 128, [26, 3, 18], [0.45, 0.24, 0.1]],
  mosaic: [256, 96, [21, 5, 6], [0.59, 0.43, 0.16]],
  photoelastic: [192, 128, [19, 7, 12], [0.43, 0.38, 0.31]],
  folded: [51, 11, [24, 5, 22], [0.06, 0.51, 0.32]],
  "rank-one": [12, 8, [8, 7, 10], [0.56, 0.42, 0.24]],
  nlos: [48, 48, [21, 6, 3], [0.13, 0.4, 0.49]],
};
export function createInstrument(id, report, fail) {
  const [width, height, center, wash] = layouts[id];
  const pixels = new Uint16Array(width * height * 4);
  const detector = new T.DataTexture(
    pixels,
    width,
    height,
    T.RGBAFormat,
    T.HalfFloatType,
  );
  detector.colorSpace = T.LinearSRGBColorSpace;
  detector.magFilter = detector.minFilter = T.LinearFilter;
  detector.needsUpdate = true;
  const ambient = uniform(new T.Vector3(...wash));
  const light = ambient.mul(
    positionWorld
      .sub(vec3(...center))
      .length()
      .mul(0.135)
      .pow(2)
      .add(1)
      .reciprocal(),
  );
  const fieldNode = texture(
    detector,
    vec2(positionLocal.x.add(0.5), positionLocal.z.negate().add(0.5)),
  ).rgb;
  let rig,
    work,
    state,
    brush,
    lastPreset,
    painting = false,
    fresh = false,
    disposed = false,
    busy = false,
    pending,
    lastRay;
  const pointerPlane = new T.Plane(new T.Vector3(0, 1, 0), 0),
    hitPosition = new T.Vector3();
  let startAxis, startValue, resolve, reject;
  const ready = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  const worker = new Worker(new URL("./worker.js", import.meta.url), {
    type: "module",
  });
  function send(s) {
    busy = true;
    state = s;
    worker.postMessage(s);
  }
  function failure(message) {
    if (disposed) return;
    const e = new Error(message);
    reject(e);
    fail(e);
  }
  worker.onerror = (e) => failure(e.message);
  worker.onmessage = ({ data }) => {
    if (disposed) return;
    if (data.error) {
      failure(data.error);
      return;
    }
    detector.image.data = data.pixels;
    detector.needsUpdate = true;
    rig.update(state, data);
    if (work.sun) work.sun.shadow.needsUpdate = true;
    if (id === "fluorescence")
      ambient.value.set(
        0.12 + 0.6 * data.colors[2][0],
        0.06 + 0.4 * data.colors[1][1],
        0.11 * state.a,
      );
    if (id === "winding")
      ambient.value.set(...data.colors[32].map((v) => v * 0.8));
    if (id === "mosaic")
      ambient.value.set(...wash.map((v) => v * (state.variant ? 0.5 : 1)));
    if (id === "rank-one") ambient.value.set(...wash.map((v) => v * state.b));
    report(data.info);
    fresh = true;
    resolve();
    busy = false;
    if (pending) {
      const next = pending;
      pending = null;
      send(next);
    }
  };
  let brushDirty = false,
    brushVersion = 0,
    brushRadius = 2,
    lastOpticalState;
  function paint(hit) {
    if (!hit?.uv) return;
    brush ??= new Float32Array(mosaicSize * mosaicSize);
    const point = hit.uv;
    if (lastRay) {
      const count = Math.ceil(lastRay.distanceTo(point) * mosaicSize);
      for (let j = 1; j < count; j++)
        stroke(
          brush,
          lastRay.x + ((point.x - lastRay.x) * j) / count,
          lastRay.y + ((point.y - lastRay.y) * j) / count,
          brushRadius,
        );
    }
    stroke(brush, point.x, point.y, brushRadius);
    lastRay = point.clone();
    brushDirty = true;
  }
  function intersect(ray) {
    return ray
      .intersectObjects(work.root.children, true)
      .find(
        (h) => h.object.isMesh && h.object.visible && h.object.parent.visible,
      );
  }
  return {
    onDemand: true,
    light,
    fieldNode,
    fieldAspect: {
      talbot: 1,
      fluorescence: 8.6 / 7.6,
      winding: 40 / 32,
      mosaic: mosaicAspect,
      photoelastic: 1.5,
      folded: 4.64,
      "rank-one": 40 / 32,
      nlos: 0.72 / 0.52,
    }[id],
    ready,
    mount(scene, keep) {
      work = workshop(scene, keep, detector, id);
      rig = rooms[id](work);
      return work.root;
    },
    begin(ray) {
      if (!state || !(rig.pick || rig.paint)) return false;
      const hit = intersect(ray);
      if (!hit) return false;
      if (hit.object === rig.paint) {
        painting = true;
        lastRay = null;
        paint(hit);
        return true;
      }
      if (!rig.pick) return false;
      let node = hit.object;
      while (node && node !== rig.pick) node = node.parent;
      if (!node) return false;
      pointerPlane.constant = -hit.point.y;
      startAxis = hit.point[rig.axis];
      startValue = state.a;
      return true;
    },
    move(ray, changeControl) {
      if (painting) {
        const hit = intersect(ray);
        if (hit?.object === rig.paint) paint(hit);
        else lastRay = null;
      } else if (ray.ray.intersectPlane(pointerPlane, hitPosition))
        changeControl(
          0,
          startValue +
            (hitPosition[rig.axis] - startAxis) * rig.sensitivity(state),
        );
    },
    end() {
      painting = false;
      lastRay = null;
    },
    get needsUpdate() {
      return brushDirty;
    },
    step(_enc, s) {
      if (!(s.first || s.dirty || brushDirty)) return;
      if (id === "mosaic" && s.a !== lastPreset) {
        brush = null;
        lastPreset = s.a;
      }
      if (id === "mosaic") {
        brushRadius = s.b;
        const key = s.a + "," + s.variant;
        if (!brushDirty && key === lastOpticalState) return;
        lastOpticalState = key;
        if (brushDirty) brushVersion++;
      }
      brushDirty = false;
      const message = {
        id,
        a: s.a,
        b: s.b,
        variant: s.variant,
        brush: brush?.slice(),
        brushVersion,
      };
      if (busy) pending = message;
      else send(message);
    },
    takeFrame() {
      const val = fresh;
      fresh = false;
      return val;
    },
    dispose() {
      disposed = true;
      worker.terminate();
      detector.dispose();
      resolve();
    },
  };
}
