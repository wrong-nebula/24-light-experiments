import { tau } from "./image.js";
export const mosaicSize = 48,
  facets = 12;
export const mosaicAspect = 26 / 8.6;
export function pattern(preset) {
  const data = new Float32Array(mosaicSize * mosaicSize);
  for (let y = 0; y < mosaicSize; y++)
    for (let x = 0; x < mosaicSize; x++) {
      const u = (x + 0.5) / mosaicSize - 0.5,
        v = (y + 0.5) / mosaicSize - 0.5;
      const d =
        preset === 0
          ? Math.abs(Math.hypot(u * mosaicAspect, v) - 0.36)
          : preset === 1
            ? Math.max(Math.abs(Math.abs(u) - 0.16), Math.abs(v) - 0.3)
            : Math.max(
                Math.abs(v - 0.21 * Math.sin(u * tau * 1.5)),
                Math.abs(u) - 0.4,
              );
      data[y * mosaicSize + x] = Math.exp(-0.5 * (d / 0.025) ** 2);
    }
  return data;
}
export function stroke(data, u, v, radius) {
  const px = u * mosaicSize - 0.5,
    py = v * mosaicSize - 0.5;
  const nearest = (v) => Math.max(0, Math.min(mosaicSize - 1, Math.round(v)));
  data[nearest(py) * mosaicSize + nearest(px)] = 1;
  for (
    let y = Math.max(0, Math.floor(py - radius));
    y <= Math.min(mosaicSize - 1, py + radius);
    y++
  )
    for (
      let x = Math.max(0, Math.floor(px - radius));
      x <= Math.min(mosaicSize - 1, px + radius);
      x++
    )
      if (Math.hypot((x - px) * mosaicAspect, y - py) <= radius)
        data[y * mosaicSize + x] = 1;
}
export const mirrorPosition = (i) => [
  7 + (i % facets) * 1.48,
  2.6,
  11 + Math.floor(i / facets) * 1.28,
];
export const targetPosition = (u, v) => [9 + 26 * u, 1.9 + 8.6 * v, 1.92];
function assignment(cost, n) {
  // Hungarian primal-dual assignment for equal input and target masses.
  const u = new Float64Array(n + 1),
    v = new Float64Array(n + 1),
    p = new Int16Array(n + 1),
    way = new Int16Array(n + 1);
  // Row and column reductions give a feasible starting dual. Matching the
  // exposed zero-cost links leaves fewer alternating paths to construct.
  v.fill(Infinity, 1);
  for (let i = 1; i <= n; i++) {
    let least = Infinity;
    for (let j = 1; j <= n; j++)
      least = Math.min(least, cost[(i - 1) * n + j - 1]);
    u[i] = least;
    for (let j = 1; j <= n; j++)
      v[j] = Math.min(v[j], cost[(i - 1) * n + j - 1] - least);
  }
  const unmatched = [];
  for (let i = 1; i <= n; i++) {
    let matched = false;
    for (let j = 1; j <= n; j++)
      if (!p[j] && cost[(i - 1) * n + j - 1] - u[i] - v[j] === 0) {
        p[j] = i;
        matched = true;
        break;
      }
    if (!matched) unmatched.push(i);
  }
  const min = new Float64Array(n + 1),
    used = new Uint8Array(n + 1);
  for (const i of unmatched) {
    p[0] = i;
    let j0 = 0;
    min.fill(Infinity);
    used.fill(0);
    do {
      used[j0] = 1;
      const i0 = p[j0];
      let delta = Infinity,
        j1 = 0;
      for (let j = 1; j <= n; j++)
        if (!used[j]) {
          const cur = cost[(i0 - 1) * n + j - 1] - u[i0] - v[j];
          if (cur < min[j]) {
            min[j] = cur;
            way[j] = j0;
          }
          if (min[j] < delta) {
            delta = min[j];
            j1 = j;
          }
        }
      for (let j = 0; j <= n; j++)
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else min[j] -= delta;
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const result = new Int16Array(n);
  for (let j = 1; j <= n; j++) result[p[j] - 1] = j - 1;
  return result;
}
// Partition target mass into equal-power regions. Their centroids preserve
// the requested center of light even at the 72-facet budget.
function targetSamples(weights, count) {
  const cells = [];
  for (let k = 0; k < weights.length; k++)
    if (weights[k] > 1e-12)
      cells.push({
        x: ((k % mosaicSize) + 0.5) / mosaicSize,
        y: (Math.floor(k / mosaicSize) + 0.5) / mosaicSize,
        mass: weights[k],
      });
  const samples = [];
  function split(group, n) {
    let mass = 0,
      x = 0,
      y = 0,
      minX = 1,
      minY = 1,
      maxX = 0,
      maxY = 0;
    for (const p of group) {
      mass += p.mass;
      x += p.x * p.mass;
      y += p.y * p.mass;
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    if (!mass) return;
    if (n === 1 || group.length === 1) {
      for (let i = 0; i < n; i++) samples.push([x / mass, y / mass]);
      return;
    }
    const axis = (maxX - minX) * mosaicAspect > maxY - minY ? "x" : "y";
    group.sort((a, b) => a[axis] - b[axis]);
    const leftCount = Math.floor(n / 2),
      left = [],
      right = [];
    let remaining = (mass * leftCount) / n;
    for (const point of group) {
      const m = Math.min(point.mass, Math.max(0, remaining));
      remaining -= m;
      if (m > 0) left.push({ ...point, mass: m });
      if (m < point.mass) right.push({ ...point, mass: point.mass - m });
    }
    split(left, leftCount);
    split(right, n - leftCount);
  }
  split(cells, count);
  return samples;
}
export function mirrorMosaic(weights, cover) {
  const ids = Array.from({ length: facets ** 2 }, (_, i) => i).filter(
    (i) => !cover || i % facets < facets / 2,
  );
  const n = ids.length,
    samples = targetSamples(weights, n),
    normals = Array(facets ** 2).fill(null),
    hits = [];
  if (samples.length) {
    const cost = new Float64Array(n * n);
    ids.forEach((id, i) =>
      samples.forEach(([u, v], j) => {
        cost[i * n + j] =
          (u - ((id % facets) + 0.5) / facets) ** 2 +
          (v - (Math.floor(id / facets) + 0.5) / facets) ** 2;
      }),
    );
    const assigned = assignment(cost, n);
    ids.forEach((id, i) => {
      const src = mirrorPosition(id),
        dest = targetPosition(...samples[assigned[i]]);
      const d = dest.map((x, k) => x - src[k]),
        len = Math.hypot(...d);
      const bisector = [d[0] / len, 1 + d[1] / len, d[2] / len],
        mag = Math.hypot(...bisector);
      const normal = bisector.map((x) => x / mag);
      normals[id] = normal;
      const reflected = normal.map(
        (v, k) => 2 * normal[1] * v - (k === 1 ? 1 : 0),
      );
      const t = (dest[2] - src[2]) / reflected[2];
      hits.push([
        (src[0] + t * reflected[0] - 9) / 26,
        (src[1] + t * reflected[1] - 1.9) / 8.6,
      ]);
    });
  }
  // Equal physical beam widths in both axes. The full kernel (including
  // off-detector taps) sets normalization, so edge loss remains measurable.
  const width = 256,
    height = 96,
    flux = new Float64Array(width * height),
    sigmaY = 1.7,
    sigmaX = (sigmaY * width) / (mosaicAspect * height);
  for (const [u, v] of hits) {
    const cx = u * width - 0.5,
      cy = v * height - 0.5;
    const x0 = Math.floor(cx - 4 * sigmaX),
      y0 = Math.floor(cy - 4 * sigmaY);
    const nx = Math.ceil(cx + 4 * sigmaX) - x0 + 1,
      ny = Math.ceil(cy + 4 * sigmaY) - y0 + 1;
    const gx = new Float64Array(nx),
      gy = new Float64Array(ny);
    let sx = 0,
      sy = 0;
    for (let x = 0; x < nx; x++)
      sx += gx[x] = Math.exp(-0.5 * ((x + x0 - cx) / sigmaX) ** 2);
    for (let y = 0; y < ny; y++)
      sy += gy[y] = Math.exp(-0.5 * ((y + y0 - cy) / sigmaY) ** 2);
    for (let y = Math.max(0, -y0); y < Math.min(ny, height - y0); y++) {
      const wy = gy[y] / (sx * sy);
      for (let x = Math.max(0, -x0); x < Math.min(nx, width - x0); x++)
        flux[(y0 + y) * width + x0 + x] += wy * gx[x];
    }
  }
  const data = new Float32Array(3 * flux.length);
  let captured = 0;
  for (let i = 0; i < flux.length; i++) {
    captured += flux[i];
    const p = (flux[i] * 9 * width * height) / 16384;
    data[3 * i] = p;
    data[3 * i + 1] = p * 0.72;
    data[3 * i + 2] = p * 0.25;
  }
  return { frame: { width, height, data }, normals, flux, hits, captured };
}
