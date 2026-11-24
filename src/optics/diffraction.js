import { tau } from "./image.js";

export const talbotDistance = (pitch) => (2 * pitch * pitch) / 532; // µm pitch, nm wavelength, mm result
function fftLine(real, imag, offset, stride, n, inverse) {
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const a = offset + i * stride,
        b = offset + j * stride;
      [real[a], real[b]] = [real[b], real[a]];
      [imag[a], imag[b]] = [imag[b], imag[a]];
    }
  }
  for (let span = 2; span <= n; span *= 2) {
    const angle = (inverse ? tau : -tau) / span;
    for (let k = 0; k < span / 2; k++) {
      const wr = Math.cos(k * angle),
        wi = Math.sin(k * angle);
      for (let j = k; j < n; j += span) {
        const a = offset + j * stride,
          b = a + (span * stride) / 2;
        const tr = wr * real[b] - wi * imag[b],
          ti = wr * imag[b] + wi * real[b];
        real[b] = real[a] - tr;
        imag[b] = imag[a] - ti;
        real[a] += tr;
        imag[a] += ti;
      }
    }
  }
}
// Both the cross-grating and the Fresnel transfer function are separable.
export function grating(u, v) {
  return ((u * 8) % 1 < 0.5 ? 1 : 0.12) * ((v * 8) % 1 < 0.5 ? 1 : 0.72);
}
const cell = 512,
  detectorSize = 256;
const spectra = new Map();
function propagatedIntegral(dark, fraction) {
  let spectrum = spectra.get(dark);
  if (!spectrum) {
    const r = Float64Array.from({ length: cell }, (_, j) =>
      j < cell / 2 ? 1 : dark,
    );
    const i = new Float64Array(cell);
    fftLine(r, i, 0, 1, cell, false);
    spectrum = [r, i];
    spectra.set(dark, spectrum);
  }
  const r = new Float64Array(cell),
    i = new Float64Array(cell);
  for (let k = 0; k < cell; k++) {
    const order = k < cell / 2 ? k : k - cell,
      phase = -tau * ((order * order * fraction) % 1);
    const c = Math.cos(phase),
      s = Math.sin(phase);
    r[k] = c * spectrum[0][k] - s * spectrum[1][k];
    i[k] = s * spectrum[0][k] + c * spectrum[1][k];
  }
  fftLine(r, i, 0, 1, cell, true);
  const integral = new Float64Array(cell + 1);
  for (let k = 0; k < cell; k++)
    integral[k + 1] = integral[k] + (r[k] ** 2 + i[k] ** 2) / (cell * cell);
  // A primitive over the periodically repeated irradiance cell.
  return function primitive(x) {
    const cycle = Math.floor(x / cell),
      local = x - cycle * cell,
      k = Math.floor(local);
    return (
      cycle * integral[cell] +
      integral[k] +
      (local - k) * (integral[k + 1] - integral[k])
    );
  };
}
function axisResponse(dark, fraction, pitch) {
  const primitive = propagatedIntegral(dark, fraction);
  function aperture(x) {
    const cycle = Math.floor(x / cell),
      local = x - cycle * cell;
    return (
      (cycle * cell * (1 + dark * dark)) / 2 +
      Math.min(local, cell / 2) +
      Math.max(0, local - cell / 2) * dark * dark
    );
  }
  const size = (800 * cell) / (pitch * detectorSize),
    measured = new Float64Array(detectorSize),
    reference = new Float64Array(detectorSize);
  for (let k = 0; k < detectorSize; k++) {
    measured[k] = (primitive((k + 1) * size) - primitive(k * size)) / size;
    reference[k] = (aperture((k + 1) * size) - aperture(k * size)) / size;
  }
  return { measured, reference };
}
export function diffraction(distance, pitch) {
  const period = talbotDistance(pitch),
    x = axisResponse(0.12, distance / period, pitch),
    y = axisResponse(0.72, distance / period, pitch);
  const data = new Float32Array(3 * detectorSize ** 2);
  let squared = 0,
    total = 0,
    k = 0;
  for (let j = 0; j < detectorSize; j++)
    for (let i = 0; i < detectorSize; i++) {
      const power = x.measured[i] * y.measured[j],
        ref = x.reference[i] * y.reference[j];
      squared += (power - ref) ** 2;
      total += ref * ref;
      data[k++] = 0.16 * power;
      data[k++] = 1.5 * power;
      data[k++] = 0.31 * power;
    }
  return {
    frame: { width: detectorSize, height: detectorSize, data },
    period,
    error: Math.sqrt(squared / total),
  };
}
// Longitudinal irradiance section sampled from the same propagator as the card.
let carpetIntegrals;
export function talbotCarpet(pitch) {
  const width = 161,
    height = 128,
    data = new Float32Array(width * height * 3);
  carpetIntegrals ??= Array.from({ length: width }, (_, x) => {
    const fraction = (1.25 * x) / (width - 1);
    return [
      propagatedIntegral(0.12, fraction),
      propagatedIntegral(0.72, fraction),
    ];
  });
  const step = (800 * cell) / (pitch * height),
    midStart = (step * height) / 2;
  for (let x = 0; x < width; x++) {
    const [horizontal, vertical] = carpetIntegrals[x],
      mid = (vertical(midStart + step / 2) - vertical(midStart)) / (step / 2);
    let previous = horizontal(0);
    for (let j = 0; j < height; j++) {
      const end = horizontal((j + 1) * step),
        i = 3 * (j * width + x),
        p = ((end - previous) * mid) / step;
      previous = end;
      data[i] = 0.16 * p;
      data[i + 1] = 1.5 * p;
      data[i + 2] = 0.31 * p;
    }
  }
  return { width, height, data };
}
