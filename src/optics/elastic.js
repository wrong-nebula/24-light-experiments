// Preconditioned conjugate gradients on the free displacement degrees of freedom.
function equilibrium(rows, fixed) {
  const n = rows.length,
    x = new Float64Array(n),
    r = new Float64Array(n),
    dir = new Float64Array(n),
    diagonal = new Float64Array(n);
  let rz = 0;
  for (let i = 0; i < n; i++) {
    if (fixed.has(i)) {
      x[i] = fixed.get(i);
      continue;
    }
    for (const [j, k] of rows[i]) if (fixed.has(j)) r[i] -= k * fixed.get(j);
    diagonal[i] = 1 / rows[i].get(i);
    dir[i] = r[i] * diagonal[i];
    rz += r[i] * dir[i];
  }
  const offsets = new Int32Array(n + 1),
    cols = [],
    values = [];
  for (let i = 0; i < n; i++) {
    if (!fixed.has(i))
      for (const [j, k] of rows[i])
        if (!fixed.has(j) && k !== 0) {
          cols.push(j);
          values.push(k);
        }
    offsets[i + 1] = cols.length;
  }
  const column = Int32Array.from(cols),
    weight = Float64Array.from(values);
  const tolerance = rz * 1e-18,
    ap = new Float64Array(n);
  for (let step = 0; step < 1400 && rz > tolerance; step++) {
    let denominator = 0;
    for (let i = 0; i < n; i++) {
      ap[i] = 0;
      for (let k = offsets[i]; k < offsets[i + 1]; k++)
        ap[i] += weight[k] * dir[column[k]];
      denominator += dir[i] * ap[i];
    }
    const alpha = rz / denominator;
    let next = 0;
    for (let i = 0; i < n; i++) {
      x[i] += alpha * dir[i];
      r[i] -= alpha * ap[i];
      next += r[i] * r[i] * diagonal[i];
    }
    const beta = next / rz;
    for (let i = 0; i < n; i++) dir[i] = r[i] * diagonal[i] + beta * dir[i];
    rz = next;
  }
  return x;
}
let plate;
export function elasticPlate() {
  if (plate) return plate;
  const angles = 96,
    layers = 14,
    n = (layers + 1) * angles,
    points = [],
    triangles = [],
    fixed = new Map();
  const rows = Array.from({ length: n * 2 }, () => new Map()),
    elements = [];
  // Map the outer ring to equally spaced points on the rectangle's four edges.
  for (let j = 0; j <= layers; j++)
    for (let k = 0; k < angles; k++) {
      const t = k / (angles / 4),
        side = Math.floor(t),
        f = t - side;
      const [ex, ey] = [
        [1.5, 2 * f - 1],
        [1.5 - 3 * f, 1],
        [-1.5, 1 - 2 * f],
        [-1.5 + 3 * f, -1],
      ][side];
      const len = Math.hypot(ex, ey),
        distance = 0.31 + (len - 0.31) * (j / layers) ** 1.18;
      points.push([(ex * distance) / len, (ey * distance) / len]);
      if (j === layers && Math.abs(ex) === 1.5)
        fixed.set(2 * (j * angles + k), -ex);
    }
  fixed.set(2 * ((layers * angles + angles / 8) | 0) + 1, 0);
  for (let j = 0; j < layers; j++)
    for (let k = 0; k < angles; k++) {
      const a = j * angles + k,
        b = j * angles + ((k + 1) % angles),
        c = a + angles,
        d = b + angles;
      triangles.push([a, c, d], [a, d, b]);
    }
  const nu = 0.29,
    d0 = 1 / (1 - nu * nu),
    shear = 0.5 / (1 + nu);
  for (const tri of triangles) {
    const [[x0, y0], [x1, y1], [x2, y2]] = tri.map((i) => points[i]);
    const twice = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    const gx = [y1 - y2, y2 - y0, y0 - y1].map((v) => v / twice),
      gy = [x2 - x1, x0 - x2, x1 - x0].map((v) => v / twice);
    const B = tri.flatMap((_, i) => [
      [gx[i], 0, gy[i]],
      [0, gy[i], gx[i]],
    ]);
    const dof = tri.flatMap((i) => [2 * i, 2 * i + 1]),
      area = Math.abs(twice) / 2;
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 6; j++) {
        const [x, y, s] = B[i],
          [X, Y, S] = B[j];
        const val =
          area * (d0 * (x * X + y * Y + nu * (x * Y + y * X)) + shear * s * S);
        const row = rows[dof[i]];
        row.set(dof[j], (row.get(dof[j]) || 0) + val);
      }
    elements.push({ B, dof, area });
  }
  const disp = equilibrium(rows, fixed),
    stress = points.map(() => [0, 0, 0]),
    weights = new Float64Array(n);
  triangles.forEach((tri, k) => {
    const { B, dof, area } = elements[k],
      strain = [0, 0, 0];
    for (let j = 0; j < 6; j++)
      for (let c = 0; c < 3; c++) strain[c] += B[j][c] * disp[dof[j]];
    const [ex, ey, g] = strain,
      s = [d0 * (ex + nu * ey), d0 * (ey + nu * ex), shear * g];
    for (const i of tri) {
      weights[i] += area;
      for (let c = 0; c < 3; c++) stress[i][c] += area * s[c];
    }
  });
  stress.forEach((s, i) => s.forEach((_, k) => (s[k] /= weights[i])));
  const width = 192,
    height = 128,
    components = new Float64Array(width * height * 3),
    valid = new Uint8Array(width * height);
  for (const tri of triangles) {
    const pts = tri.map((i) => [
      (points[i][0] / 3 + 0.5) * width - 0.5,
      (points[i][1] / 2 + 0.5) * height - 0.5,
    ]);
    const [[ax, ay], [bx, by], [cx, cy]] = pts,
      det = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const xs = pts.map((p) => p[0]),
      ys = pts.map((p) => p[1]);
    for (
      let y = Math.max(0, Math.ceil(Math.min(...ys)));
      y <= Math.min(height - 1, Math.floor(Math.max(...ys)));
      y++
    )
      for (
        let x = Math.max(0, Math.ceil(Math.min(...xs)));
        x <= Math.min(width - 1, Math.floor(Math.max(...xs)));
        x++
      ) {
        const b = ((x - ax) * (cy - ay) - (y - ay) * (cx - ax)) / det,
          c = ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / det,
          a = 1 - b - c;
        if (Math.min(a, b, c) < -1e-8) continue;
        const idx = y * width + x;
        valid[idx] = 1;
        for (let k = 0; k < 3; k++)
          components[idx * 3 + k] =
            a * stress[tri[0]][k] +
            b * stress[tri[1]][k] +
            c * stress[tri[2]][k];
      }
  }
  const diff = new Float64Array(valid.length),
    cos2 = new Float64Array(valid.length),
    sin2 = new Float64Array(valid.length);
  for (let i = 0; i < diff.length; i++)
    if (valid[i]) {
      const dx = components[3 * i] - components[3 * i + 1],
        shear = 2 * components[3 * i + 2];
      diff[i] = Math.hypot(dx, shear);
      cos2[i] = dx / (diff[i] || 1);
      sin2[i] = shear / (diff[i] || 1);
    }
  return (plate = {
    points,
    triangles,
    width,
    height,
    components,
    valid,
    diff,
    cos2,
    sin2,
  });
}
// White illumination and overlapping model RGB sensor responses. Tabulating
// spectral transmission once makes subsequent load and angle edits inexpensive.
const retardanceStep = 1 / 512;
let spectrum;
function spectralTable() {
  if (spectrum) return spectrum;
  const bands = Array.from({ length: 29 }, (_, i) => {
    const wavelength = 420 + i * 10,
      quadrature = i === 0 || i === 28 ? 0.5 : 1;
    return {
      wavelength,
      weights: [610, 540, 461].map(
        (c, k) =>
          quadrature *
          Math.exp(-0.5 * ((wavelength - c) / [39, 33, 26][k]) ** 2),
      ),
    };
  });
  const sums = [0, 1, 2].map((c) =>
    bands.reduce((s, b) => s + b.weights[c], 0),
  );
  const maximum = Math.max(...elasticPlate().diff) * 1.6 * 1.75;
  spectrum = new Float32Array(3 * (Math.ceil(maximum / retardanceStep) + 2));
  for (let i = 0; i < spectrum.length / 3; i++)
    for (const b of bands) {
      const transmission =
        Math.sin((Math.PI * i * retardanceStep * 1000) / b.wavelength) ** 2;
      for (let c = 0; c < 3; c++)
        spectrum[3 * i + c] += (transmission * b.weights[c]) / sums[c];
    }
  return spectrum;
}
export function photoelastic(load, degrees, parallel) {
  const p = elasticPlate(),
    table = spectralTable(),
    angle = (degrees * Math.PI) / 90;
  const ca = Math.cos(angle),
    sa = Math.sin(angle),
    data = new Float32Array(3 * p.valid.length);
  for (let j = 0; j < p.valid.length; j++)
    if (p.valid[j]) {
      const orientation = (p.sin2[j] * ca - p.cos2[j] * sa) ** 2;
      const t = (p.diff[j] * load * 1.75) / retardanceStep,
        k = Math.floor(t),
        a = t - k;
      for (let c = 0; c < 3; c++) {
        const i = k * 3 + c,
          cross = orientation * (table[i] + a * (table[i + 3] - table[i]));
        data[j * 3 + c] = parallel ? 1 - cross : cross;
      }
    }
  return { frame: { width: p.width, height: p.height, data }, plate: p };
}
