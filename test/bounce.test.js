import { OrthographicCamera } from "three/webgpu";
import test from "node:test";
import assert from "node:assert/strict";
import { geometry } from "../src/chamber.js";
import { makeRoom, emission, graph } from "../src/bounce/patches.js";
import { solveHemicube } from "../src/bounce/hemicube.js";
import { solveBitmask } from "../src/bounce/bitmask.js";
import { solvePackets } from "../src/bounce/packets.js";
import { solveCompletion } from "../src/bounce/completion.js";
import { solveCascades } from "../src/bounce/cascades.js";
import { solveWavelets } from "../src/bounce/wavelets.js";
import { solveCapacity } from "../src/bounce/capacity.js";

const room = (id, a, b) => makeRoom(geometry(id, a, b, 0.5), id);
const sum = (a) => a.reduce((s, v) => s + v, 0);
function difference(a, b) {
  return a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0);
}
test("opaque antiradiance cancels the extra layers in a matched hemicube gather", () => {
  const r = room("antiradiance", 0.6, 1);
  const corrected = solveHemicube(r, { a: 0.6, b: 1, variant: 1 });
  const reference = solveHemicube(makeRoom(r.boxes, "hemicube"), {
    a: 3,
    b: 12,
  }).rgb;
  assert(difference(corrected.rgb, reference) < 0.001);
  assert(sum(corrected.compare) > sum(corrected.rgb));
});
test("zero hemicube bounces emits only the lamp; later bounces add energy", () => {
  const r = room("hemicube", 0, 8),
    s = { a: 0, b: 8 };
  assert.deepEqual(solveHemicube(r, s).rgb, emission(r, s));
  const one = solveHemicube(r, { ...s, a: 1 }).rgb,
    two = solveHemicube(r, { ...s, a: 2 }).rgb;
  assert(sum(two) > sum(one));
});
test("visibility masks respond to the observer and produce positive indirect illumination", () => {
  const r = room("bitmask", 25, 1.3),
    s = { a: 25, b: 1.3, variant: 1 };
  function project(offset) {
    const camera = new OrthographicCamera(-34, 34, 22, -22, 0.1, 400);
    camera.position.set(19 + offset[0], 4 + offset[1], 15 + offset[2]);
    camera.lookAt(19, 4, 15);
    camera.updateMatrixWorld();
    const m = camera.matrixWorld.elements;
    return {
      eye: m.slice(12, 15),
      right: m.slice(0, 3),
      up: m.slice(4, 7),
      back: m.slice(8, 11),
      width: 68,
      height: 44,
    };
  }
  const a = solveBitmask(r, { ...s, camera: project([49, 36, 57]) }).rgb;
  const b = solveBitmask(r, { ...s, camera: project([10, 46, 75]) }).rgb;
  assert(sum(a) > 0 && sum(b) > 0 && difference(a, b) > 1);
});
test("rotor routing is deterministic across batch boundaries", () => {
  const s = { a: 64, b: 0, releases: 1 },
    r = room("rotor", 64, 0);
  solvePackets(r, s);
  const a = solvePackets(r, s).rgb;
  const b = solvePackets(room("rotor", 64, 0), { ...s, releases: 2 }).rgb;
  assert.deepEqual(a, b);
  assert.equal(r.rotors.total, 128);
});
test("matrix reconstruction recovers the full virtual-light solution at 100 percent sampling", () => {
  const r = room("completion", 100, 0.45);
  const reference = solveCompletion(r, { a: 100, b: 0.45, variant: 1 }).rgb;
  assert.deepEqual(
    solveCompletion(r, { a: 100, b: 0.45, variant: 0 }).rgb,
    reference,
  );
  const sampled = solveCompletion(r, { a: 15, b: 0.45, variant: 0 }).rgb;
  assert(sampled.every(Number.isFinite) && difference(sampled, reference) > 0);
});
test("isolated later cascades have zero energy after one transfer and gain energy on feedback", () => {
  const r = room("cascades", 0.55, 1);
  assert.equal(sum(solveCascades(r, { a: 0.55, b: 1, variant: 1 }).rgb), 0);
  assert(sum(solveCascades(r, { a: 0.55, b: 3, variant: 1 }).rgb) > 1);
});
test("a full Haar basis reconstructs a painted emitter's uncompressed three-transfer response", () => {
  const r = room("wavelets", 0.4, 64),
    pattern = Array.from({ length: 64 }, (_, i) =>
      i % 8 === 2 || i === 47 ? 1 : 0,
    );
  const result = solveWavelets(r, { a: 0.4, b: 64, pattern }).rgb,
    rows = graph(r);
  let last = new Float32Array(r.n * 3);
  for (const i of r.lamps)
    for (let c = 0; c < 3; c++)
      last[i * 3 + c] = pattern[r.patches[i].cell] * [76, 68, 59][c];
  const expected = last.slice();
  for (let k = 0; k < 3; k++) {
    const next = new Float32Array(last.length);
    for (let i = 0; i < r.n; i++)
      for (let j = 0; j < r.n; j++)
        if (rows[i][j])
          for (let c = 0; c < 3; c++)
            next[i * 3 + c] +=
              r.patches[i].tint[c] * rows[i][j] * last[j * 3 + c];
    for (let i = 0; i < last.length; i++) expected[i] += next[i];
    last = next;
  }
  // Emitting tile faces display the paint independently of their reflected component.
  for (const i of r.lamps)
    for (let c = 0; c < 3; c++)
      expected[i * 3 + c] = pattern[r.patches[i].cell] * [76, 68, 59][c];
  assert(difference(result, expected) / sum(expected) < 1e-5);
  assert.equal(
    sum(solveWavelets(r, { a: 0.4, b: 64, pattern: Array(64).fill(0) }).rgb),
    0,
  );
});
test("red steals blue from the receiving floor only with a constrained doorway", () => {
  const r = room("capacity", 1.4, 16);
  function blue(a, variant) {
    const { rgb } = solveCapacity(r, { a, b: 16, variant });
    return r.patches.reduce(
      (s, p, i) =>
        s +
        (p.object === 0 && p.x > 18 && p.z > 12 && p.z < 25
          ? rgb[i * 3 + 2]
          : 0),
      0,
    );
  }
  assert(blue(3, 0) < blue(0.1, 0) * 0.9);
  assert(blue(3, 1) >= blue(0.1, 1));
});
