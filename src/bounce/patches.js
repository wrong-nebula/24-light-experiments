// Axis pairs give every face a stable local parameterization, shared with the shader.
export const axes = [
  [2, 1],
  [0, 2],
  [0, 1],
];
export const tile = 16,
  atlasWidth = 192,
  atlasHeight = 512;
export function divisions(item, wavelet) {
  if (item.bank) return [12, 5, 1];
  return item.h.map((h) =>
    wavelet && item.kind === "lamp" && h > 1
      ? 8
      : Math.min(tile, Math.max(1, Math.ceil((2 * h) / 3.1))),
  );
}
export function makeRoom(items, id) {
  const boxes = items.map((o) => ({
    ...o,
    cos: Math.cos(o.yaw || 0),
    sin: Math.sin(o.yaw || 0),
  }));
  const patches = [],
    faces = [],
    lamps = [];
  boxes.forEach((o, object) => {
    o.first = Array(6).fill(-1);
    o.counts = divisions(o, id === "wavelets");
    for (let face = 0; face < 6; face++) {
      if (object < 3 && face !== [2, 0, 4][object]) continue;
      if (object >= 3 && face === 3 && o.c[1] - o.h[1] < 0.7) continue;
      const axis = face >> 1,
        sign = face % 2 === 0 ? 1 : -1,
        [u, v] = axes[axis],
        nu = o.counts[u],
        nv = o.counts[v];
      const first = patches.length;
      const normal = [0, 0, 0];
      normal[axis] = sign;
      const nx = o.cos * normal[0] + o.sin * normal[2],
        ny = normal[1],
        nz = -o.sin * normal[0] + o.cos * normal[2];
      o.first[face] = first;
      for (let y = 0; y < nv; y++)
        for (let x = 0; x < nu; x++) {
          const local = [0, 0, 0];
          local[axis] = sign * o.h[axis];
          local[u] = o.h[u] * ((2 * (x + 0.5)) / nu - 1);
          local[v] = o.h[v] * ((2 * (y + 0.5)) / nv - 1);
          const p = {
            x: o.c[0] + o.cos * local[0] + o.sin * local[2],
            y: o.c[1] + local[1],
            z: o.c[2] - o.sin * local[0] + o.cos * local[2],
            nx,
            ny,
            nz,
            object,
            face,
            tint: o.tint,
            area: (4 * o.h[u] * o.h[v]) / (nu * nv),
            texel: (object * tile + y) * atlasWidth + face * tile + x,
            cell: y * nu + x,
          };
          if (
            face === 4 &&
            (o.kind === "lamp" || o.kind === "blueLamp") &&
            (!o.bank || x % 4 === 1 || x % 4 === 2)
          )
            lamps.push(patches.length);
          patches.push(p);
        }
      faces.push({ first, count: nu * nv, object, face });
    }
  });
  for (const p of patches) {
    p.hidden = boxes.some((o, i) => {
      if (i === p.object) return false;
      const x = p.x + 0.018 * p.nx - o.c[0],
        z = p.z + 0.018 * p.nz - o.c[2];
      return (
        Math.abs(x * o.cos - z * o.sin) < o.h[0] &&
        Math.abs(p.y + 0.018 * p.ny - o.c[1]) < o.h[1] &&
        Math.abs(x * o.sin + z * o.cos) < o.h[2]
      );
    });
  }
  return {
    boxes,
    patches,
    faces,
    lamps: lamps.filter((i) => !patches[i].hidden),
    n: patches.length,
    id,
  };
}

// Return the first boundary and its local face. Only accepted hits mutate 'hit'.
export function intersect(box, x, y, z, dx, dy, dz, limit, hit) {
  const rx = x - box.c[0],
    rz = z - box.c[2];
  const px = box.cos * rx - box.sin * rz,
    py = y - box.c[1],
    pz = box.sin * rx + box.cos * rz;
  const vx = box.cos * dx - box.sin * dz,
    vz = box.sin * dx + box.cos * dz;
  let near = -Infinity,
    far = limit,
    face = 0,
    exitFace = -1;
  for (let k = 0; k < 3; k++) {
    const p = k === 0 ? px : k === 1 ? py : pz,
      d = k === 0 ? vx : k === 1 ? dy : vz,
      h = box.h[k];
    if (Math.abs(d) < 1e-9) {
      if (Math.abs(p) > h) return false;
      continue;
    }
    const t1 = (-h - p) / d,
      t2 = (h - p) / d,
      entry = Math.min(t1, t2),
      exit = Math.max(t1, t2);
    if (entry > near) {
      near = entry;
      face = 2 * k + (d > 0 ? 1 : 0);
    }
    if (exit < far) {
      far = exit;
      exitFace = 2 * k + (d > 0 ? 0 : 1);
    }
    if (far < near) return false;
  }
  if (far < 0.008 || near >= limit) return false;
  if (near < 0.008) {
    if (exitFace < 0) return false;
    near = far;
    face = exitFace;
  }
  if (hit) {
    hit.t = near;
    hit.face = face;
    const axis = face >> 1,
      [u, v] = axes[axis];
    const lx = px + near * vx,
      ly = py + near * dy,
      lz = pz + near * vz;
    const value = (k) => (k === 0 ? lx : k === 1 ? ly : lz);
    const ix = Math.min(
      box.counts[u] - 1,
      Math.max(0, Math.floor((value(u) / box.h[u] + 1) * 0.5 * box.counts[u])),
    );
    const iy = Math.min(
      box.counts[v] - 1,
      Math.max(0, Math.floor((value(v) / box.h[v] + 1) * 0.5 * box.counts[v])),
    );
    hit.id =
      box.first[face] < 0 ? -1 : box.first[face] + iy * box.counts[u] + ix;
  }
  return true;
}
export function nearest(
  room,
  x,
  y,
  z,
  dx,
  dy,
  dz,
  skip = -1,
  limit = 100,
  hit = {},
) {
  hit.id = -1;
  hit.t = limit;
  for (let i = 0; i < room.boxes.length; i++)
    if (i !== skip) intersect(room.boxes[i], x, y, z, dx, dy, dz, hit.t, hit);
  return hit;
}
export function formFactor(room, receiver, donor) {
  const p = room.patches[receiver],
    q = room.patches[donor];
  if (p.object === q.object || p.hidden || q.hidden) return 0;
  const x = q.x - p.x,
    y = q.y - p.y,
    z = q.z - p.z,
    r2 = x * x + y * y + z * z;
  const ci = p.nx * x + p.ny * y + p.nz * z,
    cj = -(q.nx * x + q.ny * y + q.nz * z);
  if (ci <= 0 || cj <= 0) return 0;
  for (let i = 0; i < room.boxes.length; i++) {
    if (
      i !== p.object &&
      i !== q.object &&
      intersect(room.boxes[i], p.x, p.y, p.z, x, y, z, 0.998, null)
    )
      return 0;
  }
  return (ci * cj * q.area) / (r2 * (Math.PI * r2 + Math.max(p.area, q.area)));
}
export function graph(room) {
  if (room.graph) return room.graph;
  const rows = [];
  for (let i = 0; i < room.n; i++) {
    const row = new Float32Array(room.n);
    let sum = 0;
    for (let j = 0; j < room.n; j++) {
      row[j] = formFactor(room, i, j);
      sum += row[j];
    }
    if (sum > 1) for (let j = 0; j < room.n; j++) row[j] /= sum;
    rows.push(row);
  }
  return (room.graph = rows);
}
export function emission(room, s) {
  const out = new Float32Array(room.n * 3);
  for (const i of room.lamps) {
    const lamp = room.boxes[room.patches[i].object];
    const scale = room.id === "capacity" && lamp.kind === "lamp" ? s.a : 1;
    for (let c = 0; c < 3; c++) out[i * 3 + c] = lamp.power[c] * scale;
  }
  return out;
}
export function direct(room, emit) {
  const out = emit.slice();
  for (let i = 0; i < room.n; i++)
    for (const j of room.lamps) {
      const f = room.graph ? room.graph[i][j] : formFactor(room, i, j);
      if (f)
        for (let c = 0; c < 3; c++)
          out[3 * i + c] += room.patches[i].tint[c] * f * emit[3 * j + c];
    }
  return out;
}
export function addRGB(out, other) {
  for (let i = 0; i < out.length; i++) out[i] += other[i];
  return out;
}
export function signature(items) {
  return items.map((o) => [...o.c, ...o.h, o.yaw || 0].join(",")).join("|");
}
