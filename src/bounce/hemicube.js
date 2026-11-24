import { emission, intersect, nearest } from "./patches.js";

function samples(resolution) {
  const rays = [];
  // All five faces have the same square pixel footprint at unit distance.
  for (let f = 0; f < 5; f++)
    for (let y = 0; y < (f === 0 ? resolution : resolution / 2); y++)
      for (let x = 0; x < resolution; x++) {
        const u = ((x + 0.5) * 2) / resolution - 1,
          v = ((y + 0.5) * 2) / resolution - (f === 0 ? 1 : 0);
        const point =
          f === 0
            ? [u, v, 1]
            : f === 1
              ? [1, u, v]
              : f === 2
                ? [-1, u, v]
                : f === 3
                  ? [u, 1, v]
                  : [u, -1, v];
        const r = Math.hypot(...point);
        rays.push([
          ...point.map((k) => k / r),
          (4 * point[2]) / (Math.PI * resolution ** 2 * r ** 4),
        ]);
      }
  const total = rays.reduce((s, r) => s + r[3], 0);
  for (const r of rays) r[3] /= total;
  return rays;
}
function buildLinks(room, res, layered) {
  const rays = samples(res),
    links = [],
    hit = {};
  for (const p of room.patches) {
    if (p.hidden) {
      links.push([]);
      continue;
    }
    const horizontal = Math.abs(p.ny) > 0.5;
    const tx = horizontal ? 1 : p.nz,
      tz = horizontal ? 0 : -p.nx;
    const bx = p.ny * tz,
      by = p.nz * tx - p.nx * tz,
      bz = -p.ny * tx;
    const positive = new Map(),
      negative = new Map();
    const add = (map, id, w) => {
      if (id >= 0) map.set(id, (map.get(id) || 0) + w);
    };
    for (const [a, b, c, w] of rays) {
      const dx = a * tx + b * bx + c * p.nx,
        dy = b * by + c * p.ny,
        dz = a * tz + b * bz + c * p.nz;
      const x = p.x + 0.025 * p.nx,
        y = p.y + 0.025 * p.ny,
        z = p.z + 0.025 * p.nz;
      if (!layered) {
        nearest(room, x, y, z, dx, dy, dz, p.object, 100, hit);
        add(positive, hit.id, w);
        continue;
      }
      const layers = [];
      for (let k = 0; k < room.boxes.length; k++)
        if (
          k !== p.object &&
          intersect(room.boxes[k], x, y, z, dx, dy, dz, 100, hit)
        )
          layers.push([hit.t, hit.id]);
      layers.sort((u, v) => u[0] - v[0]);
      // Each opaque layer cancels the radiance of the next layer along this sample.
      for (let j = 0; j < layers.length; j++) {
        add(positive, layers[j][1], w);
        if (j + 1 < layers.length) add(negative, layers[j + 1][1], -w);
      }
    }
    links.push([...positive].map(([id, w]) => [id, w, negative.get(id) || 0]));
  }
  return links;
}
function feedback(room, links, source, steps, strength) {
  let last = source;
  for (let k = 0; k < steps; k++) {
    const next = source.slice();
    for (let i = 0; i < room.n; i++)
      for (const [j, positive, negative] of links[i]) {
        const w = positive + negative * strength;
        for (let c = 0; c < 3; c++)
          next[3 * i + c] += room.patches[i].tint[c] * w * last[3 * j + c];
      }
    last = next;
  }
  return last;
}
export function solveHemicube(room, s) {
  const anti = room.id === "antiradiance",
    res = anti ? 12 : s.b;
  if (room.hemi?.res !== res)
    room.hemi = { res, links: buildLinks(room, res, anti) };
  const e = emission(room, s),
    depth = anti ? 3 : s.a;
  return {
    rgb: feedback(room, room.hemi.links, e, depth, anti ? s.b : 1),
    compare:
      anti && s.variant ? feedback(room, room.hemi.links, e, depth, 0) : null,
    info:
      anti && s.variant
        ? "Left half · uncorrected     Right half · corrected"
        : depth + " diffuse bounces",
  };
}
