import { nearest, emission } from "./patches.js";
const bounds = [0, 2.5, 7, 19, 72];
function footprint(x, z, w, h) {
  const fx = (x / 40) * w - 0.5,
    fz = (z / 32) * h - 0.5,
    ix = Math.floor(fx),
    iz = Math.floor(fz),
    tx = fx - ix,
    tz = fz - iz;
  const cell = (i, j) =>
    Math.min(h - 1, Math.max(0, j)) * w + Math.min(w - 1, Math.max(0, i));
  return [
    [cell(ix, iz), (1 - tx) * (1 - tz)],
    [cell(ix + 1, iz), tx * (1 - tz)],
    [cell(ix, iz + 1), (1 - tx) * tz],
    [cell(ix + 1, iz + 1), tx * tz],
  ];
}
function build(room) {
  const levels = [];
  for (let l = 0; l < 4; l++) {
    const w = 32 >> l,
      h = 24 >> l,
      dirs = 8 * 4 ** l,
      hits = new Int32Array(w * h * dirs),
      parents = [];
    const angles = Array.from(
        { length: dirs },
        (_, i) => ((i + 0.5) * 2 * Math.PI) / dirs,
      ),
      hit = {};
    for (let z = 0; z < h; z++)
      for (let x = 0; x < w; x++) {
        const px = ((x + 0.5) * 40) / w,
          pz = ((z + 0.5) * 32) / h;
        if (l < 3) parents.push(footprint(px, pz, w / 2, h / 2));
        for (let a = 0; a < dirs; a++) {
          const dx = Math.cos(angles[a]),
            dz = Math.sin(angles[a]);
          nearest(
            room,
            px + bounds[l] * dx,
            5.2,
            pz + bounds[l] * dz,
            dx,
            0,
            dz,
            -1,
            bounds[l + 1] - bounds[l],
            hit,
          );
          hits[(z * w + x) * dirs + a] =
            hit.id >= 0 ? hit.id : hit.t < bounds[l + 1] - bounds[l] ? -2 : -1;
        }
      }
    levels.push({
      w,
      h,
      dirs,
      hits,
      parents,
      angles,
      values: new Float32Array(w * h * dirs * 3),
    });
  }
  return levels;
}
export function solveCascades(room, s) {
  const levels = (room.cascades ??= build(room)),
    source = emission(room, s),
    near = levels[0];
  let last = source,
    first;
  for (let bounce = 0; bounce < s.b; bounce++) {
    for (let l = 3; l >= 0; l--) {
      const { hits, values, parents, dirs } = levels[l];
      for (let k = 0; k < hits.length; k++) {
        const j = hits[k],
          v = k * 3;
        values.fill(0, v, v + 3);
        if (j >= 0) {
          for (let c = 0; c < 3; c++) values[v + c] = last[j * 3 + c];
        } else if (j === -1 && l < 3) {
          const far = levels[l + 1],
            a = (k % dirs) * 4;
          for (const [cell, weight] of parents[Math.floor(k / dirs)])
            for (let sub = 0; sub < 4; sub++) {
              const f = (cell * far.dirs + a + sub) * 3;
              for (let c = 0; c < 3; c++)
                values[v + c] += far.values[f + c] * weight * 0.25;
            }
        }
      }
    }
    const next = source.slice();
    for (let i = 0; i < room.n; i++) {
      const p = room.patches[i],
        sample = footprint(
          p.x + p.nx * 0.95,
          p.z + p.nz * 0.95,
          near.w,
          near.h,
        );
      let sum = 0;
      const rgb = [0, 0, 0];
      for (let a = 0; a < near.dirs; a++) {
        const cosine =
          Math.abs(p.ny) > 0.5
            ? 1
            : Math.max(
                0,
                p.nx * Math.cos(near.angles[a]) +
                  p.nz * Math.sin(near.angles[a]),
              );
        sum += cosine;
        for (const [cell, w] of sample) {
          const k = (cell * near.dirs + a) * 3;
          for (let c = 0; c < 3; c++) rgb[c] += w * cosine * near.values[k + c];
        }
      }
      for (let c = 0; c < 3; c++)
        next[i * 3 + c] += (p.tint[c] * rgb[c]) / Math.max(0.001, sum);
    }
    last = next;
    if (bounce === 0) first = next;
  }
  const rgb = s.variant ? last.map((v, k) => Math.max(0, v - first[k])) : last;
  return { rgb, info: "32 × 24 to 4 × 3 probes · 8 to 512 directions" };
}
