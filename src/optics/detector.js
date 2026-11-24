// Round nonnegative linear sensor values to nearest-even binary16 for WebGPU.
// The same HDR pixels feed the specimen and its enlarged Field view.
export function detectorPixels(frame) {
  const bits = new Uint32Array(
    frame.data.buffer,
    frame.data.byteOffset,
    frame.data.length,
  );
  const out = new Uint16Array(frame.width * frame.height * 4);
  for (let i = 0, j = 0; i < bits.length; i += 3, j += 4) {
    for (let c = 0; c < 3; c++) {
      const v = bits[i + c],
        exponent = (v >>> 23) & 255;
      if (v >>> 31 || exponent < 102) {
        out[j + c] = 0;
        continue;
      }
      if (exponent < 113) {
        const shift = 126 - exponent,
          mant = (v & 0x7fffff) | 0x800000;
        out[j + c] =
          (mant + ((1 << (shift - 1)) - 1) + ((mant >>> shift) & 1)) >>> shift;
      } else {
        out[j + c] = Math.min(
          0x7bff,
          ((v + 0xfff + ((v >>> 13) & 1)) >>> 13) - 0x1c000,
        );
      }
    }
    out[j + 3] = 0x3c00;
  }
  return out;
}
