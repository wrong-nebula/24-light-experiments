import { image } from "./image.js";
// The room and solver share these opaque volumes. Coordinates use chamber units.
export const stairBlocks = [
  { p: [20, -0.38, 16], s: [40, 2, 32], kind: "floor" },
  { p: [0.37, 6.5, 16], s: [1.06, 13, 32], kind: "wall" },
  { p: [20, 5.4, 0.37], s: [40, 10.8, 1.06], kind: "wall" },
  { p: [16.4, 4.32, 7.7], s: [1.35, 7.4, 13.6], kind: "divider" },
  ...Array.from({ length: 5 }, (_, i) => ({
    p: [22.2 + i * 2.8, 0.62 + (1 + i * 0.69) / 2, 9.8],
    s: [2.8, 1 + i * 0.69, 10],
    kind: "step",
  })),
  { p: [31.2, 1.35, 22.1], s: [8, 1.46, 5.5], kind: "landing" },
  { p: [1.2, 5.4, 15.0], s: [0.52, 7.3, 7.8], kind: "tile" },
  { p: [8.4, 9.95, 10.2], s: [6.3, 0.45, 5.8], kind: "lamp" },
];
export const floorWidth = 12,
  floorHeight = 8;
const dot = (a, b) => a.reduce((s, x, k) => s + x * b[k], 0);
const bounds = stairBlocks.map(({ p, s }) => [
  p.map((v, i) => v - s[i] / 2 + 0.012),
  p.map((v, i) => v + s[i] / 2 - 0.012),
]);
function blocked(p, q, from, to) {
  const dx = q[0] - p[0],
    dy = q[1] - p[1],
    dz = q[2] - p[2];
  for (let i = 0; i < bounds.length; i++) {
    if (i === from || i === to) continue;
    const [min, max] = bounds[i];
    let lo = 0.001,
      hi = 0.999;
    for (let d = 0; d < 3; d++) {
      const delta = d === 0 ? dx : d === 1 ? dy : dz;
      if (Math.abs(delta) < 1e-9) {
        if (p[d] < min[d] || p[d] > max[d]) {
          lo = 1;
          break;
        }
        continue;
      }
      const u = (min[d] - p[d]) / delta,
        v = (max[d] - p[d]) / delta;
      lo = Math.max(lo, Math.min(u, v));
      hi = Math.min(hi, Math.max(u, v));
      if (lo > hi) break;
    }
    if (lo <= hi) return true;
  }
  return false;
}
function factors() {
  const patches = [];
  stairBlocks.forEach(({ p, s, kind }, block) => {
    for (let face = 0; face < 6; face++) {
      if (block < 3 && face !== [2, 0, 4][block]) continue;
      if (face === 3 && kind !== "lamp") continue;
      const axis = face >> 1,
        sign = face % 2 ? -1 : 1,
        axes = [
          [2, 1],
          [0, 2],
          [0, 1],
        ][axis];
      const n = [0, 0, 0];
      n[axis] = sign;
      const [u, v] = axes,
        nu = kind === "floor" ? floorWidth : kind === "wall" ? 8 : 1,
        nv = kind === "floor" ? floorHeight : kind === "wall" ? 3 : 1;
      for (let j = 0; j < nv; j++)
        for (let i = 0; i < nu; i++) {
          const c = p.slice(),
            w = s[u] / nu,
            h = s[v] / nv;
          c[axis] += sign * (s[axis] / 2 + 0.018);
          c[u] += w * (i + 0.5 - nu / 2);
          c[v] += h * (j + 0.5 - nv / 2);
          const samples = [-0.25, 0.25].flatMap((a) =>
            [-0.25, 0.25].map((b) => {
              const q = c.slice();
              q[u] += a * w;
              q[v] += b * h;
              return q;
            }),
          );
          patches.push({
            c,
            n,
            axis,
            axes,
            w,
            h,
            area: w * h,
            samples,
            face,
            kind,
            block,
            i,
            j,
          });
        }
    }
  });
  const N = patches.length,
    F = Array.from({ length: N }, () => new Float64Array(N));
  for (let i = 0; i < N; i++)
    for (let j = i + 1; j < N; j++) {
      const a = patches[i],
        b = patches[j];
      if (a.block === b.block) continue;
      if (
        (b.c[a.axis] - a.c[a.axis]) * a.n[a.axis] <= -b.w - b.h ||
        (a.c[b.axis] - b.c[b.axis]) * b.n[b.axis] <= -a.w - a.h
      )
        continue;
      let kernel = 0;
      for (const p of a.samples)
        for (const q of b.samples) {
          const ca = (q[a.axis] - p[a.axis]) * a.n[a.axis],
            cb = (p[b.axis] - q[b.axis]) * b.n[b.axis];
          if (ca <= 0 || cb <= 0 || blocked(p, q, a.block, b.block)) continue;
          const r2 =
            (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
          kernel += (ca * cb) / (Math.PI * r2 * r2);
        }
      F[i][j] = (b.area * kernel) / 16;
      F[j][i] = (a.area * kernel) / 16;
    }
  // Symmetric pair scaling keeps A_i F_ij = A_j F_ji while bounding every row.
  const sums = F.map((row) =>
    Math.max(
      1,
      row.reduce((s, f) => s + f, 0),
    ),
  );
  for (let i = 0; i < N; i++)
    for (let j = i + 1; j < N; j++) {
      const scale = Math.max(sums[i], sums[j]);
      F[i][j] /= scale;
      F[j][i] /= scale;
    }
  return {
    patches,
    F,
    tile: patches.findIndex((p) => p.kind === "tile" && p.face === 0),
  };
}
function solve(rows, rhs) {
  // Energy conservation and reflectance < 1 give strict row diagonal dominance.
  const A = rows.map((r) => r.slice()),
    b = rhs.slice(),
    n = b.length;
  for (let k = 0; k < n; k++)
    for (let i = k + 1; i < n; i++) {
      if (A[i][k] === 0) continue;
      const v = A[i][k] / A[k][k];
      for (let j = k + 1; j < n; j++) A[i][j] -= v * A[k][j];
      b[i] -= v * b[k];
    }
  for (let i = n - 1; i >= 0; i--) {
    for (let j = i + 1; j < n; j++) b[i] -= A[i][j] * b[j];
    b[i] /= A[i][i];
  }
  return b;
}
let base;
export function stairTransport() {
  if (base) return base;
  const { patches, F, tile } = factors();
  const A = F.map((row, i) =>
    Float64Array.from(
      row,
      (f, j) => (i === j ? 1 : 0) - (i === tile ? 0.045 : 0.78) * f,
    ),
  );
  const E = Float64Array.from(patches, (p) =>
    p.kind === "lamp" && p.face === 3 ? 9 : 0,
  );
  const unit = Float64Array.from(patches, (_, i) => Number(i === tile));
  const B = solve(A, E),
    column = solve(A, unit);
  return (base = {
    patches,
    F,
    tile,
    A,
    E,
    B,
    column,
    incident: dot(F[tile], B),
    feedback: dot(F[tile], column),
  });
}
export function rankOne(reflectance, power, reference) {
  const { patches, F, tile, A, E, B, column, incident, feedback } =
      stairTransport(),
    color = [
      0.045 + reflectance * 0.91,
      0.045 + reflectance * 0.025,
      0.045 + reflectance * 0.012,
    ];
  let error = 0;
  const scale = color.map(
    (r) => ((r - 0.045) * incident) / (1 - (r - 0.045) * feedback),
  );
  const colors = Array.from({ length: B.length }, (_, i) => [
    (B[i] + column[i] * scale[0]) * power,
    (B[i] + column[i] * scale[1]) * power,
    (B[i] + column[i] * scale[2]) * power,
  ]);
  if (reference)
    color.forEach((r, c) => {
      const full = A.slice();
      full[tile] = F[tile].map((v, j) => (tile === j ? 1 : 0) - r * v);
      const exact = solve(full, E);
      for (let i = 0; i < exact.length; i++) {
        const v = exact[i] * power;
        error = Math.max(error, Math.abs(v - colors[i][c]));
        colors[i][c] = v;
      }
    });
  const frame = image(
    floorWidth,
    floorHeight,
    (_u, _v, x, y) => colors[(floorHeight - 1 - y) * floorWidth + x],
  );
  return { frame, colors, patches, error, tile };
}
