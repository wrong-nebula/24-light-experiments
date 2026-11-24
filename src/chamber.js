import * as T from "three/webgpu";
import {
  texture3D,
  texture,
  positionWorld,
  normalWorld,
  uniform,
  vec3,
  vec4,
  wgslFn,
} from "three/tsl";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { createFinishes, detailBlock } from "./bounce/fixtures.js";
import { addBounceGeometry, isBounceStudy } from "./bounce/studies.js";
import { raySegments } from "./ray-paths.js";
import { addAxisHint } from "./axis-hint.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const neutral = [0.74, 0.76, 0.68],
  mint = [0.52, 0.82, 0.57],
  warm = [0.86, 0.59, 0.36];
function box(c, h, tint = neutral, kind = "block") {
  return { c, h, tint, kind };
}
export function geometry(id, a, b, panel) {
  const items = [
    box([20, -0.55, 16], [20, 1.17, 16], neutral, "floor"),
    box([0.37, 6.5, 16], [0.53, 6.5, 16], neutral, "wall"),
    box([20, 5.4, 0.37], [20, 5.4, 0.53], neutral, "wall"),
  ];
  const add = (x, h, z, w, d, t) =>
    items.push(box([x, h / 2, z], [w / 2, h / 2, d / 2], t));
  if (id === "lattice") {
    add(17, 10, 6 + b * 19, 1.6, 11, mint);
    for (let k = 0; k < 4; k++) add(27 + k * 2.5, 2 + k * 1.7, 6, 2.5, 8, warm);
    add(31, 2.2, 22, 7, 6);
  }
  if (id === "gaussians") {
    add(20, 7, 15, 2, 9, warm);
    add(28, 5, 10, 5, 5);
    add(10, 2.5, 21, 7, 6, mint);
  }
  if (id === "msdf") {
    add(18, 2, 14, 8, 7);
    add(24, 4, 12, 4, 5);
    add(26, 6, 10, 2.5, 3);
  }
  if (id === "flood") {
    for (let k = 0; k < 3; k++) add(16, b, 6 + k * 9, 2.2, 4);
    add(27, b * 0.66, 19, 6, 2.5);
  }
  if (id === "nca") {
    add(17, 6.5, 6 + b * 19, 5, 6, warm);
    add(27, 3.4, 15, 2.5, 12);
  }
  if (id === "reverb") {
    for (let k = 0; k < 4; k++) add(12 + k * 6, 4 + k, 5, 2.4, 4);
    add(22, 4.5, 21, 8, 4);
  }
  if (id === "edges") {
    add(9, 4, 16 - a / 2, 0.55, 0.55);
    add(9, 4, 16 + a / 2, 0.55, 0.55);
  }
  if (id === "gravity") {
    add(16, 7, 13, 2.8, 3.4);
    add(29, 5, 22, 2.8, 3.4);
  }
  if (isBounceStudy(id)) addBounceGeometry(items, id, a, b, panel);
  return items;
}

const surface =
  wgslFn(`fn finishSurface(p:vec3f,n:vec3f,base:vec3f,light:vec3f,kind:f32)->vec3f{
 let key=.37+.42*max(0.,dot(n,normalize(vec3f(.5,.85,.3))))+.16*max(0.,dot(n,normalize(vec3f(-1.,.45,.1))));
 var uv=p.xz;if(abs(n.x)>.55){uv=p.zy;}else if(abs(n.z)>.55){uv=p.xy;}
 let tile=abs(fract(uv/4.)-.5);let footprint=max(fwidth(uv/4.),vec2f(.0002));
 let joint=clamp(max((tile.x-.486)/footprint.x,(tile.y-.486)/footprint.y),0.,1.);
 let grain=fract(sin(dot(floor(p*12.),vec3f(12.99,78.23,37.7)))*43758.5);
 let seams=1.-.20*joint*select(.28,1.,kind<2.);
 let shade=base*key*seams*(.97+.05*grain);
 return shade+light*(.45+.63*base)*seams;
}`);
const integrate =
  wgslFn(`fn volume(p:vec3f,d:vec3f,t:texture_3d<f32>,s:sampler,power:f32)->vec3f{
 let dims=vec3f(40,18,32);let inv=1./(d+vec3f(.000001));let near=(vec3f(0)-p)*inv;let far=(dims-p)*inv;
 let lo=min(near,far);let hi=max(near,far);let entry=max(0.,max(lo.x,max(lo.y,lo.z)));let end=min(hi.x,min(hi.y,hi.z));
 let len=max(0.,end-entry);let ds=len/28.;var sum=vec3f(0);
 for(var i=0;i<28;i++){let q=p+d*(entry+(f32(i)+.5)*ds);sum+=textureSampleLevel(t,s,q/dims,0).rgb;}
 return sum*ds*power;
}`);
const texcoord = positionWorld.div(vec3(40, 18, 32));
export function chamber(
  renderer,
  canvas,
  field,
  map,
  id,
  solver,
  items,
  changeControl,
) {
  const scene = new T.Scene(),
    camera = new T.OrthographicCamera(-30, 30, 24, -24, 0.1, 400),
    controls = new OrbitControls(camera, canvas);
  const target = new T.Vector3(19, 4.2, 15);
  camera.position.copy(target).add(new T.Vector3(49, 36, 57));
  controls.target.copy(target);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minZoom = 0.65;
  controls.maxZoom = 2.4;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.minPolarAngle = 0.08;
  const direction = uniform(new T.Vector3()),
    fog = uniform(id === "gravity" ? 0.046 : id === "lattice" ? 0.034 : 0.012);
  const vol = texture3D(field);
  const samplePos = positionWorld
    .add(normalWorld.mul(id === "gravity" ? 0.12 : 0.62))
    .div(vec3(40, 18, 32));
  let light =
    solver.light ??
    (solver.planar
      ? texture(map, positionWorld.xz.div(vec3(40, 32, 1).xy)).rgb
      : texture3D(field, samplePos).rgb);
  const volume =
    !solver.planar && !solver.light
      ? integrate(positionWorld, direction, vol, vol, fog)
      : vec3(0);
  const assets = [],
    meshes = [];
  const keep = (x) => (assets.push(x), x);
  function material(base, kind, incoming = light, mist = volume) {
    const m = keep(new T.MeshBasicNodeMaterial());
    m.colorNode = surface(
      positionWorld,
      normalWorld,
      vec3(...base),
      incoming,
      kind,
    ).add(mist);
    return m;
  }
  const bases = [
    [0.145, 0.16, 0.14],
    [0.14, 0.155, 0.145],
    [0.205, 0.215, 0.185],
    [0.235, 0.2, 0.16],
  ];
  const mats = bases.map((v, i) => material(v, i));
  const unit = keep(new T.BoxGeometry(1, 1, 1)),
    fixed = [];
  function addBox(c, h, m) {
    const obj = new T.Mesh(unit, m);
    obj.position.set(...c);
    obj.scale.set(h[0] * 2, h[1] * 2, h[2] * 2);
    scene.add(obj);
    return obj;
  }
  function fixedBox(c, h, m) {
    fixed.push(addBox(c, h, m));
  }
  const dark = keep(new T.MeshBasicMaterial({ color: 0x313a35 })),
    metal = keep(new T.MeshBasicMaterial({ color: 0x566259 }));
  const rim = keep(new T.MeshBasicMaterial({ color: 0x839281 }));
  const lineMat = keep(
    new T.LineBasicMaterial({
      color: 0x889186,
      transparent: true,
      opacity: 0.24,
    }),
  );
  const wire = keep(new T.EdgesGeometry(unit));
  // Structural plinth, wall channels and scale notches help read the chamber dimensions.
  fixedBox([20, -1.35, 16], [20.32, 0.32, 16.32], dark);
  fixedBox([20, -1.68, 16], [19.82, 0.12, 15.82], metal);
  for (let x = 2; x < 40; x += 2) {
    fixedBox(
      [x, -0.63, 32.02],
      [0.029, x % 10 === 0 ? 0.32 : 0.14, 0.035],
      rim,
    );
  }
  for (let z = 2; z < 32; z += 2) {
    fixedBox(
      [40.02, -0.63, z],
      [0.035, z % 10 === 0 ? 0.32 : 0.14, 0.029],
      rim,
    );
  }
  fixedBox([20, 10.83, 0.37], [20.12, 0.1, 0.58], metal);
  fixedBox([0.37, 13.03, 16], [0.57, 0.1, 16.1], metal);
  for (let x = 4; x < 40; x += 8) {
    fixedBox([x, 5.4, 0.96], [0.045, 5.4, 0.05], metal);
  }
  const emitColor =
    {
      lattice: 0xd8ff67,
      gaussians: 0xff994a,
      msdf: 0xb5e5ff,
      flood: 0xffad47,
      nca: 0x80ffc2,
      reverb: 0xe5a1ff,
      edges: 0xffd8a0,
      gravity: 0x88ffef,
    }[id] ?? 0xffffff;
  const glowing = keep(new T.MeshBasicMaterial({ color: emitColor }));
  const lamps = [];
  if (["lattice", "nca", "reverb", "gravity"].includes(id)) {
    for (const z of [7.5, 14.5, 21.5]) {
      fixedBox([1.04, 7.4, z], [0.24, 4.6, 1.42], dark);
      lamps.push(addBox([1.34, 7.4, z], [0.1, 4.1, 1.03], glowing));
      for (let y = 4.3; y < 11.5; y += 1.1)
        fixedBox([1.46, y, z], [0.045, 0.041, 1.05], metal);
    }
  }
  if (id === "flood") {
    lamps.push(addBox([5, 0.7, 14], [1, 0.09, 5], glowing));
    const blue = keep(new T.MeshBasicMaterial({ color: 0x7abaff }));
    lamps.push(addBox([30, 0.7, 4], [4, 0.09, 1], blue));
  }
  let emitter;
  if (id === "edges") {
    emitter = addBox([9, 8.5, 16], [0.11, 3.5, 8], glowing);
  }
  const planMat = keep(new T.MeshBasicNodeMaterial());
  planMat.colorNode =
    solver.fieldNode ??
    (
      solver.surfaceLight?.(0, items[0]) ??
      solver.light ??
      (solver.planar
        ? texture(map, positionWorld.xz.div(vec3(40, 32, 1).xy)).rgb
        : texture3D(field, vec3(texcoord.x, 0.3, texcoord.z)).rgb)
    )
      .mul(1.2)
      .add(0.012);
  const slice = addBox([20, 0.7, 16], [20, 0.04, 16], planMat);
  if (solver.fieldAspect) {
    const width = Math.min(40, 32 * solver.fieldAspect);
    slice.scale.set(width, 0.08, width / solver.fieldAspect);
  }
  slice.visible = false;

  const finishes = solver.patches ? createFinishes(keep) : null;
  if (finishes) {
    fixedBox([20, 0.83, 1.0], [19.3, 0.17, 0.07], finishes.shell);
    fixedBox([1.0, 0.83, 16], [0.07, 0.17, 15.4], finishes.shell);
    for (const z of [4.6, 11.7, 18.8, 25.9]) {
      fixedBox([0.94, 6.65, z], [0.035, 6.16, 0.035], finishes.edge);
    }
    if (id === "antiradiance" || id === "completion") {
      for (const x of [17.15, 18.65])
        fixedBox([x, 0.7, 16.6], [0.075, 0.06, 9.0], finishes.shell);
    }
  }
  for (let i = 0; i < items.length; i++) {
    const o = items[i],
      m = addBox(
        o.c,
        o.h,
        solver.patches
          ? material(
              o.tint.map((c) => c * 0.205),
              i < 3 ? 0 : 2,
              solver.surfaceLight(i, o).mul(2.0),
              vec3(0),
            )
          : mats[i === 0 ? 0 : i < 3 ? 1 : o.tint === warm ? 3 : 2],
      );
    if (finishes && i >= 3) {
      const [x, y, z] = o.h,
        geo = keep(
          new RoundedBoxGeometry(
            2 * x,
            2 * y,
            2 * z,
            1,
            Math.min(0.12, x * 0.24, y * 0.24, z * 0.24),
          ),
        );
      geo.scale(0.5 / x, 0.5 / y, 0.5 / z);
      m.geometry = geo;
      detailBlock(m, o, id, unit, finishes);
    } else {
      const e = new T.LineSegments(wire, lineMat);
      m.add(e);
    }
    meshes.push(m);
  }
  const shadowsBefore = renderer.shadowMap.enabled;
  if (solver.mount) renderer.shadowMap.enabled = id !== "rank-one";
  const instrument = solver.mount?.(scene, keep);
  let manipulating = false;
  const reflector = items.findIndex((o) => o.kind === "reflector");
  const paintSurface = solver.paint
    ? meshes[items.findIndex((o) => o.kind === "lamp")]
    : null;
  let painting = false;
  let handle,
    dragObject,
    dragging = false;
  const hasLobe = id === "gaussians",
    hasLens = id === "gravity";
  if (hasLobe || hasLens) {
    handle = new T.Group();
    scene.add(handle);
    const guideMat = keep(
      new T.LineBasicMaterial({
        color: hasLobe ? 0xffbe87 : 0x8ce7de,
        transparent: true,
        opacity: 0.62,
      }),
    );
    const ring = keep(
      new T.BufferGeometry().setFromPoints(
        Array.from(
          { length: 65 },
          (_, i) =>
            new T.Vector3(
              Math.cos((i * Math.PI) / 32),
              Math.sin((i * Math.PI) / 32),
              0,
            ),
        ),
      ),
    );
    for (let j = 0; j < 3; j++) {
      const circle = new T.Line(ring, guideMat);
      if (j === 1) circle.rotation.x = Math.PI / 2;
      if (j === 2) circle.rotation.y = Math.PI / 2;
      handle.add(circle);
    }
    const pickMat = keep(new T.MeshBasicMaterial({ visible: false }));
    dragObject = new T.Mesh(keep(new T.SphereGeometry(1, 12, 8)), pickMat);
    handle.add(dragObject);
  } else if (id === "lattice" || id === "nca") {
    dragObject = meshes[3];
  } else if (reflector >= 0) {
    dragObject = meshes[reflector];
  }
  const dragGuide = dragObject
    ? {
        object: handle ?? dragObject,
        axis: "z",
        anchor: [0, handle ? 1 : 0.5, 0],
      }
    : solver.dragGuide;
  const axisHint = dragGuide && addAxisHint(scene, keep, dragGuide);
  let paths;
  if (hasLens) {
    paths = new T.LineSegments(
      new T.BufferGeometry(),
      keep(
        new T.LineBasicMaterial({
          color: 0xc3fff8,
          transparent: true,
          opacity: 0.59,
        }),
      ),
    );
    scene.add(paths);
  }
  const pointer = new T.Vector2(),
    ray = new T.Raycaster(),
    dragPlane = new T.Plane(new T.Vector3(0, 1, 0), 0),
    hit = new T.Vector3();
  let startZ = 0;
  function pointRay(e) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      1 - ((e.clientY - rect.top) / rect.height) * 2,
    );
    ray.setFromCamera(pointer, camera);
  }
  function start(e) {
    if (plan || e.button !== 0 || !e.isPrimary) return;
    pointRay(e);
    if (solver.begin?.(ray)) {
      manipulating = true;
      controls.enabled = false;
      canvas.setPointerCapture(e.pointerId);
      e.stopImmediatePropagation();
      return;
    }
    if (!dragObject) return;
    if (paintSurface) {
      const brush = ray.intersectObjects(meshes, false)[0];
      if (brush?.object === paintSurface && brush.face.normal.z > 0.5) {
        const local = paintSurface.worldToLocal(brush.point.clone());
        solver.paint(local.x + 0.5, local.y + 0.5);
        painting = true;
        controls.enabled = false;
        canvas.setPointerCapture(e.pointerId);
        e.stopImmediatePropagation();
        return;
      }
    }
    const result =
      reflector >= 0
        ? ray.intersectObjects(meshes, false)[0]
        : ray.intersectObject(dragObject, false)[0];
    if (!result || result.object !== dragObject) return;
    dragPlane.constant = -result.point.y;
    startZ = (handle ?? dragObject).position.z - result.point.z;
    dragging = true;
    controls.enabled = false;
    canvas.setPointerCapture(e.pointerId);
    e.stopImmediatePropagation();
  }
  function move(e) {
    if (manipulating) {
      pointRay(e);
      solver.move(ray, changeControl);
      return;
    }
    if (painting) {
      pointRay(e);
      const brush = ray.intersectObjects(meshes, false)[0];
      if (brush?.object === paintSurface && brush.face.normal.z > 0.5) {
        const local = paintSurface.worldToLocal(brush.point.clone());
        solver.paint(local.x + 0.5, local.y + 0.5);
      }
      return;
    }
    if (!dragging) return;
    pointRay(e);
    if (ray.ray.intersectPlane(dragPlane, hit)) {
      const z = hit.z + startZ;
      changeControl(
        reflector >= 0 ? 2 : hasLobe ? 0 : 1,
        T.MathUtils.clamp(
          reflector >= 0
            ? (z - items[reflector].travel[0]) / items[reflector].travel[1]
            : hasLobe
              ? (z - 5) / 20
              : (z - 6) / 19,
          0,
          1,
        ),
      );
    }
  }
  function end(e) {
    if (!dragging && !painting && !manipulating) return;
    if (manipulating) {
      solver.end();
      manipulating = false;
    }
    painting = false;
    dragging = false;
    controls.enabled = true;
    if (canvas.hasPointerCapture(e.pointerId))
      canvas.releasePointerCapture(e.pointerId);
  }
  canvas.addEventListener("pointerdown", start, true);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  let plan = false,
    width = 0,
    height = 0,
    lastCamera = null,
    redraw = true;
  function resize() {
    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (w <= 0 || h <= 0) return;
    if (w === width && h === height) return;
    width = w;
    height = h;
    redraw = true;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    const span = plan
      ? Math.max(40, 47 / aspect)
      : Math.max(45, (w < 650 ? 56 : 65) / aspect);
    camera.left = (-span * aspect) / 2;
    camera.right = -camera.left;
    camera.top = span / 2;
    camera.bottom = -span / 2;
    camera.updateProjectionMatrix();
  }
  function setPlan(value) {
    if (value === plan) return;
    plan = value;
    redraw = true;
    slice.visible = plan;
    if (instrument) instrument.visible = !plan;
    if (handle) handle.visible = !plan;
    if (paths) paths.visible = !plan && paths.userData.enabled;
    for (const o of [...meshes, ...fixed, ...lamps]) o.visible = !plan;
    if (emitter) emitter.visible = !plan;
    if (plan) {
      camera.updateMatrixWorld();
      solver.cameraChanged?.(camera, false);
      lastCamera = [
        camera.position.clone(),
        controls.target.clone(),
        camera.zoom,
      ];
      controls.target.set(20, 0.5, 16);
      camera.position.set(20, 85, 16.01);
      camera.zoom = 1;
    } else if (lastCamera) {
      camera.position.copy(lastCamera[0]);
      controls.target.copy(lastCamera[1]);
      camera.zoom = lastCamera[2];
    }
    controls.enableRotate = !plan;
    controls.update();
    width = 0;
    resize();
  }
  return {
    camera,
    controls,
    setPlan,
    resize,
    update(next, on, a, b, variant) {
      if (handle) {
        handle.position.set(
          hasLobe ? 15 : 23,
          hasLobe ? 5 : 3.2,
          hasLobe ? 5 + a * 20 : 6 + b * 19,
        );
        handle.scale.set(
          hasLobe ? 4.7 * b : 3.1,
          hasLobe ? 2 : 3.1,
          hasLobe ? 2 : 3.1,
        );
        if (hasLobe) handle.rotation.set(0, -0.34, -0.22);
      }
      if (paths) {
        paths.userData.enabled = Boolean(variant);
        paths.visible = !plan && Boolean(variant);
        if (variant) {
          paths.geometry.dispose();
          paths.geometry = new T.BufferGeometry();
          paths.geometry.setAttribute(
            "position",
            new T.BufferAttribute(raySegments(a, b, next), 3),
          );
        }
      }
      next.forEach((item, i) => {
        const m = meshes[i];
        m.rotation.y = item.yaw || 0;
        m.position.set(...item.c);
        m.scale.set(...item.h.map((v) => v * 2));
      });
      if (emitter) emitter.scale.z = next[4].c[2] - next[3].c[2];
      for (const m of lamps)
        m.material.color.setHex(
          on
            ? m === lamps[1] && id === "flood"
              ? 0x7abaff
              : emitColor
            : 0x354034,
        );
    },
    prepare() {
      resize();
      const moved = controls.update();
      camera.updateMatrixWorld();
      const changed = redraw || moved;
      redraw = false;
      return changed;
    },
    draw() {
      direction.value.copy(camera.position).sub(controls.target).normalize();
      axisHint?.update(camera, height, plan);
      renderer.render(scene, camera);
    },
    resetCamera() {
      if (plan) return;
      controls.target.copy(target);
      camera.position.copy(target).add(new T.Vector3(49, 36, 57));
      camera.zoom = 1;
      camera.updateProjectionMatrix();
      controls.update();
    },
    dispose() {
      if (instrument) renderer.shadowMap.enabled = shadowsBefore;
      canvas.removeEventListener("pointerdown", start, true);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", end);
      canvas.removeEventListener("pointercancel", end);
      paths?.geometry.dispose();
      controls.dispose();
      scene.traverse((o) => {
        if (o.isInstancedMesh) o.dispose();
      });
      assets.forEach((x) => x.dispose());
      scene.clear();
    },
  };
}
