import test from "node:test";
import assert from "node:assert/strict";
import { diffraction, talbotDistance } from "../src/optics/diffraction.js";
import { fluorescentRelay, winding } from "../src/optics/relay.js";
import { pattern, mirrorMosaic, stroke } from "../src/optics/mosaic.js";
import { photoelastic } from "../src/optics/elastic.js";
import { foldedSheet, strips, across } from "../src/optics/fold.js";
import { detectorPixels } from "../src/optics/detector.js";
import { rankOne, stairTransport } from "../src/optics/radiosity.js";
import { targetPoints, measure, reconstruct } from "../src/optics/transient.js";
import { studies } from "../src/catalog.js";
const sum = (a) => a.reduce((s, v) => s + v, 0);
const near = (a, b, tol = 1e-9) =>
  assert(Math.abs(a - b) <= tol, `${a} differs from ${b}`);
test("the original 16 links retain their positions and the missing set follows in proposal order", () => {
  assert.equal(studies.length, 24);
  assert.equal(studies[15].id, "capacity");
  assert.deepEqual(
    studies.slice(16).map((s) => s.id),
    [
      "talbot",
      "fluorescence",
      "winding",
      "mosaic",
      "photoelastic",
      "folded",
      "rank-one",
      "nlos",
    ],
  );
});
test("Fresnel propagation conserves energy and reconstructs the grating at its predicted distance", () => {
  const z = talbotDistance(100);
  near(z, 37.5939849624, 1e-10);
  near(talbotDistance(200), 4 * z);
  const a = diffraction(0, 100),
    b = diffraction(z, 100),
    fraction = diffraction(0.37 * z, 100);
  assert(b.error < 1e-12 && fraction.error > 0.1);
  near(sum(a.frame.data) / sum(fraction.frame.data), 1, 1e-7);
});
test("the ordered fluorescent pigments produce red power while reversal removes it", () => {
  const forward = fluorescentRelay(1, 1, false),
    reverse = fluorescentRelay(1, 1, true);
  assert(forward.stages[2][4] > 0.2);
  near(reverse.stages[2][4], 0);
  near(fluorescentRelay(1, 0, false).stages[2][4], 0);
  const red = forward.frame.data.filter((_, i) => i % 3 === 0);
  near(sum(red) / red.length, forward.stages[2][4], 1e-7);
  for (const [i, v] of forward.stages.entries())
    if (i) assert(sum(v) <= sum(forward.stages[i - 1]));
});
test("the three winding classes recover ordinary transport and their isolated colors sum", () => {
  const w = winding(0.95),
    solo = [1, 2, 3].map((k) => winding(0.95, k));
  for (let j = 0; j < 64; j++) {
    near(w.ordinary[j], sum(w.classes.map((row) => row[j])));
    near(w.colors[j][0], sum(solo.map((s) => s.colors[j][0])));
  }
  near(sum(winding(0.99).ordinary), 100, 1e-10);
  assert(w.classes.every((row) => row[32] > 0));
  near(w.classes[0][32], w.classes[1][32]);
});
test("reflected mirror rays deliver the painted target at half the power with half the facets", () => {
  const p = pattern(0);
  p.fill(0);
  stroke(p, 0.25, 0.75, 2);
  const full = mirrorMosaic(p, false),
    half = mirrorMosaic(p, true);
  near(sum(full.flux), 144, 0.00001);
  near(sum(half.flux), 72, 0.00001);
  for (const [u, v] of half.hits) {
    assert(Math.hypot(u - 0.25, v - 0.75) < 0.065);
  }
  assert.equal(half.normals.filter(Boolean).length, 72);
  for (let c = 0; c < 2; c++) {
    const target =
      p.reduce(
        (s, w, i) =>
          s + (w * ((c === 0 ? i % 48 : Math.floor(i / 48)) + 0.5)) / 48,
        0,
      ) / sum(p);
    near(sum(half.hits.map((h) => h[c])) / 72, target, 1e-10);
  }
  p.fill(0);
  p[0] = 1;
  const clipped = mirrorMosaic(p, true);
  assert(clipped.captured > 0 && clipped.captured < 72);
});
test("a perforated elastic plate shows stress concentrations and complementary polarizer transmission", () => {
  const off = photoelastic(0, 13, false),
    cross = photoelastic(0.8, 30, false),
    parallel = photoelastic(0.8, 30, true);
  near(sum(off.frame.data), 0);
  const { components, valid } = cross.plate;
  let maxDiff = 0,
    nearHole = 0,
    far = 0,
    nHole = 0,
    nFar = 0;
  for (let i = 0; i < valid.length; i++)
    if (valid[i]) {
      const k = 3 * i,
        d = Math.hypot(
          components[k] - components[k + 1],
          2 * components[k + 2],
        );
      const x = ((i % 192) + 0.5) / 64 - 1.5,
        y = (Math.floor(i / 192) + 0.5) / 64 - 1;
      if (Math.hypot(x, y) < 0.4 && Math.abs(x) < 0.13) {
        nearHole += d;
        nHole++;
      }
      if (Math.abs(x) > 1.26) {
        far += d;
        nFar++;
      }
      maxDiff = Math.max(maxDiff, d);
      for (let c = 0; c < 3; c++)
        near(cross.frame.data[k + c] + parallel.frame.data[k + c], 1, 1e-7);
    }
  assert(maxDiff > 2 && nearHole / nHole > (1.7 * far) / nFar);
});
test("optically joining adjacent tips opens a transfer route across the pleat", () => {
  const idx = (across / 2) * (strips + 1) + strips,
    open = foldedSheet(0, 2, false),
    closed = foldedSheet(0, 2, true);
  assert(open.field[idx] < 0.12 && closed.field[idx] > 0.75);
  assert(open.residual < 1e-11 && closed.residual < 1e-11);
  assert(closed.field.every((v) => v >= 0 && v <= 1.00001));
});
test("the cached rank-one update matches a fresh solve, including light on the screened stairs", () => {
  const base = rankOne(0, 1, false),
    red = rankOne(1, 1, true);
  assert(red.error < 1e-12);
  const { F, patches } = stairTransport();
  for (let i = 0; i < F.length; i++) {
    assert(sum(F[i]) <= 1 + 1e-12);
    for (let j = 0; j < i; j++)
      near(F[i][j] * patches[i].area, F[j][i] * patches[j].area, 1e-10);
  }
  const indirect = red.patches.map((p, i) =>
    p.kind === "step" ? red.colors[i][0] - base.colors[i][0] : 0,
  );
  assert(Math.max(...indirect) > 0.0001);
});
test("blind transient inversion localizes a moving reflector and broad bins spread its depth response", () => {
  const peakXYZ = (r) => {
    let index = 0;
    r.volume.forEach((v, i) => {
      if (v > r.volume[index]) index = i;
    });
    const [nx, ny, nz] = r.shape;
    return [
      -0.36 + (0.72 * ((index % nx) + 0.5)) / nx,
      0.025 + (0.36 * ((Math.floor(index / nx) % ny) + 0.5)) / ny,
      0.23 + (0.52 * (Math.floor(index / (nx * ny)) + 0.5)) / nz,
    ];
  };
  for (const position of [-0.16, 0.16]) {
    const expected = [position, 0.19, 0.48],
      thin = reconstruct(measure([expected], 20)),
      wide = reconstruct(measure([expected], 400));
    const xyz = peakXYZ(thin);
    assert(Math.hypot(...xyz.map((v, i) => v - expected[i])) < 0.045);
    const spread = (r) => r.projection.filter((v) => v > 0.3 * r.peak).length;
    assert(spread(wide) > spread(thin));
    assert.equal(targetPoints(0.1).length, 117);
  }
});

test("fractional Talbot recurrence at a quarter-period gives uniform integrated irradiance", () => {
  const pitch = 83,
    { frame } = diffraction(talbotDistance(pitch) / 4, pitch);
  const power = ((1 + 0.12 ** 2) * (1 + 0.72 ** 2)) / 4;
  for (let i = 1; i < frame.data.length; i += 3)
    near(frame.data[i], 1.5 * power, 2e-7);
});
test("linear detector upload preserves highlights, subnormals and nearest-even ties", () => {
  const data = new Float32Array([
    2,
    1 + 2 ** -11,
    1 + 3 * 2 ** -11,
    2 ** -24,
    2 ** -25,
    65504,
  ]);
  assert.deepEqual(
    [...detectorPixels({ width: 2, height: 1, data })],
    [0x4000, 0x3c00, 0x3c02, 0x3c00, 1, 0, 0x7bff, 0x3c00],
  );
});
