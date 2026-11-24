import { emission, direct, nearest } from "./patches.js";
const sectors = 32,
  directions = 12;
const binWeights = Array.from(
  { length: sectors },
  (_, i) =>
    Math.sin(((i + 1) * Math.PI) / 64) ** 2 - Math.sin((i * Math.PI) / 64) ** 2,
);

export function solveBitmask(room, s) {
  const { eye, right, up, back, width, height } = s.camera;
  const nx = 160,
    ny = Math.max(72, Math.min(224, Math.round((nx * height) / width)));
  const ids = new Int32Array(nx * ny).fill(-1),
    world = new Float32Array(nx * ny * 3);
  const e = emission(room, s),
    lit = (room.direct ??= direct(room, e)),
    rgb = s.variant ? new Float32Array(lit.length) : lit.slice();
  const hit = {};
  for (let y = 0; y < ny; y++)
    for (let x = 0; x < nx; x++) {
      const a = ((x + 0.5) / nx - 0.5) * width,
        b = ((y + 0.5) / ny - 0.5) * height;
      const ox = eye[0] + a * right[0] + b * up[0],
        oy = eye[1] + a * right[1] + b * up[1],
        oz = eye[2] + a * right[2] + b * up[2];
      nearest(room, ox, oy, oz, -back[0], -back[1], -back[2], -1, 400, hit);
      if (hit.id < 0) continue;
      const k = x + y * nx;
      ids[k] = hit.id;
      world[3 * k] = ox - hit.t * back[0];
      world[3 * k + 1] = oy - hit.t * back[1];
      world[3 * k + 2] = oz - hit.t * back[2];
    }
  let visible = 0;
  for (let i = 0; i < room.n; i++) {
    const p = room.patches[i],
      dx = p.x - eye[0],
      dy = p.y - eye[1],
      dz = p.z - eye[2];
    const cx =
      (0.5 + (dx * right[0] + dy * right[1] + dz * right[2]) / width) * nx;
    const cy = (0.5 + (dx * up[0] + dy * up[1] + dz * up[2]) / height) * ny;
    if (cx < 0 || cx >= nx || cy < 0 || cy >= ny) continue;
    const nearestId = ids[Math.floor(cy) * nx + Math.floor(cx)];
    if (
      nearestId < 0 ||
      room.patches[nearestId].object !== p.object ||
      room.patches[nearestId].face !== p.face
    )
      continue;
    visible++;
    for (let j = 0; j < directions; j++) {
      const angle = (j * 2 * Math.PI) / directions,
        ax = (Math.cos(angle) * nx) / width,
        ay = (Math.sin(angle) * ny) / height;
      let covered = 0;
      for (let t = 0.7; t <= 56; t = t * 1.19 + 0.35) {
        const x = Math.floor(cx + ax * t),
          y = Math.floor(cy + ay * t);
        if (x < 0 || x >= nx || y < 0 || y >= ny) break;
        const k = y * nx + x,
          id = ids[k];
        if (id < 0 || id === i) continue;
        const q = room.patches[id],
          vx = world[k * 3] - p.x,
          vy = world[k * 3 + 1] - p.y,
          vz = world[k * 3 + 2] - p.z;
        const d = Math.hypot(vx, vy, vz);
        if (d < 0.15) continue;
        const angleAtReceiver = Math.asin(
          Math.max(-1, Math.min(1, (vx * p.nx + vy * p.ny + vz * p.nz) / d)),
        );
        const spread = Math.atan2(s.b * 0.5, d);
        const lo = Math.max(
          0,
          Math.floor(((angleAtReceiver - spread) * 64) / Math.PI),
        );
        const hi = Math.min(
          31,
          Math.floor(((angleAtReceiver + spread) * 64) / Math.PI),
        );
        if (hi < lo) continue;
        const mask = ((0xffffffff >>> (31 - hi)) & (0xffffffff << lo)) >>> 0;
        let fresh = (mask & ~covered) >>> 0;
        covered = (covered | mask) >>> 0;
        if (q.nx * vx + q.ny * vy + q.nz * vz >= 0) continue;
        let weight = 0;
        while (fresh) {
          const bit = 31 - Math.clz32(fresh & -fresh);
          weight += binWeights[bit];
          fresh = (fresh & (fresh - 1)) >>> 0;
        }
        for (let c = 0; c < 3; c++)
          rgb[i * 3 + c] +=
            (p.tint[c] * (lit[id * 3 + c] - e[id * 3 + c]) * weight) /
            directions;
      }
    }
  }
  return {
    rgb,
    info:
      nx +
      " × " +
      ny +
      " depth samples · " +
      visible +
      " visible receiver patches",
  };
}
