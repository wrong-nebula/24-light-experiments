import { detectorPixels } from "./detector.js";
import { diffraction, talbotCarpet } from "./diffraction.js";
import { fluorescentRelay, winding } from "./relay.js";
import { mirrorMosaic, pattern } from "./mosaic.js";
import { photoelastic } from "./elastic.js";
import { foldedSheet, strips, across } from "./fold.js";
import { rankOne } from "./radiosity.js";
import { measure, reconstruct, targetPoints } from "./transient.js";
let lastGratingPitch,
  samples,
  geometrySent = false;
let mirrorKey,
  mirrorStates = [];
function evaluate({ id, a, b, variant, brush, brushVersion }) {
  if (id === "talbot") {
    const { frame, period, error } = diffraction(a, b);
    const carpet =
      b !== lastGratingPitch ? detectorPixels(talbotCarpet(b)) : undefined;
    lastGratingPitch = b;
    return {
      frame,
      carpet,
      info: `Card ${a.toFixed(2)} mm · self-image ${period.toFixed(2)} mm · relative RMS error ${(100 * error).toFixed(2)}%`,
    };
  }
  if (id === "fluorescence") {
    const { frame, colors, stages } = fluorescentRelay(a, b, variant);
    return {
      frame,
      colors,
      info: `${variant ? "Green → red first" : "UV → green first"} · receiver ${(stages[2][4] * 100).toFixed(2)}% of unit source power in red`,
    };
  }
  if (id === "winding") {
    const { frame, colors, classes, ordinary } = winding(b, a, variant);
    const j = 32,
      value = a ? classes[a - 1][j] : ordinary[j];
    return {
      frame,
      colors,
      info: `Opposite receiver · ${((100 * value) / ordinary[j]).toFixed(1)}% of all-route power`,
    };
  }
  if (id === "mosaic") {
    const key = brush ? "paint:" + brushVersion : "preset:" + a;
    if (key !== mirrorKey) {
      mirrorStates = [];
      mirrorKey = key;
    }
    const { frame, normals, hits, captured } = (mirrorStates[variant] ??=
      mirrorMosaic(brush || pattern(a), variant));
    return {
      frame,
      normals,
      info: `${hits.length} active facets · ${((100 * captured) / 144).toFixed(1)}% incident power delivered`,
    };
  }
  if (id === "photoelastic") {
    const { frame, plate } = photoelastic(a, b, variant);
    return {
      frame,
      info: `${plate.triangles.length.toLocaleString("en-US")} stress elements · ${variant ? "parallel" : "crossed"} polarizers`,
    };
  }
  if (id === "folded") {
    const { frame, positions, colors, field } = foldedSheet(a, b, variant);
    const tip = field[(across / 2) * (strips + 1) + strips];
    return {
      frame,
      positions,
      colors,
      info: `${variant ? "Joined" : "Open"} tips · far tip ${(100 * tip).toFixed(2)}% of source intensity`,
    };
  }
  if (id === "rank-one") {
    const { frame, colors, patches, error, tile } = rankOne(a, b, variant);
    const payload = {
      frame,
      colors,
      tile,
      info: variant
        ? `Fresh solve · maximum difference ${error.toExponential(2)}`
        : `${patches.length} diffuse patches · one updated matrix row per channel`,
    };
    if (!geometrySent) {
      payload.patches = patches.map(
        ({ c, n, axes, w, h, kind, block, face, i, j }) => ({
          block,
          face,
          i,
          j,
          c,
          n,
          axes,
          w,
          h,
          kind,
        }),
      );
      geometrySent = true;
    }
    return payload;
  }
  const key = a + "," + b;
  if (samples?.key !== key) {
    const points = targetPoints(a),
      data = measure(points, b);
    samples = {
      key,
      ...reconstruct(data),
      points,
      count: data.wall.length,
      returns: data.histograms.map((h) => h.reduce((s, v) => s + v, 0)),
    };
  }
  return {
    frame: samples.frame,
    points: samples.points,
    returns: samples.returns,
    info: `${samples.count} scan positions · ${((b * 0.299792458) / 2).toFixed(2)} mm radial bin · 48 × 18 × 48 voxels`,
  };
}
self.onmessage = ({ data }) => {
  try {
    const result = evaluate(data);
    const { frame, ...payload } = result;
    payload.pixels = detectorPixels(frame);
    const transfers = [payload.pixels.buffer];
    if (payload.carpet) transfers.push(payload.carpet.buffer);
    self.postMessage(payload, transfers);
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
