import { image, tau } from "./image.js";
export const strips = 50,
  across = 10;
export function foldPosition(i, j, gap) {
  const opening = 0.045 + 0.95 * gap,
    crease = Math.floor(i / 5),
    t = (i % 5) / 5;
  function corner(k) {
    const angle = 0.95 + opening / 2 + ((tau - opening) * k) / (strips / 5),
      radius = k % 2 ? 11.75 : 7.45;
    return [20 + radius * Math.cos(angle), 16 + radius * Math.sin(angle)];
  }
  const a = corner(crease),
    b = corner(crease + 1);
  return [
    a[0] + (b[0] - a[0]) * t,
    1.8 + (j / across) * 8.5,
    a[1] + (b[1] - a[1]) * t,
  ];
}
export function foldedSheet(gap, fiber, joined) {
  const width = strips + 1,
    height = across + 1,
    n = width * height,
    coords = [],
    triangles = [];
  const du = [],
    dy = 8.5 / across,
    area = new Float64Array(n),
    edges = Array.from({ length: n }, () => []);
  const edge = (i, j, g) => {
    edges[i].push([j, g]);
    edges[j].push([i, g]);
  };
  for (let i = 0; i < strips; i++) {
    const a = foldPosition(i, 0, gap),
      b = foldPosition(i + 1, 0, gap);
    du.push(Math.hypot(a[0] - b[0], a[2] - b[2]));
  }
  for (let j = 0; j < height; j++)
    for (let i = 0; i < width; i++) {
      const k = j * width + i;
      coords.push(foldPosition(i, j, gap));
      const h = j === 0 || j === across ? 0.5 : 1;
      const voronoi = ((du[i - 1] || 0) + (du[i] || 0)) / 2;
      area[k] = voronoi * dy * h;
      // Cotangent stiffness on two right triangles per rectangular material cell.
      // The shared diagonal has zero weight in this fiber-aligned chart.
      if (i < strips) edge(k, k + 1, (fiber * 12 * dy * h) / du[i]);
      if (j < across) edge(k, k + width, voronoi / dy);
      if (i < strips && j < across)
        triangles.push(k, k + 1, k + width + 1, k, k + width + 1, k + width);
      if (joined && i === 0) edge(k, k + strips, 25 * h);
    }
  // Number alternating columns from the two ends. A joined seam then stays
  // inside the same narrow matrix band as the ordinary sheet edges.
  const band = 2 * height,
    stride = band + 1,
    order = new Int32Array(n),
    L = new Float64Array(n * stride),
    rhs = new Float64Array(n);
  const pinned = (k) =>
    k % width === 0 && Math.floor(k / width) >= 3 && Math.floor(k / width) <= 7;
  for (let i = 0; i < width; i++) {
    const column = i % 2 === 0 ? i / 2 : strips - (i - 1) / 2;
    for (let j = 0; j < height; j++) order[j * width + column] = i * height + j;
  }
  for (let k = 0; k < n; k++) {
    const r = order[k],
      base = r * stride;
    if (pinned(k)) {
      L[base] = 1;
      rhs[r] = 1;
      continue;
    }
    L[base] = 0.075 * area[k];
    for (const [j, g] of edges[k]) {
      L[base] += g;
      if (pinned(j)) rhs[r] += g;
      else if (order[j] < r) L[base + r - order[j]] -= g;
    }
  }
  for (let r = 0; r < n; r++) {
    const base = r * stride,
      start = Math.max(0, r - band);
    for (let j = start; j <= r; j++) {
      let v = L[base + r - j];
      for (let k = start; k < j; k++)
        v -= L[base + r - k] * L[j * stride + j - k];
      L[base + r - j] = r === j ? Math.sqrt(v) : v / L[j * stride];
    }
    let v = rhs[r];
    for (let j = start; j < r; j++) v -= L[base + r - j] * rhs[j];
    rhs[r] = v / L[base];
  }
  for (let r = n - 1; r >= 0; r--) {
    let v = rhs[r];
    for (let j = r + 1; j <= Math.min(n - 1, r + band); j++)
      v -= L[j * stride + j - r] * rhs[j];
    rhs[r] = v / L[r * stride];
  }
  const field = Float64Array.from(order, (r) => rhs[r]);
  let residual = 0;
  for (let i = 0; i < n; i++)
    if (!pinned(i)) {
      let v = 0.075 * area[i] * field[i];
      for (const [j, g] of edges[i]) v += g * (field[i] - field[j]);
      residual = Math.max(residual, Math.abs(v));
    }
  const colors = Array.from(field, (v) => [0.026 * v, 1.35 * v, 0.65 * v]);
  return {
    positions: coords,
    triangles,
    colors,
    field,
    residual,
    frame: image(width, height, (_u, _v, x, y) => colors[y * width + x]),
  };
}
