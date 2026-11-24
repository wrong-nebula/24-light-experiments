import { graph, emission, direct, addRGB } from "./patches.js";
export function solveCapacity(room, s) {
  const rows = graph(room),
    e = emission(room, s),
    rgb = direct(room, e);
  let previous = rgb.map((v, k) => v - e[k]),
    firstFlux;
  for (let bounce = 0; bounce < 4; bounce++) {
    const next = new Float32Array(rgb.length),
      through = new Float32Array(rgb.length);
    const flux = [0, 0, 0];
    for (let i = 0; i < room.n; i++) {
      const p = room.patches[i],
        row = rows[i];
      for (let j = 0; j < room.n; j++) {
        const weight = row[j];
        if (!weight) continue;
        const q = room.patches[j];
        let crosses = false;
        if (p.x > 17.8 && q.x < 17.8) {
          const t = (17.8 - q.x) / (p.x - q.x),
            z = q.z + t * (p.z - q.z),
            y = q.y + t * (p.y - q.y);
          crosses = z > 12.1 && z < 24 && y < 10.4;
        }
        for (let c = 0; c < 3; c++) {
          const incoming = weight * previous[3 * j + c];
          if (crosses) {
            flux[c] += incoming * p.area;
            through[3 * i + c] += incoming * p.tint[c];
          } else next[3 * i + c] += incoming * p.tint[c];
        }
      }
    }
    const gain = s.variant
      ? 1
      : Math.min(1, s.b / Math.max(1e-8, flux[0] + flux[1] + flux[2]));
    if (bounce === 0) firstFlux = flux.map((x) => x * gain);
    for (let i = 0; i < next.length; i++) next[i] += through[i] * gain;
    addRGB(rgb, next);
    previous = next;
  }
  return {
    rgb,
    info:
      "Doorway power · R " +
      firstFlux[0].toFixed(1) +
      "   G " +
      firstFlux[1].toFixed(1) +
      "   B " +
      firstFlux[2].toFixed(1),
  };
}
