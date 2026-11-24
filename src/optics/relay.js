import { tau } from "./image.js";
const wave = [365, 450, 530, 600, 650];
export function fluorescentRelay(power, yieldFraction, reversed) {
  const tiles = reversed
    ? [
        [2, 4],
        [0, 2],
      ]
    : [
        [0, 2],
        [2, 4],
      ];
  const stages = [[power, 0, 0, 0, 0]];
  for (const [input, output] of tiles) {
    const before = stages.at(-1),
      after = before.map((x) => x * 0.055);
    // Transfer of radiant power includes collection, absorption and quantum yield.
    after[output] +=
      (before[input] * 0.85 * yieldFraction * wave[input]) / wave[output];
    stages.push(after.map((x) => x * 0.86));
  }
  const visible = (v) => [v[4] + v[3] * 0.9, v[2] + v[3] * 0.35, v[1]];
  const rgb = visible(stages[2]);
  const profile = receiverProfile(),
    data = new Float32Array(profile.length * 3);
  for (let i = 0; i < profile.length; i++)
    for (let c = 0; c < 3; c++) data[i * 3 + c] = rgb[c] * profile[i];
  const frame = { width: 128, height: 96, data };
  return { stages, colors: stages.map(visible), frame };
}

// Irradiance footprint from a parallel rectangular diffuse source. Normalize
// its area mean since spectral throughput already includes collection losses.
let profile;
function receiverProfile() {
  if (profile) return profile;
  profile = new Float32Array(128 * 96);
  let sum = 0;
  for (let y = 0; y < 96; y++)
    for (let x = 0; x < 128; x++) {
      let irradiance = 0;
      for (let j = 0; j < 4; j++)
        for (let i = 0; i < 4; i++) {
          const dx = (x + 0.5) / 128 - 0.5 - ((i + 0.5) / 4 - 0.5) * 0.52;
          const dy =
            ((y + 0.5) / 96 - 0.5) * 0.88 - ((j + 0.5) / 4 - 0.5) * 0.38;
          const depth = 0.42,
            r2 = dx * dx + dy * dy + depth * depth;
          irradiance += (depth * depth) / (r2 * r2);
        }
      sum += irradiance;
      profile[y * 128 + x] = irradiance;
    }
  for (let i = 0; i < profile.length; i++) profile[i] *= profile.length / sum;
  return profile;
}
const sectors = 64,
  width = 160,
  height = 128;
let ringPixels;
function rasterRing(colors) {
  if (!ringPixels) {
    ringPixels = [];
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const dx = (x + 0.5 - width / 2) / 4,
          dz = (height / 2 - y - 0.5) / 4,
          r = Math.hypot(dx, dz);
        const coverage = Math.max(
          0,
          Math.min(1, (r - 5.8) * 4 + 0.5, (11.9 - r) * 4 + 0.5),
        );
        if (!coverage) continue;
        const phase = ((Math.atan2(dz, dx) / tau + 1) % 1) * sectors,
          sector = Math.floor(phase);
        ringPixels.push({
          pixel: 3 * (y * width + x),
          sector,
          next: (sector + 1) % sectors,
          blend: phase - sector,
          coverage,
        });
      }
  }
  const data = new Float32Array(3 * width * height);
  for (const { pixel, sector, next, blend, coverage } of ringPixels)
    for (let k = 0; k < 3; k++)
      data[pixel + k] =
        1.25 *
        coverage *
        (colors[sector][k] + blend * (colors[next][k] - colors[sector][k]));
  return { width, height, data };
}
export function winding(r, selected = 0, tint = false) {
  // Green's function of the two-direction persistent walk on the infinite
  // lifted line. Its off-source response is C*h^|j|; wrap its geometric tails.
  const p = 0.96,
    beta = 2 * p - 1,
    a = 1 + beta * r * r,
    b = 2 * p * r;
  const disc = Math.sqrt((1 - r) * (1 - beta * r) * (a + b)),
    h = b / (a + disc);
  const delta = beta / (2 * p),
    C = (1 - delta * a) / disc,
    lap = h ** sectors;
  const classes = Array.from({ length: 3 }, () => new Float64Array(sectors)),
    ordinary = new Float64Array(sectors);
  const palette = tint
    ? [
        [1, 0.24, 0.055],
        [0.025, 0.66, 1],
        [0.64, 0.13, 1],
      ]
    : Array(3).fill([1, 0.74, 0.42]);
  const colors = [];
  for (let j = 0; j < sectors; j++) {
    const cw = C * h ** j,
      ccw = C * h ** (sectors - j);
    classes[0][j] = cw + (j === 0 ? delta : 0);
    classes[1][j] = j === 0 ? 0 : ccw;
    classes[2][j] =
      j === 0 ? (2 * C * lap) / (1 - lap) : ((cw + ccw) * lap) / (1 - lap);
    ordinary[j] = classes[0][j] + classes[1][j] + classes[2][j];
    colors.push(
      [0, 1, 2].map((c) =>
        classes.reduce(
          (s, row, k) =>
            s + (!selected || selected === k + 1 ? row[j] * palette[k][c] : 0),
          0,
        ),
      ),
    );
  }
  return { frame: rasterRing(colors), classes, colors, ordinary };
}
