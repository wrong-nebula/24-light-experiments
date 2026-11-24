import * as T from "three/webgpu";
import { normalWorld, vec3 } from "three/tsl";

// Trim follows the simulated blocks. All lengths here are in chamber units.
export function createFinishes(keep) {
  function finish(rgb) {
    const mat = keep(new T.MeshBasicNodeMaterial());
    const key = normalWorld
      .dot(vec3(0.32, 0.83, 0.45))
      .max(0)
      .mul(0.63)
      .add(0.37);
    mat.colorNode = vec3(...rgb).mul(key);
    return mat;
  }
  return {
    shell: finish([0.09, 0.107, 0.098]),
    black: finish([0.019, 0.024, 0.021]),
    alloy: finish([0.29, 0.32, 0.28]),
    edge: finish([0.15, 0.16, 0.14]),
  };
}
export function detailBlock(mesh, item, id, unit, finishes) {
  const {
    kind,
    h: [x, y, z],
  } = item;
  const pieces = new Map();
  function bar(material, px, py, pz, w, h, d) {
    if (Math.min(w, h, d) <= 0) return;
    const transforms = pieces.get(material) || [];
    pieces.set(material, transforms);
    transforms.push(
      new T.Matrix4()
        .makeScale(w / (2 * x), h / (2 * y), d / (2 * z))
        .setPosition(px / (2 * x), py / (2 * y), pz / (2 * z)),
    );
  }
  const { shell, black, alloy, edge } = finishes;
  if (kind === "lamp" || kind === "blueLamp") {
    // A deep perimeter and thin face ribs leave the emissive cells exposed.
    for (const sign of [-1, 1]) {
      bar(shell, sign * (x + 0.08), 0, 0.02, 0.32, 2 * y + 0.58, 2 * z + 0.26);
      bar(shell, 0, sign * (y + 0.08), 0.02, 2 * x + 0.2, 0.32, 2 * z + 0.26);
      bar(alloy, sign * (x - 0.045), 0, z + 0.13, 0.055, 2 * y, 0.055);
      bar(black, 0, sign * (y - 0.1), z + 0.12, 2 * x - 0.12, 0.12, 0.09);
    }
    if (item.bank) {
      // Three recessed lamp cassettes, with the same proportions as the original emitters.
      for (const center of [(-2 * x) / 3, 0, (2 * x) / 3]) {
        for (const sign of [-1, 1])
          bar(
            black,
            center + sign * (x / 6 + 0.07),
            0,
            z + 0.1,
            0.14,
            2 * y + 0.05,
            0.2,
          );
        for (let j = 1; j < 6; j++)
          bar(edge, center, -y + (j * y) / 3, z + 0.12, x / 3, 0.065, 0.1);
      }
    } else if (id === "wavelets") {
      for (let k = 1; k < 8; k++) {
        bar(shell, -x + (k * x) / 4, 0, z + 0.04, 0.055, 2 * y, 0.07);
        bar(shell, 0, -y + (k * y) / 4, z + 0.04, 2 * x, 0.055, 0.07);
      }
    } else {
      const count = id === "cascades" ? 1 : 3;
      for (let i = 1; i < count; i++)
        bar(shell, -x + (i * 2 * x) / count, 0, z + 0.09, 0.22, 2 * y, 0.18);
      for (let i = 1; i < 6; i++)
        bar(edge, 0, -y + (i * y) / 3, z + 0.065, 2 * x, 0.062, 0.095);
    }
    // Ventilation channels detail the back when the chamber is orbited.
    for (let i = 0; i < 5; i++)
      bar(black, 0, y * 0.45 - i * 0.32, -z - 0.025, 1.3 * x, 0.12, 0.06);
    if (item.c[1] - y < 1)
      bar(shell, 0, -y + 0.14, 0, 2 * x + 0.56, 0.28, 2 * z + 0.46);
  } else if (kind === "reflector") {
    for (const sign of [-1, 1]) {
      bar(shell, 0, 0, sign * z, 2 * x + 0.12, 2 * y + 0.24, 0.22);
      bar(edge, 0, sign * y, 0, 2 * x + 0.13, 0.18, 2 * z + 0.13);
      bar(shell, 0, -y + 0.23, sign * z * 0.71, 2 * x + 0.75, 0.45, 0.75);
    }
    for (let k = 1; k < 3; k++)
      bar(edge, x + 0.015, 0, -z + (k * 2 * z) / 3, 0.045, 2 * y - 0.25, 0.052);
  } else if (kind === "blueReflector") {
    for (const sign of [-1, 1])
      bar(shell, sign * x, 0, 0, 0.17, 2 * y + 0.2, 2 * z + 0.12);
    bar(edge, 0, y, 0, 2 * x, 0.15, 2 * z + 0.12);
  } else if (
    ["baffle", "pier", "shutter", "return", "receiver"].includes(kind)
  ) {
    bar(edge, 0, y - 0.02, 0, 2 * x + 0.16, 0.15, 2 * z + 0.15);
    const height = 2 * y;
    if (z > x) {
      bar(shell, x + 0.03, -y + 0.24, 0, 0.08, 0.46, 2 * z);
      const panels = Math.max(1, Math.round((2 * z) / 4));
      for (let k = 1; k < panels; k++)
        bar(
          edge,
          x + 0.025,
          0,
          -z + (k * 2 * z) / panels,
          0.055,
          height - 0.34,
          0.048,
        );
    } else {
      bar(shell, 0, -y + 0.24, z + 0.03, 2 * x, 0.46, 0.08);
      const panels = Math.max(1, Math.round((2 * x) / 4));
      for (let k = 1; k < panels; k++)
        bar(
          edge,
          -x + (k * 2 * x) / panels,
          0,
          z + 0.025,
          0.048,
          height - 0.34,
          0.055,
        );
    }
    if (kind === "shutter")
      for (const side of [-1, 1]) {
        bar(black, 0, 0, side * (z - 0.05), 2 * x + 0.18, 2 * y, 0.17);
        bar(alloy, x + 0.08, y * 0.7, side * (z - 0.35), 0.065, 0.32, 0.12);
      }
  } else if (kind === "plinth" || kind === "tread") {
    bar(edge, 0, y - 0.1, z + 0.023, 2 * x - 0.14, 0.07, 0.055);
    bar(shell, 0, -y + 0.15, z + 0.024, 2 * x - 0.08, 0.23, 0.052);
    if (kind === "plinth") {
      bar(shell, x + 0.024, -y + 0.15, 0, 0.052, 0.23, 2 * z - 0.08);
      bar(edge, x + 0.024, y - 0.1, 0, 0.055, 0.07, 2 * z - 0.14);
    }
  } else if (kind === "canopy" || kind === "lintel") {
    bar(edge, 0, 0, z + 0.02, 2 * x, 0.13, 0.08);
  }
  for (const [material, matrices] of pieces) {
    const instance = new T.InstancedMesh(unit, material, matrices.length);
    matrices.forEach((m, i) => instance.setMatrixAt(i, m));
    instance.instanceMatrix.needsUpdate = true;
    mesh.add(instance);
  }
}
