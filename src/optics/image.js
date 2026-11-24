// Linear RGB samples, with the first row at the bottom of the detector.
export function image(width, height, sample) {
  const data = new Float32Array(3 * width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      data.set(
        sample((x + 0.5) / width, (y + 0.5) / height, x, y),
        3 * (y * width + x),
      );
    }
  return { width, height, data };
}
export const tau = 2 * Math.PI;
export const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
