import * as T from "three/webgpu";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
export function workshop(scene, keep, detector, id) {
  const root = new T.Group();
  scene.add(root);
  const mat = (color, roughness = 0.7, metalness = 0.12) =>
    keep(new T.MeshStandardMaterial({ color, roughness, metalness }));
  const black = mat(0x232c30, 0.36, 0.38),
    metal = mat(0x899697, 0.36, 0.35),
    chalk = mat(0xd1c8b3, 0.64, 0.04),
    porcelain = mat(0xe1d9c9, 0.36, 0.05),
    dark = mat(0x3b4144, 0.52, 0.25);
  const basic = (color, options = {}) =>
    keep(new T.MeshBasicMaterial({ color, ...options }));
  const monitor = basic(0xffffff, { map: detector, side: T.DoubleSide });
  const shapeCache = new Map();
  function mesh(geo, material, p, parent = root) {
    const m = new T.Mesh(geo, material);
    m.castShadow = !material.transparent;
    m.receiveShadow = material.isMeshStandardMaterial;
    m.position.set(...p);
    parent.add(m);
    return m;
  }
  function box(p, size, material = chalk, parent = root) {
    const key = size.join();
    let geo = shapeCache.get(key);
    if (!geo) {
      geo = keep(
        new RoundedBoxGeometry(
          ...size,
          1,
          Math.min(0.095, Math.min(...size) * 0.16),
        ),
      );
      shapeCache.set(key, geo);
    }
    return mesh(geo, material, p, parent);
  }
  function cylinder(p, r, height, material = metal, parent = root, r2 = r) {
    return mesh(
      keep(new T.CylinderGeometry(r, r2, height, 48)),
      material,
      p,
      parent,
    );
  }
  function plane(p, w, h, material, parent = root) {
    return mesh(keep(new T.PlaneGeometry(w, h)), material, p, parent);
  }
  function group(p, parent = root) {
    const g = new T.Group();
    g.position.set(...p);
    parent.add(g);
    return g;
  }
  function line(points, color, opacity = 1, parent = root) {
    const geo = keep(
      new T.BufferGeometry().setFromPoints(
        points.map((p) => new T.Vector3(...p)),
      ),
    );
    const l = new T.Line(
      geo,
      keep(
        new T.LineBasicMaterial({ color, transparent: opacity < 1, opacity }),
      ),
    );
    parent.add(l);
    return l;
  }
  // A soft contact shadow anchors instruments to the shared cutaway floor.
  const shadowSamples = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const u = Math.max(0, Math.abs((x + 0.5) / 32 - 1) - 0.62),
        v = Math.max(0, Math.abs((y + 0.5) / 32 - 1) - 0.62);
      shadowSamples[(y * 64 + x) * 4 + 3] = Math.round(
        100 * Math.exp(-38 * (u * u + v * v)),
      );
    }
  const shadowMap = keep(new T.DataTexture(shadowSamples, 64, 64));
  shadowMap.minFilter = shadowMap.magFilter = T.LinearFilter;
  shadowMap.needsUpdate = true;
  const shadowMat = basic(0x000000, {
    map: shadowMap,
    transparent: true,
    depthWrite: false,
  });
  function contact(x, z, w, d) {
    const patch = plane([x, 0.634, z], w, d, shadowMat);
    patch.rotation.x = -Math.PI / 2;
    patch.renderOrder = 1;
  }
  function bench(x, z, w, d, height) {
    contact(x, z, w * 1.2, d * 1.28);
    box([x, 0.77, z], [w - 0.45, 0.28, d - 0.45], black);
    box([x, 0.92 + (height - 0.92) / 2, z], [w, height - 0.92, d], dark);
    box([x, height + 0.07, z], [w + 0.12, 0.14, d + 0.12], metal);
  }
  function framed(center, w, h, material = monitor, parent = root) {
    const g = group(center, parent);
    box([0, 0, -0.18], [w + 0.56, h + 0.56, 0.42], black, g);
    plane([0, 0, 0.051], w, h, material, g);
    return g;
  }
  const hemi = new T.HemisphereLight(0xe3ecff, 0x867767, 0.9),
    sun = new T.DirectionalLight(0xffedcf, 2.55);
  const rim = new T.DirectionalLight(0xcce9ff, 1.0);
  rim.position.set(28, 13, -20);
  sun.position.set(4, 34, 38);
  sun.target.position.set(19, 1, 15);
  root.add(hemi, sun, sun.target, rim);
  if (id !== "rank-one") {
    sun.castShadow = true;
    const shadow = keep(sun.shadow);
    Object.assign(shadow.camera, {
      left: -25,
      right: 25,
      top: 25,
      bottom: -25,
      near: 0.5,
      far: 90,
    });
    shadow.camera.updateProjectionMatrix();
    shadow.mapSize.set(1024, 1024);
    shadow.bias = -0.0004;
    shadow.normalBias = 0.05;
    shadow.radius = 3;
    shadow.autoUpdate = false;
    shadow.needsUpdate = true;
    const catcher = keep(
      new T.ShadowMaterial({ opacity: 0.42, depthWrite: false }),
    );
    const floor = plane([20, 0.642, 16], 39.8, 31.78, catcher);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.castShadow = false;
    floor.raycast = () => {};
    // Wall receivers keep the room's simulation color visible through shadows.
    const back = plane([20, 5.58, 0.921], 39.8, 9.85, catcher),
      left = plane([0.925, 6.8, 16], 31.7, 12, catcher);
    left.rotation.y = Math.PI / 2;
    for (const wall of [left, back]) {
      wall.receiveShadow = true;
      wall.castShadow = false;
      wall.raycast = () => {};
    }
  }
  return {
    root,
    sun,
    keep,
    mat,
    black,
    metal,
    chalk,
    porcelain,
    dark,
    basic,
    monitor,
    mesh,
    box,
    cylinder,
    plane,
    group,
    line,
    bench,
    framed,
    contact,
  };
}
