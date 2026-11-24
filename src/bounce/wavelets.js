import { graph } from "./patches.js";
function haar(k, x) {
  if (k === 0) return 1 / Math.sqrt(8);
  const level = Math.floor(Math.log2(k)),
    span = 8 >> level,
    local = x - (k - (1 << level)) * span;
  return local < 0 || local >= span
    ? 0
    : (local < span / 2 ? 1 : -1) / Math.sqrt(span);
}
const basis = Array.from({ length: 64 }, (_, k) =>
  Float32Array.from(
    { length: 64 },
    (_, x) => haar(k % 8, x % 8) * haar(k >> 3, x >> 3),
  ),
);
export function stripe(position) {
  return Array.from({ length: 64 }, (_, i) =>
    Math.max(0, 1 - Math.abs((i % 8) - position * 7) / 1.35),
  );
}
function bake(room) {
  const rows = graph(room),
    size = room.n * 64 * 3;
  let previous = new Float32Array(size);
  for (const i of room.lamps) {
    const { cell, object } = room.patches[i];
    for (let c = 0; c < 3; c++)
      previous[(i * 3 + c) * 64 + cell] = room.boxes[object].power[c];
  }
  const total = previous.slice();
  for (let b = 0; b < 3; b++) {
    const next = new Float32Array(size);
    for (let i = 0; i < room.n; i++)
      for (let j = 0; j < room.n; j++) {
        const f = rows[i][j];
        if (!f) continue;
        for (let c = 0; c < 3; c++) {
          const g = f * room.patches[i].tint[c],
            to = (i * 3 + c) * 64,
            from = (j * 3 + c) * 64;
          for (let t = 0; t < 64; t++) next[to + t] += g * previous[from + t];
        }
      }
    for (let i = 0; i < size; i++) total[i] += next[i];
    previous = next;
  }
  const transformed = new Float32Array(size);
  for (let r = 0; r < room.n * 3; r++)
    for (let k = 0; k < 64; k++) {
      let sum = 0;
      for (let x = 0; x < 64; x++) sum += basis[k][x] * total[r * 64 + x];
      transformed[r * 64 + k] = sum;
    }
  return transformed;
}
export function solveWavelets(room, s) {
  room.wavelets ??= bake(room);
  const pattern = s.pattern ?? stripe(s.a),
    coeff = basis.map((row) =>
      row.reduce((sum, w, i) => sum + w * pattern[i], 0),
    );
  const retained = Array.from({ length: 64 }, (_, i) => i)
    .sort((a, b) => Math.abs(coeff[b]) - Math.abs(coeff[a]))
    .slice(0, s.b);
  const rgb = new Float32Array(room.n * 3);
  for (let i = 0; i < rgb.length; i++)
    for (const k of retained) rgb[i] += room.wavelets[i * 64 + k] * coeff[k];
  for (const i of room.lamps) {
    const { cell, object } = room.patches[i];
    for (let c = 0; c < 3; c++)
      rgb[i * 3 + c] = pattern[cell] * room.boxes[object].power[c];
  }
  return {
    rgb,
    info: `${s.b} of 64 Haar coefficients · ${pattern.filter((v) => v > 0).length} lit tiles`,
  };
}
