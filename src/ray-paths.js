// A small visible subset uses the same midpoint integrator and starting samples
// as the 4,096-path GPU solver. These polylines are a diagnostic overlay.
import { Vector3 } from "three/webgpu";

export function raySegments(strength, position, boxes) {
  const vertices = [];
  const lens = new Vector3(23, 3.2, 6 + position * 19);
  const offset = new Vector3(),
    slope = new Vector3(),
    mid = new Vector3(),
    halfDirection = new Vector3();
  function derivative(p, d) {
    offset.copy(p).sub(lens);
    const bump = strength * Math.exp(-offset.lengthSq() / 64);
    slope.copy(offset).multiplyScalar(-bump / 32);
    return slope
      .addScaledVector(d, -d.dot(slope))
      .multiplyScalar(1 / (1 + bump));
  }
  for (let row = 2; row < 64; row += 4)
    for (let col = 6; col < 64; col += 16) {
      const p = new Vector3(
        1.55,
        5.3 + (col + 0.5) * 0.089,
        3.5 + (row + 0.5) * 0.36,
      );
      const d = new Vector3(1, -0.145, (row + 0.5 - 32) * 0.001).normalize();
      for (let step = 0; step < 180; step++) {
        halfDirection
          .copy(d)
          .addScaledVector(derivative(p, d), 0.14)
          .normalize();
        mid.copy(p).addScaledVector(halfDirection, 0.14);
        d.addScaledVector(derivative(mid, halfDirection), 0.28).normalize();
        vertices.push(p.x, p.y, p.z);
        p.addScaledVector(halfDirection, 0.28);
        vertices.push(p.x, p.y, p.z);
        if (
          p.x < 0 ||
          p.x >= 40 ||
          p.y < 0 ||
          p.y >= 18 ||
          p.z < 0 ||
          p.z >= 32
        )
          break;
        if (
          boxes.some(
            ({ c, h }) =>
              Math.abs(p.x - c[0]) <= h[0] &&
              Math.abs(p.y - c[1]) <= h[1] &&
              Math.abs(p.z - c[2]) <= h[2],
          )
        )
          break;
      }
    }
  return new Float32Array(vertices);
}
