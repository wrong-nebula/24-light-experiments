import { makeRoom, signature, atlasWidth, atlasHeight } from "./patches.js";
import { solveHemicube } from "./hemicube.js";
import { solvePackets } from "./packets.js";
import { solveCompletion } from "./completion.js";
import { solveBitmask } from "./bitmask.js";
import { solveCascades } from "./cascades.js";
import { solveWavelets } from "./wavelets.js";
import { solveCapacity } from "./capacity.js";
const solvers = {
  antiradiance: solveHemicube,
  hemicube: solveHemicube,
  bitmask: solveBitmask,
  rotor: solvePackets,
  completion: solveCompletion,
  cascades: solveCascades,
  wavelets: solveWavelets,
  capacity: solveCapacity,
};
let room, key;
const bits = new DataView(new ArrayBuffer(4));
function toHalf(value) {
  bits.setFloat32(0, Math.max(0, Math.min(65504, value)));
  const v = bits.getUint32(0),
    exp = ((v >>> 23) & 255) - 127,
    mant = v & 0x7fffff;
  if (exp < -24) return 0;
  if (exp < -14) return (mant | 0x800000) >> (-exp - 1);
  return ((exp + 15) << 10) | (mant >>> 13);
}
self.onmessage = ({ data: s }) => {
  try {
    const nextKey = signature(s.items);
    if (nextKey !== key || room?.id !== s.id) {
      room = makeRoom(s.items, s.id);
      key = nextKey;
    }
    const { rgb, compare, info } = solvers[s.id](room, s);
    const pixels = new Uint16Array(atlasWidth * atlasHeight * 4);
    for (let i = 0; i < room.n; i++) {
      const k = room.patches[i].texel * 4;
      for (let c = 0; c < 3; c++) {
        if (!Number.isFinite(rgb[3 * i + c]))
          throw Error("The lighting solve produced a nonfinite value.");
        pixels[k + c] = toHalf(rgb[3 * i + c]);
        if (compare) pixels[k + 96 * 4 + c] = toHalf(compare[3 * i + c]);
      }
    }
    self.postMessage({ pixels, info, compare: Boolean(compare) }, [
      pixels.buffer,
    ]);
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
