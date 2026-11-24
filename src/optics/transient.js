import { image, clamp } from "./image.js";
const pulseSigma = 0.006; // effective one-way range spread of the pulsed instrument
const speed = 0.000299792458; // metres per picosecond
const xs = 48,
  ys = 18,
  zs = 48;
export const volumeShape = [xs, ys, zs];
export const targetWorld = ([x, y, z]) => [
  26 + 24 * x,
  1.1 + 24 * y,
  1.65 + 26 * z,
];
export function targetPoints(position) {
  const dx = (position - 0.5) * 0.3,
    pts = [];
  // A dogleg of three connected reflective strips at two distinct depths.
  for (let k = 0; k < 13; k++)
    for (let j = 0; j < 3; j++) {
      const t = k / 12,
        h = 0.12 + 0.04 * j;
      pts.push(
        [dx - 0.135 + 0.14 * t, h, 0.37],
        [dx + 0.005, h, 0.37 + 0.19 * t],
        [dx + 0.005 + 0.14 * t, h, 0.56],
      );
    }
  return pts;
}
// Tabulated integral of the temporal Gaussian; detector bins can be much
// wider than the pulse. Differences of CDF values integrate clipped bins.
const cdf = new Float64Array(6145);
for (let i = 1; i < cdf.length; i++) {
  const x = (i - 1) / 512 - 6,
    y = i / 512 - 6;
  cdf[i] =
    cdf[i - 1] + (Math.exp(-0.5 * x * x) + Math.exp(-0.5 * y * y)) / 1024;
}
const norm = cdf.at(-1);
for (let i = 0; i < cdf.length; i++) cdf[i] /= norm;
function gaussianCDF(x) {
  if (x <= -6) return 0;
  if (x >= 6) return 1;
  const t = (x + 6) * 512,
    k = Math.floor(t);
  return cdf[k] + (t - k) * (cdf[k + 1] - cdf[k]);
}
export function measure(points, bin) {
  const wall = [],
    histograms = [],
    dr = (speed * bin) / 2,
    count = Math.ceil(1.45 / dr);
  for (let j = 0; j < 9; j++)
    for (let i = 0; i < 11; i++) {
      const x = -0.46 + i * 0.092,
        y = 0.04 + j * 0.043;
      wall.push([x, y, 0]);
      const hist = new Float64Array(count);
      for (const [px, py, pz] of points) {
        const r = Math.hypot(px - x, py - y, pz);
        const weight = (pz / r) ** 2 / (points.length * r ** 4);
        const lo = Math.max(0, Math.floor((r - 6 * pulseSigma) / dr)),
          hi = Math.min(count - 1, Math.floor((r + 6 * pulseSigma) / dr));
        let prev = gaussianCDF((lo * dr - r) / pulseSigma);
        for (let k = lo; k <= hi; k++) {
          const end = gaussianCDF(((k + 1) * dr - r) / pulseSigma);
          hist[k] += weight * (end - prev);
          prev = end;
        }
      }
      histograms.push(hist);
    }
  return { wall, histograms, dr };
}
// Refine a backprojected volume by predicting the detector histograms. The
// forward and adjoint operators share radial interpolation, attenuation and
// pulse width. Positive multiplicative updates suppress inconsistent arcs.
function matchReturns(volume, rows, sensitivities, rangeStep) {
  const sigma = pulseSigma / rangeStep;
  const kernel = Float64Array.from({ length: 7 }, (_, k) =>
    Math.exp(-0.5 * ((k - 3) / sigma) ** 2),
  );
  const area = kernel.reduce((s, v) => s + v, 0);
  for (let k = 0; k < 7; k++) kernel[k] /= area;
  function blur(values, out) {
    for (let i = 0; i < out.length; i++) {
      let sum = 0;
      for (
        let k = Math.max(0, 3 - i);
        k < Math.min(7, values.length + 3 - i);
        k++
      )
        sum += kernel[k] * values[i + k - 3];
      out[i] = sum;
    }
  }
  let peak = 0;
  for (const v of volume) peak = Math.max(peak, v);
  if (!peak) return;
  for (let j = 0; j < volume.length; j++)
    volume[j] = Math.max(volume[j], 0.025 * peak);
  const update = new Float64Array(volume.length);
  const len = rows[0].observed.length,
    predicted = new Float64Array(len),
    response = new Float64Array(len);
  // Ordered subsets interleave spots over both axes of the wall. Each update
  // is normalized by that subset's own sensitivity.
  for (let iter = 0; iter < 3 * sensitivities.length; iter++) {
    const subset = iter % sensitivities.length,
      sensitivity = sensitivities[subset];
    update.fill(0);
    for (let i = subset; i < rows.length; i += sensitivities.length) {
      const { bins, fractions, gains, observed } = rows[i];
      predicted.fill(0);
      for (let j = 0; j < volume.length; j++) {
        const k = bins[j],
          a = fractions[j],
          signal = volume[j] * gains[j];
        predicted[k] += (1 - a) * signal;
        predicted[k + 1] += a * signal;
      }
      blur(predicted, response);
      for (let k = 0; k < len; k++)
        response[k] = observed[k] / Math.max(1e-12, response[k]);
      blur(response, predicted);
      const correction = predicted;
      for (let j = 0; j < volume.length; j++) {
        const k = bins[j],
          a = fractions[j];
        update[j] +=
          gains[j] * ((1 - a) * correction[k] + a * correction[k + 1]);
      }
    }
    for (let j = 0; j < volume.length; j++)
      volume[j] *= update[j] / sensitivity[j];
  }
}
let geometryKey, scannerRanges;
function rangesForWall(wall) {
  const key = wall.map((p) => p.join(",")).join(";");
  if (key === geometryKey) return scannerRanges;
  geometryKey = key;
  scannerRanges = wall.map(([wx, wy, wz]) => {
    const ranges = new Float32Array(xs * ys * zs);
    for (let z = 0; z < zs; z++)
      for (let y = 0; y < ys; y++) {
        const dy = 0.025 + (0.36 * (y + 0.5)) / ys - wy,
          dz = 0.23 + (0.52 * (z + 0.5)) / zs - wz,
          yz = dy * dy + dz * dz;
        for (let x = 0; x < xs; x++) {
          const dx = -0.36 + (0.72 * (x + 0.5)) / xs - wx;
          ranges[(z * ys + y) * xs + x] = Math.sqrt(dx * dx + yz);
        }
      }
    return ranges;
  });
  return scannerRanges;
}
export function reconstruct({ wall, histograms, dr }) {
  // Only measured returns reach this function. A local time high-pass suppresses
  // the low-frequency haze of plain spherical backprojection.
  const lag = Math.max(2, Math.round((2 * pulseSigma) / dr));
  const filtered = histograms.map((hist) =>
    hist.map((v, k) => v - 0.5 * ((hist[k - lag] || 0) + (hist[k + lag] || 0))),
  );
  const volume = new Float32Array(xs * ys * zs),
    projection = new Float32Array(xs * zs);
  const group = Math.max(1, Math.ceil(pulseSigma / dr)),
    rangeStep = group * dr;
  // In this noiseless, fully visible forward model a reflector must lie in
  // the measured range envelope of each illuminated scan. Expand bounds by
  // the voxel half-diagonal and pulse width before discarding empty space.
  const margin =
    Math.hypot(0.72 / xs, 0.36 / ys, 0.52 / zs) / 2 + 2 * pulseSigma;
  const ranges = rangesForWall(wall);
  const candidates = Int32Array.from({ length: volume.length }, (_, j) => j);
  let count = candidates.length,
    illuminated = false;
  for (let i = 0; i < wall.length; i++) {
    const h = histograms[i];
    let lo = 0,
      hi = h.length - 1;
    while (lo <= hi && h[lo] === 0) lo++;
    while (hi >= lo && h[hi] === 0) hi--;
    if (lo > hi) continue;
    illuminated = true;
    const low = lo * dr - margin,
      high = (hi + 1) * dr + margin,
      range = ranges[i];
    let kept = 0;
    for (let j = 0; j < count; j++) {
      const idx = candidates[j],
        r = range[idx];
      if (r >= low && r <= high) candidates[kept++] = idx;
    }
    count = kept;
  }
  const indices = candidates.subarray(0, illuminated ? count : 0),
    values = new Float64Array(indices.length);
  const sensitivity = Array.from(
    { length: Math.min(3, wall.length) },
    () => new Float64Array(values.length),
  );
  const depthSquared = Float64Array.from(
    indices,
    (i) => (0.23 + (0.52 * (Math.floor(i / (xs * ys)) + 0.5)) / zs) ** 2,
  );
  const rows = histograms.map((hist, i) => {
    const observed = new Float64Array(Math.ceil(hist.length / group) + 1);
    for (let k = 0; k < hist.length; k++)
      observed[Math.floor(k / group)] += hist[k];
    const bins = new Uint16Array(values.length),
      fractions = new Float32Array(values.length),
      gains = new Float32Array(values.length);
    for (let j = 0; j < values.length; j++) {
      const r = ranges[i][indices[j]],
        r2 = r * r;
      const t = r / dr - 0.5,
        k = Math.floor(t),
        a = t - k,
        h = filtered[i];
      values[j] += ((1 - a) * h[k] + a * h[k + 1]) * r2 * r2;
      const bin = r / rangeStep - 0.5;
      bins[j] = Math.floor(bin);
      fractions[j] = bin - bins[j];
      gains[j] = depthSquared[j] / (r2 * r2 * r2);
      sensitivity[i % sensitivity.length][j] += gains[j];
    }
    return { observed, bins, fractions, gains };
  });
  for (let j = 0; j < values.length; j++)
    values[j] = Math.max(0, values[j] / wall.length);
  matchReturns(values, rows, sensitivity, rangeStep);
  for (let j = 0; j < values.length; j++) volume[indices[j]] = values[j];
  let peak = 0;
  for (let j = 0; j < volume.length; j++) {
    const idx = Math.floor(j / (xs * ys)) * xs + (j % xs);
    projection[idx] = Math.max(projection[idx], volume[j]);
    peak = Math.max(peak, volume[j]);
  }
  const frame = image(xs, zs, (_u, _v, x, z) => {
    const v =
      Math.asinh(3 * clamp(projection[z * xs + x] / (peak || 1))) /
      Math.asinh(3);
    return [v * 0.1, v * 0.76, v * 1.42];
  });
  return {
    volume,
    projection,
    frame,
    peak,
    shape: volumeShape,
    active: indices.length,
  };
}
