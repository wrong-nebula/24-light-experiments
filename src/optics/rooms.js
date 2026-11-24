import * as T from "three/webgpu";
import {
  uniform,
  texture,
  uv,
  vec2,
  vec3,
  reflectVector,
  positionWorld,
  attribute,
  cameraPosition,
  wgslFn,
} from "three/tsl";
import { talbotDistance } from "./diffraction.js";
import { mirrorPosition, facets } from "./mosaic.js";
import { strips, across } from "./fold.js";
import { stairBlocks } from "./radiosity.js";
import { targetWorld } from "./transient.js";
const tau = 2 * Math.PI;
function talbot(w) {
  const {
    box,
    bench,
    group,
    framed,
    basic,
    black,
    metal,
    porcelain,
    cylinder,
    root,
  } = w;
  bench(20, 15, 29, 12, 2.1);
  for (const z of [11, 19]) box([20, 2.42, z], [29, 0.38, 0.36], metal);
  // Source, grating and translucent detector share the x-axis of the bench.
  const green = basic(0x89ff9e);
  const laser = cylinder([4.9, 6.8, 15], 1.35, 4.6, black);
  laser.rotation.z = -Math.PI / 2;
  const lens = cylinder([7.28, 6.8, 15], 1.06, 0.21, green);
  lens.rotation.z = -Math.PI / 2;
  box([5.1, 3.93, 15], [2, 3.4, 1.8], metal);
  const gr = group([9, 6.8, 15]);
  gr.rotation.y = Math.PI / 2;
  const etched = basic(0x93d89c, {
    transparent: true,
    opacity: 0.35,
    side: T.DoubleSide,
    depthWrite: false,
  });
  w.plane([0, 0, 0], 8.9, 6.8, etched, gr);
  const bars = Array.from({ length: 13 }, () =>
    box([0, 0, 0.06], [1, 6.8, 0.13], black, gr),
  );
  for (const sign of [-1, 1]) {
    box([sign * 4.65, 0, 0], [0.27, 7.3, 0.38], metal, gr);
    box([0, sign * 3.49, 0], [9.55, 0.22, 0.38], metal, gr);
  }
  const card = group([16, 6.8, 15]);
  card.rotation.y = Math.PI / 2;
  const frame = framed([0, 0, 0], 10.8, 7.2, w.monitor, card);
  box([0, -4.07, 0], [11.2, 0.65, 1.16], porcelain, card);
  for (let i = 0; i <= 24; i++)
    box([10 + i, 2.26, 20.52], [0.075, 0.1, i % 4 === 0 ? 0.8 : 0.36], black);
  // A translucent longitudinal section shows the fractional images between
  // the grating and the detector at a glance; both sample the same solution.
  const carpet = w.keep(
    new T.DataTexture(
      new Uint16Array(161 * 128 * 4),
      161,
      128,
      T.RGBAFormat,
      T.HalfFloatType,
    ),
  );
  carpet.minFilter = carpet.magFilter = T.LinearFilter;
  carpet.needsUpdate = true;
  const distance = uniform(0),
    sectionMat = w.keep(
      new T.MeshBasicNodeMaterial({
        transparent: true,
        depthWrite: false,
        side: T.DoubleSide,
      }),
    );
  const reading = texture(
    carpet,
    vec2(
      uv()
        .x.mul(distance)
        .mul(160 / 161)
        .add(0.5 / 161),
      uv().y,
    ),
  ).g;
  sectionMat.colorNode = vec3(0.11, 0.95, 0.27);
  sectionMat.opacityNode = reading.mul(0.24).clamp(0, 0.48);
  const section = w.plane([15, 6.74, 15], 1, 8.9, sectionMat);
  section.rotation.x = -Math.PI / 2;
  section.raycast = () => {};
  for (const z of [11, 19])
    box([0, -3.9, z - 15], [0.66, 1.22, 1.28], metal, card);
  return {
    pick: frame,
    axis: "x",
    sensitivity: (s) => (1.25 * talbotDistance(s.b)) / 23,
    update(s, m) {
      if (m.carpet) {
        carpet.image.data = m.carpet;
        carpet.needsUpdate = true;
      }
      const pitch = (8.9 * s.b) / 800,
        max = 1.25 * talbotDistance(s.b);
      card.position.x = 10.2 + (23 * s.a) / max;
      distance.value = s.a / max;
      section.visible = s.a > 0;
      section.scale.x = card.position.x - 9;
      section.position.x = (card.position.x + 9) / 2;
      bars.forEach((bar, k) => {
        const left = -4.45 + pitch * (k + 0.5),
          width = Math.min(pitch * 0.5, 4.45 - left);
        bar.visible = width > 0;
        if (bar.visible) {
          bar.position.x = left + width / 2;
          bar.scale.x = width;
        }
      });
    },
  };
}
function relay(w) {
  const { box, bench, framed, basic, black, metal, chalk } = w;
  bench(18.5, 14.5, 29, 19, 1.42);
  function pigment() {
    const mat = w.keep(new T.MeshBasicNodeMaterial()),
      radiance = uniform(new T.Vector3()),
      substrate = uniform(new T.Vector3());
    const center = uv().sub(vec2(0.46, 0.55));
    const illumination = center.dot(center).mul(-5.5).exp();
    mat.colorNode = substrate.add(radiance.mul(illumination));
    return { mat, radiance, substrate };
  }
  const first = pigment(),
    second = pigment(),
    p1 = first.mat,
    p2 = second.mat;
  const tile1 = framed([10.8, 5.4, 16.6], 7.0, 6.0, p1),
    tile2 = framed([22.4, 5.4, 8.9], 6.2, 6.0, p2);
  tile1.rotation.y = 0.72;
  tile2.rotation.y = -0.52;
  for (const tile of [tile1, tile2]) {
    for (const side of [-1, 1])
      box([side * 2.34, -3.45, -0.18], [0.32, 1.1, 0.45], metal, tile);
    box([0, -3.83, -0.18], [6, 0.4, 1.55], black, tile);
  }
  for (const [x, z, h, d] of [
    [6, 10, 6, 7],
    [15.1, 8.7, 7.2, 12],
    [24.1, 21.2, 5.2, 5.5],
  ]) {
    box([x, 1.6 + h / 2, z], [0.76, h, d], chalk);
    box([x, 1.65 + h, z], [0.87, 0.18, d + 0.14], metal);
  }
  const lamp = framed([6, 6, 2], 4.7, 6.4, basic(0x9d78dc));
  for (let j = 0; j < 6; j++)
    box([0, -2.7 + j, 0.18], [4.7, 0.085, 0.1], black, lamp);
  framed([31.2, 5.4, 15], 8.6, 7.6);
  return {
    update(s, m) {
      lamp.children[1].material.color.setRGB(
        0.015 + 0.36 * s.a,
        0.012 + 0.16 * s.a,
        0.028 + 0.78 * s.a,
      );
      for (const [i, sample] of [first, second].entries()) {
        const green = (i === 0) !== Boolean(s.variant);
        const c = m.colors[i + 1];
        sample.radiance.value.set(c[0] * 2.8, c[1] * 2.45, c[2]);
        sample.substrate.value.set(
          green ? 0.022 : 0.105,
          green ? 0.078 : 0.022,
          0.025,
        );
      }
    },
  };
}
function winding(w) {
  const {
    root,
    keep,
    cylinder,
    box,
    metal,
    black,
    porcelain,
    dark,
    basic,
    mesh,
  } = w;
  w.contact(20, 16, 29, 29);
  cylinder([20, 0.96, 16], 12.65, 0.62, dark);
  const mapped = keep(new T.BufferGeometry()),
    verts = [],
    indices = [];
  for (let i = 0; i <= 128; i++) {
    const t = (i * tau) / 128;
    for (const r of [5.8, 11.9])
      verts.push(20 + r * Math.cos(t), 1.31, 16 + r * Math.sin(t));
    if (i < 128) {
      const k = 2 * i;
      indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  mapped.setIndex(indices);
  mapped.setAttribute("position", new T.Float32BufferAttribute(verts, 3));
  const colors = new T.Float32BufferAttribute(
    new Float32Array(verts.length),
    3,
  );
  mapped.setAttribute("color", colors);
  mesh(
    mapped,
    basic(0xffffff, { vertexColors: true, side: T.DoubleSide }),
    [0, 0, 0],
  );
  cylinder([20, 5.15, 16], 3.35, 8.4, w.mat(0x5a6263, 0.35, 0.42));
  cylinder([20, 9.43, 16], 3.5, 0.25, metal);
  for (const y of [1.82, 2.2, 8.55, 8.89])
    cylinder([20, y, 16], 3.4, 0.13, metal);
  for (let i = 0; i < 12; i++) {
    const a = (i * tau) / 12;
    const seam = box(
      [20 + 3.36 * Math.cos(a), 5.32, 16 + 3.36 * Math.sin(a)],
      [0.05, 6.26, 0.075],
      metal,
    );
    seam.rotation.y = -a;
  }
  cylinder([20, 1.47, 16], 5.62, 0.45, black);
  for (let i = 0; i < 32; i++) {
    const t = (i * tau) / 32,
      r = 12.13,
      h = Math.sin(t) < 0.15 ? 2.1 : 0.48;
    const curb = box(
      [20 + r * Math.cos(t), 1.3 + h / 2, 16 + r * Math.sin(t)],
      [0.55, h, 2.33],
      i % 4 === 0 ? metal : porcelain,
    );
    curb.rotation.y = -t;
  }
  box([32.1, 1.83, 16], [0.8, 2.3, 2.55], black);
  const source = box([32.1, 2.35, 16], [0.47, 2.9, 2], basic(0xffd08f));
  const reader = box([8.3, 2.6, 16], [0.38, 2.5, 2.5], basic(0xffffff));
  return {
    update(s, m) {
      for (let i = 0; i <= 128; i++) {
        const a = m.colors[Math.floor(i / 2) % 64],
          b = m.colors[Math.ceil(i / 2) % 64];
        for (const k of [2 * i, 2 * i + 1])
          colors.setXYZ(k, ...a.map((v, c) => 0.016 + (v + b[c]) * 0.68));
      }
      colors.needsUpdate = true;
      reader.material.color.setRGB(...m.colors[32].map((v) => 0.025 + 1.8 * v));
    },
  };
}
function mosaic(w) {
  const { bench, framed, box, black, metal, basic, keep, root } = w;
  bench(15.1, 18.1, 19.5, 16.4, 2.1);
  const screen = framed([22, 6.2, 1.869], 26, 8.6);
  const facetGeo = keep(new T.BoxGeometry(1.3, 0.12, 1.12));
  const mat = keep(
    new T.MeshStandardNodeMaterial({
      metalness: 0.68,
      roughness: 0.22,
      color: 0x729697,
    }),
  );
  // Reflection of two broad studio strips. Their movement across the facets
  // makes each computed tilt legible when orbiting or painting.
  const strip = reflectVector
    .dot(vec3(-0.19, 0.89, 0.41).normalize())
    .max(0)
    .pow(22);
  const glint = reflectVector
    .dot(vec3(0.66, 0.66, -0.36).normalize())
    .max(0)
    .pow(60);
  mat.emissiveNode = vec3(0.035, 0.057, 0.062)
    .add(vec3(0.82, 0.92, 0.97).mul(strip))
    .add(vec3(1.8, 1.3, 0.7).mul(glint));
  const mirrors = new T.InstancedMesh(facetGeo, mat, facets ** 2);
  mirrors.frustumCulled = false;
  root.add(mirrors);
  const object = new T.Object3D(),
    up = new T.Vector3(0, 1, 0),
    normal = new T.Vector3();
  const cover = box([19.53, 3.53, 18.04], [9.08, 0.28, 15.35], black);
  for (const x of [5.45, 24.9]) box([x, 2.45, 18.1], [0.2, 0.35, 16.6], metal);
  // The source is carried by a cantilever along the side of the mirror bed.
  for (const z of [10.4, 25.3]) box([4.65, 6.32, z], [0.45, 8.4, 0.56], metal);
  box([4.65, 10.48, 17.9], [1.6, 0.65, 16.3], black);
  box([4.68, 10.1, 17.9], [1.1, 0.095, 15.75], basic(0xffe1ad));
  return {
    paint: screen.children[1],
    update(s, m) {
      cover.visible = !!s.variant;
      m.normals.forEach((n, i) => {
        object.position.fromArray(mirrorPosition(i));
        object.quaternion.setFromUnitVectors(
          up,
          normal.fromArray(n || [0, 1, 0]),
        );
        object.updateMatrix();
        mirrors.setMatrixAt(i, object.matrix);
      });
      mirrors.instanceMatrix.needsUpdate = true;
      mirrors.castShadow = true;
    },
  };
}
function photoelastic(w) {
  const {
    bench,
    box,
    group,
    keep,
    mesh,
    black,
    metal,
    porcelain,
    framed,
    basic,
  } = w;
  bench(20, 15.4, 30, 9.4, 2);
  const shape = new T.Shape();
  shape.moveTo(-8.1, -5.4);
  shape.lineTo(8.1, -5.4);
  shape.lineTo(8.1, 5.4);
  shape.lineTo(-8.1, 5.4);
  shape.closePath();
  const hole = new T.Path();
  hole.absarc(0, 0, 1.674, 0, tau, true);
  shape.holes.push(hole);
  const geo = keep(new T.ShapeGeometry(shape, 60)),
    uv = geo.attributes.uv,
    pos = geo.attributes.position;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, pos.getX(i) / 16.2 + 0.5, pos.getY(i) / 10.8 + 0.5);
  mesh(geo, w.monitor, [19, 7.55, 15.2]);
  for (const x of [10.5, 27.5]) {
    box([x, 5.1, 15.15], [1.05, 5.85, 2.4], black);
    box([x, 7.6, 15.15], [1.55, 2.75, 2.55], metal);
  }
  const ram = group([29.8, 7.5, 15.1]);
  for (let i = 0; i < 7; i++)
    box([i * 0.39, 0, 0], [0.2, 1.08, 1.08], metal, ram);
  box([1.3, 0, 0], [3.4, 0.75, 0.75], black, ram);
  box([3.22, 0, 0], [0.58, 3.0, 1.15], porcelain, ram);
  // Circular analyzer ring holds the plate against a diffuse illuminator.
  const ring = mesh(
    keep(new T.TorusGeometry(6.4, 0.2, 10, 88)),
    metal,
    [19, 7.55, 14.54],
  );
  for (const sign of [-1, 1])
    box([19 + sign * 7.95, 7.55, 14.92], [0.24, 10.85, 0.54], metal);
  const lip = mesh(
    keep(new T.TorusGeometry(1.674, 0.045, 8, 72)),
    metal,
    [19, 7.55, 15.22],
  );
  for (let i = 0; i < 25; i++) {
    const angle = (i * 3.75 * Math.PI) / 180,
      r = 6.38;
    const tick = box(
      [19 + r * Math.sin(angle), 7.55 + r * Math.cos(angle), 14.73],
      [0.055, i % 4 === 0 ? 0.42 : 0.18, 0.11],
      black,
    );
    tick.rotation.z = -angle;
  }
  const marker = box([19, 13.9, 14.63], [0.24, 0.9, 0.6], basic(0xffdc9a));
  return {
    pick: ram,
    axis: "x",
    sensitivity: () => -0.62,
    update(s) {
      ram.position.x = 30.1 - s.a * 1.6;
      const a = (s.b * Math.PI) / 180;
      marker.position.set(
        19 + 6.38 * Math.sin(a),
        7.55 + 6.38 * Math.cos(a),
        14.63,
      );
      marker.rotation.z = -a;
    },
  };
}
function folded(w) {
  const { keep, mesh, cylinder, metal, black, box, basic } = w;
  w.contact(20, 16, 29, 29);
  cylinder([20, 1.08, 16], 12.65, 0.9, black);
  cylinder([20, 1.57, 16], 12.35, 0.1, metal);
  const geo = keep(new T.BufferGeometry()),
    n = (strips + 1) * (across + 1);
  const pos = new T.Float32BufferAttribute(new Float32Array(n * 3), 3),
    col = new T.Float32BufferAttribute(new Float32Array(n * 3), 3);
  geo.setAttribute("position", pos);
  geo.setAttribute("color", col);
  const index = [];
  for (let j = 0; j < across; j++)
    for (let i = 0; i < strips; i++) {
      const k = j * (strips + 1) + i;
      index.push(k, k + 1, k + strips + 2, k, k + strips + 2, k + strips + 1);
    }
  geo.setIndex(index);
  const paper = keep(new T.MeshBasicNodeMaterial({ side: T.DoubleSide }));
  const paperFinish = wgslFn(`fn vellum(p:vec3f,eye:vec3f,power:vec3f)->vec3f{
    let n=normalize(cross(dpdx(p),dpdy(p)));let facing=abs(dot(n,normalize(eye-p)));
    let diffuse=.24+.65*abs(dot(n,normalize(vec3f(.72,.29,.63))));
    let fiber=(.5+.5*cos(42.*p.y))*exp(-18.*fwidth(p.y));
    let base=vec3f(.075,.104,.092)*(diffuse+.14*fiber)+vec3f(.055,.076,.062)*pow(1.-facing,2.);
    return base+power*(.95+.42*diffuse);
  }`);
  paper.colorNode = paperFinish(
    positionWorld,
    cameraPosition,
    attribute("color", "vec3"),
  );
  const sheet = mesh(geo, paper, [0, 0, 0]);
  sheet.frustumCulled = false;
  const seamGeometry = keep(new T.BufferGeometry()),
    seamPoints = (strips * 2 + Math.floor(strips / 5) + 1) * 2;
  const seamBuffer = new T.Float32BufferAttribute(
    new Float32Array(seamPoints * 3),
    3,
  );
  seamGeometry.setAttribute("position", seamBuffer);
  const seams = new T.LineSegments(
    seamGeometry,
    keep(
      new T.LineBasicMaterial({
        color: 0x52645c,
        transparent: true,
        opacity: 0.65,
      }),
    ),
  );
  seams.frustumCulled = false;
  w.root.add(seams);
  const source = box([0, 0, 0], [0.38, 4.4, 0.48], basic(0x85ffd0)),
    coupler = box([0, 0, 0], [1, 0.45, 0.65], metal);
  return {
    update(s, m) {
      m.positions.forEach((v, i) => {
        pos.setXYZ(i, ...v);
        const color = m.colors[i];
        col.setXYZ(i, ...color);
      });
      pos.needsUpdate = col.needsUpdate = true;
      let v = 0;
      for (let i = 0; i <= strips; i++) {
        const top = across * (strips + 1) + i;
        if (i % 5 === 0) {
          seamBuffer.setXYZ(v++, ...m.positions[i]);
          seamBuffer.setXYZ(v++, ...m.positions[top]);
        }
        if (i < strips)
          for (const k of [i, top]) {
            seamBuffer.setXYZ(v++, ...m.positions[k]);
            seamBuffer.setXYZ(v++, ...m.positions[k + 1]);
          }
      }
      seamBuffer.needsUpdate = true;
      source.position.fromArray(m.positions[5 * (strips + 1)]);
      const a = m.positions[0],
        b = m.positions[strips];
      coupler.visible = !!s.variant;
      coupler.position.set((a[0] + b[0]) / 2, 3.2, (a[2] + b[2]) / 2);
      coupler.scale.x = Math.hypot(a[0] - b[0], a[2] - b[2]) + 0.35;
      coupler.rotation.y = -Math.atan2(a[2] - b[2], a[0] - b[0]);
    },
  };
}
function rankOne(w) {
  const { keep, mesh, basic, box, metal, black } = w;
  for (const block of stairBlocks.slice(3))
    box(block.p, block.s, block.kind === "lamp" ? black : w.chalk);
  for (const z of [8.2, 12.2]) box([8.4, 10.74, z], [0.48, 1.1, 0.45], metal);
  for (let i = 0; i < 5; i++)
    box([22.2 + i * 2.8, 1.52 + i * 0.69, 14.84], [2.65, 0.07, 0.1], metal);
  const geo = keep(new T.BufferGeometry());
  let patches, attr, weights;
  return {
    update(s, m) {
      if (m.patches) {
        patches = m.patches;
        const groups = new Map(),
          positions = [],
          indices = [];
        weights = [];
        for (const [index, p] of patches.entries()) {
          const name = p.block + "/" + p.face;
          if (!groups.has(name)) groups.set(name, []);
          groups.get(name).push(index);
        }
        for (const set of groups.values()) {
          const first = patches[set[0]],
            nx = 1 + Math.max(...set.map((k) => patches[k].i)),
            ny = 1 + Math.max(...set.map((k) => patches[k].j));
          const origin = positions.length / 3;
          // Sample the bilinear field on a half-patch grid. The centers match
          // the solve exactly and all interpolation stops at a physical edge.
          for (let j = 0; j <= 2 * ny; j++)
            for (let i = 0; i <= 2 * nx; i++) {
              const u = (i - 1) * 0.5,
                v = (j - 1) * 0.5,
                point = first.c.slice();
              point[first.axes[0]] += first.w * u;
              point[first.axes[1]] += first.h * v;
              positions.push(...point);
              const x = Math.max(0, Math.min(nx - 1, u)),
                y = Math.max(0, Math.min(ny - 1, v));
              const neighbors = [];
              for (let b = Math.floor(y); b <= Math.ceil(y); b++)
                for (let a = Math.floor(x); a <= Math.ceil(x); a++) {
                  neighbors.push([
                    set[b * nx + a],
                    (1 - Math.abs(x - a)) * (1 - Math.abs(y - b)),
                  ]);
                }
              weights.push(neighbors);
              if (i < 2 * nx && j < 2 * ny) {
                const k = origin + j * (2 * nx + 1) + i,
                  up = k + 2 * nx + 1;
                indices.push(k, k + 1, up + 1, k, up + 1, up);
              }
            }
        }
        geo.setIndex(indices);
        geo.setAttribute(
          "position",
          new T.Float32BufferAttribute(positions, 3),
        );
        attr = new T.Float32BufferAttribute(
          new Float32Array(positions.length),
          3,
        );
        geo.setAttribute("color", attr);
        mesh(
          geo,
          basic(0xffffff, { vertexColors: true, side: T.DoubleSide }),
          [0, 0, 0],
        );
      }
      for (let j = 0; j < weights.length; j++) {
        const set = weights[j],
          i = set[0][0],
          n = patches[i].n;
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (const [k, weight] of set) sum += weight * m.colors[k][c];
          const base =
            i === m.tile
              ? c === 0
                ? 0.03 + 0.18 * s.a
                : c === 1
                  ? 0.028
                  : 0.024
              : [0.115, 0.121, 0.108][c];
          attr.array[3 * j + c] = sum * 1.35 + base * (0.67 + 0.28 * n[1]);
        }
      }
      attr.needsUpdate = true;
    },
  };
}
function nlos(w) {
  const {
    box,
    framed,
    metal,
    black,
    porcelain,
    keep,
    root,
    group,
    bench,
    cylinder,
    basic,
  } = w;
  const hood = group([0, 0, 0]);
  box([15.2, 5.05, 20], [1.3, 8.86, 18.2], porcelain, hood);
  box([25, 9.4, 21], [20.5, 0.53, 17.4], w.dark, hood);
  for (let k = 0; k < 6; k++)
    box([25, 9.685, 14.1 + k * 2.75], [19.9, 0.065, 0.085], metal, hood);
  for (const x of [15.05, 35])
    box([x, 9.46, 21], [0.21, 0.64, 17.65], metal, hood);
  box([29, 9.81, 24.2], [2.75, 0.21, 0.45], black, hood);
  box([34.6, 4.96, 27.9], [0.75, 8.7, 0.75], metal, hood);
  // The relay wall is visible from both the transceiver and the concealed target.
  framed([25.9, 6.2, 1.48], 22.8, 8.8, basic(0xadc1c5));
  const spots = new T.InstancedMesh(
    keep(new T.BoxGeometry(0.32, 0.32, 0.12)),
    basic(0xffffff),
    99,
  );
  const spotMatrix = new T.Matrix4();
  for (let y = 0; y < 9; y++)
    for (let x = 0; x < 11; x++) {
      spots.setMatrixAt(
        y * 11 + x,
        spotMatrix.makeTranslation(
          26 + 24 * (-0.46 + 0.092 * x),
          1.1 + 24 * (0.04 + 0.043 * y),
          1.64,
        ),
      );
    }
  root.add(spots);
  for (const [x, z] of [
    [7.9, 16.6],
    [34.6, 27.9],
  ])
    w.contact(x, z, 5.7, 5.7);
  const head = cylinder([7.8, 5.5, 16.6], 1.18, 3.8, black);
  const aim = new T.Vector3(25.9, 6.2, 1.64).sub(head.position).normalize();
  head.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), aim);
  cylinder([0, 1.97, 0], 1.02, 0.2, metal, head);
  cylinder([0, 2.1, 0], 0.83, 0.1, basic(0x315666), head);
  box([7.9, 2.8, 16.6], [1.05, 4.3, 1.1], metal);
  box([7.9, 0.93, 16.6], [4.4, 0.52, 4.0], black);
  bench(8.3, 27.4, 12.4, 5.8, 2.0);
  const readout = framed([8.3, 5.4, 27.7], 12.0, 8.65);
  readout.rotation.y = 0.54;
  readout.rotation.x = -0.49;
  for (const side of [-1, 1])
    box([side * 4.6, -3.97, -0.42], [0.42, 1.6, 0.68], metal, readout);
  const points = new T.InstancedMesh(
    keep(new T.SphereGeometry(0.22, 8, 6)),
    basic(0xb7f9eb),
    117,
  );
  const dummy = new T.Object3D();
  root.add(points);
  points.frustumCulled = false;
  return {
    update(s, m) {
      hood.visible = !s.variant;
      points.visible = !!s.variant;
      const brightest = Math.max(...m.returns);
      m.returns.forEach((v, i) => {
        const t = v / brightest;
        spots.setColorAt(
          i,
          new T.Color(0.015, 0.13 + 0.48 * t, 0.22 + 0.86 * t),
        );
      });
      spots.instanceColor.needsUpdate = true;
      m.points.forEach((p, i) => {
        dummy.position.fromArray(targetWorld(p));
        dummy.updateMatrix();
        points.setMatrixAt(i, dummy.matrix);
      });
      points.instanceMatrix.needsUpdate = true;
    },
  };
}
export const rooms = {
  talbot,
  fluorescence: relay,
  winding,
  mosaic,
  photoelastic,
  folded,
  "rank-one": rankOne,
  nlos,
};
