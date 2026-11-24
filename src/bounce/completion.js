import { formFactor, direct, emission } from "./patches.js";
function noise(a, b) {
  let h = Math.imul(a + 1, 73856093) ^ Math.imul(b + 3, 19349663);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Ridge-regularized least squares; factor vectors have at most four components.
function fit(samples, other, r) {
  const a = new Float64Array(r * (r + 1)),
    n = r + 1;
  for (let j = 0; j < r; j++) a[j * n + j] = 0.018;
  for (const [k, y] of samples) {
    for (let j = 0; j < r; j++) {
      const v = other[k * r + j];
      for (let l = 0; l < r; l++) a[j * n + l] += v * other[k * r + l];
      a[j * n + r] += v * y;
    }
  }
  for (let j = 0; j < r; j++) {
    const d = a[j * n + j];
    for (let l = j; l <= r; l++) a[j * n + l] /= d;
    for (let k = 0; k < r; k++)
      if (k !== j) {
        const f = a[k * n + j];
        for (let l = j; l <= r; l++) a[k * n + l] -= f * a[j * n + l];
      }
  }
  return Array.from({ length: r }, (_, j) => a[j * n + r]);
}
export function solveCompletion(room, s) {
  const e = emission(room, s),
    rgb = direct(room, e),
    cols = [];
  const weights = room.patches.map(
    (p, i) =>
      p.area * Math.max(...[0, 1, 2].map((c) => rgb[i * 3 + c] - e[i * 3 + c])),
  );
  const total = weights.reduce((a, b) => a + b, 0),
    m = 64;
  let donor = 0,
    cdf = weights[0];
  for (let j = 0; j < m; j++) {
    const t = ((j + 0.5) / m) * total;
    while (cdf < t && donor + 1 < room.n) cdf += weights[++donor];
    cols.push({
      donor,
      power: [0, 1, 2].map(
        (c) =>
          ((rgb[donor * 3 + c] - e[donor * 3 + c]) * total) /
          (m * weights[donor] || 1),
      ),
    });
  }
  let measured = 0;
  for (const face of room.faces) {
    const n = face.count,
      r = Math.min(4, Math.max(1, Math.floor(s.a / 9)), n);
    const rows = Array.from({ length: n }, () => []),
      columns = Array.from({ length: m }, () => []);
    const seen = new Float32Array(n * m).fill(-1);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < m; j++) {
        if (!s.variant && noise(face.first + i, j) * 100 >= s.a) continue;
        const y = formFactor(room, face.first + i, cols[j].donor) * 80;
        seen[i * m + j] = y;
        rows[i].push([j, y]);
        columns[j].push([i, y]);
        measured++;
      }
    const u = new Float32Array(n * r),
      v = Float32Array.from(
        { length: m * r },
        (_, k) => 0.12 + 0.6 * noise(k, 41),
      );
    if (!s.variant && s.a < 100)
      for (let k = 0; k < 6; k++) {
        for (let i = 0; i < n; i++) u.set(fit(rows[i], v, r), i * r);
        for (let j = 0; j < m; j++) v.set(fit(columns[j], u, r), j * r);
      }
    for (let i = 0; i < n; i++) {
      const p = room.patches[face.first + i];
      for (let j = 0; j < m; j++) {
        let w = seen[i * m + j];
        if (w < 0) {
          const q = room.patches[cols[j].donor],
            x = q.x - p.x,
            y = q.y - p.y,
            z = q.z - p.z,
            rr = x * x + y * y + z * z;
          const ci = p.nx * x + p.ny * y + p.nz * z,
            cj = -q.nx * x - q.ny * y - q.nz * z;
          if (ci <= 0 || cj <= 0 || rr === 0) continue;
          w = 0;
          for (let l = 0; l < r; l++) w += u[i * r + l] * v[j * r + l];
          w = Math.min(
            Math.max(0, w),
            (80 * q.area * ci * cj) /
              (rr * (Math.PI * rr + Math.max(p.area, q.area))),
          );
        }
        for (let c = 0; c < 3; c++)
          rgb[(face.first + i) * 3 + c] +=
            p.tint[c] * (w / 80) * cols[j].power[c];
      }
    }
  }
  return {
    rgb,
    info:
      measured.toLocaleString("en-US") +
      " of " +
      (room.n * m).toLocaleString("en-US") +
      " bounce links measured",
  };
}
