const panel = ["Reflector position", 0, 1, 0.5, 0.01];

export const bounceStudies = [
  {
    id: "antiradiance",
    name: "Antiradiance",
    method: "Directional cancellation",
    detail: "Positive and signed transport",
    summary:
      "Slide the shutter between the reflector and the alcove. Vary the correction strength or split the view to reveal the light that would leak through it.",
    controls: [
      ["Shutter position", 0, 1, 0.6, 0.01],
      ["Cancellation", 0, 1, 1, 0.01],
      panel,
    ],
    action: "Compare leakage",
    activeAction: "Close comparison",
    notes:
      "A depth-ordered directional gather sums radiance from successive surfaces. Each nearer opaque layer contributes the negative of the next layer’s radiance along that direction. At full strength the excess cancels. The left half of Compare shows the uncorrected gather. This finite-layer demonstration explicitly orders intersections.",
  },
  {
    id: "hemicube",
    name: "Hemicube feedback",
    method: "Diffuse radiosity",
    detail: "Five faces per patch",
    summary:
      "Advance one bounce at a time to follow the lamp through the red reflector and into the white alcove. The bounce slider also lets you rewind.",
    controls: [
      ["Bounce count", 0, 7, 3, 1],
      ["Face resolution", 4, 16, 12, 2],
      panel,
    ],
    action: "Next bounce",
    increment: true,
    notes:
      "Each patch samples the top and four half-side faces of a hemicube. Analytic box intersections fill its depth samples. Pixel solid angle and the receiver cosine supply the quadrature weights. Every iteration gathers from the preceding bounce buffer. At zero bounces only the lamp emits.",
  },
  {
    id: "bitmask",
    name: "Visibility bitmasks",
    method: "Screen-space bounce",
    detail: "32 elevation sectors",
    summary:
      "Turn the slats in front of the red reflector and orbit the chamber. Switch to indirect light to isolate the color that reaches the white surfaces.",
    controls: [
      ["Slat angle", 0, 85, 25, 1],
      ["Surface thickness", 0.25, 3, 1.3, 0.05],
      panel,
    ],
    action: "Isolate bounce",
    activeAction: "Show full lighting",
    notes:
      "An orthographic G-buffer of the modeled surfaces follows the camera. In each screen slice, depth samples occupy finite intervals in a 32-bit elevation mask. Newly covered sectors gather the visible surface’s lit radiance. Occluded and offscreen surfaces are unavailable. Field view displays the floor solution from the last chamber camera.",
  },
  {
    id: "rotor",
    name: "Rotor-router radiosity",
    method: "Deterministic packet transport",
    detail: "Weighted routing schedules",
    summary:
      "Release a batch of packets and watch reflected energy accumulate. Switch to random routing at the same budget to compare the patterns.",
    controls: [
      ["Packets per batch", 1, 4096, 512, 1],
      ["Random routing", 0, 1, 0, 1],
      panel,
    ],
    action: "Release batch",
    momentary: true,
    notes:
      "Visible patch-to-patch form factors determine destination frequencies. Each patch deals packets through a stratified cyclic schedule, with unused solid angle routed out of the room. Surface albedo attenuates packet power at each hit. Changing a parameter starts a fresh estimate. Release batch adds to it.",
  },
  {
    id: "completion",
    name: "Matrix-completion GI",
    method: "Virtual point lights",
    detail: "Sampled transport matrix",
    summary:
      "Move the divider into the red bounce pool. Raise the measurement budget or show the reference to inspect where the reconstructed shadow breaks down.",
    controls: [
      ["Measured entries", 5, 100, 25, 1],
      ["Divider position", 0, 1, 0.45, 0.01],
      panel,
    ],
    action: "Show full reference",
    activeAction: "Show reconstruction",
    notes:
      "Directly lit surface samples become virtual point lights. Only a deterministic subset of receiver–light links is measured in reconstruction mode. Alternating least squares fits low-rank factors within each receiver face, preserving measured entries. The reference measures every link for the same virtual lights.",
  },
  {
    id: "cascades",
    name: "Radiance cascades",
    method: "Interval transport",
    detail: "Four planar cascades",
    summary:
      "Slide the emitting strip past the corner. Increase the bounce count to carry light down the second leg, or inspect the contribution from later bounces.",
    controls: [
      ["Strip position", 0, 1, 0.55, 0.01],
      ["Bounce count", 1, 5, 3, 1],
      panel,
    ],
    action: "Isolate later bounces",
    activeAction: "Show full lighting",
    notes:
      "Four horizontal probe grids trade spatial resolution for angular resolution. Near intervals receive surface radiance on a hit and transmit the next cascade on a miss. Surface feedback adds diffuse bounces. The horizontal slice is sampled at lamp height and extended onto the chamber surfaces.",
  },
  {
    id: "wavelets",
    name: "Wavelet relighting",
    method: "Haar light transport",
    detail: "8 × 8 emitter tiles",
    summary:
      "Drag the stripe or paint directly on the luminous panel. Reduce the coefficient budget to see which features survive in the bounced light.",
    controls: [
      ["Stripe position", 0, 1, 0.4, 0.01],
      ["Retained coefficients", 1, 64, 32, 1],
      panel,
    ],
    action: "Clear panel",
    momentary: true,
    notes:
      "The chamber caches each emitter tile’s direct and twice-reflected response. A separable orthonormal Haar transform expresses those responses and the painted emitter in a common basis. Lighting uses the strongest retained emitter coefficients. Moving the reflector rebakes transport. Moving the stripe replaces the painted pattern.",
  },
  {
    id: "capacity",
    name: "Capacity-limited bounce",
    method: "Nonlinear diffuse transport",
    detail: "Shared doorway budget",
    summary:
      "Increase the red lamp while the blue lamp stays fixed. Toggle the shared budget to see how much blue survives the passage into the alcove.",
    controls: [
      ["Red lamp power", 0, 3, 1.4, 0.05],
      ["Doorway capacity", 1, 100, 24, 1],
      panel,
    ],
    action: "Bypass capacity",
    activeAction: "Apply capacity",
    notes:
      "At each diffuse bounce, visible links crossing the doorway share a budget measured in summed RGB power. All three channels are scaled by the same factor when that budget is exceeded. Excess power is absorbed. Bypassing the cap restores additive diffuse transport. The diagnostic reports the power crossing on the first indirect bounce.",
  },
];

const red = [0.83, 0.038, 0.019],
  white = [0.84, 0.85, 0.84];
// Per-room source power in linear RGB. The wall wash and reflected color
// both follow this spectrum as light moves through the room.
const sourcePower = {
  antiradiance: [60, 72, 17],
  hemicube: [67, 51, 34],
  bitmask: [30, 54, 76],
  rotor: [76, 38, 16],
  completion: [64, 62, 61],
  cascades: [21, 70, 58],
  wavelets: [76, 68, 59],
};
const ids = new Set(bounceStudies.map((study) => study.id));
export const isBounceStudy = (id) => ids.has(id);

export function addBounceGeometry(items, id, a, b, position = 0.5) {
  function add(kind, c, h, tint, yaw = 0) {
    items.push({ kind, c, h, tint, yaw });
  }
  const rad = (degrees) => (degrees * Math.PI) / 180;
  const upright = (kind, x, z, width, height, depth, tint = white, yaw = 0) =>
    add(
      kind,
      [x, 0.62 + height / 2, z],
      [width / 2, height / 2, depth / 2],
      tint,
      rad(yaw),
    );
  const steps = (x, z, n, width, tread, rise) => {
    for (let k = 0; k < n; k++)
      upright("tread", x + k * tread, z, tread, (k + 1) * rise, width);
  };
  const sideLamps = id === "hemicube" || id === "rotor";
  const travel = sideLamps ? [4.2, 8.0] : [10, 12];
  const redZ = travel[0] + position * travel[1];
  if (id === "wavelets") {
    add("lamp", [10.4, 6.2, 1.43], [5.2, 5.2, 0.3], [0.95, 0.94, 0.9]);
  } else if (id === "cascades") {
    add(
      "lamp",
      [3.0 + 12 * a, 5.9, 1.48],
      [1.25, 4.7, 0.32],
      [0.95, 0.94, 0.9],
    );
  } else if (id === "capacity") {
    upright("lamp", 12, 6.4, 5.4, 6.8, 1.0, white, -60);
    items.at(-1).power = [54, 1.7, 0.5];
    add("blueLamp", [13.1, 5.4, 26.9], [2.9, 3.6, 0.45], white, rad(-100));
    items.at(-1).power = [0.5, 3, 68];
  } else {
    const center = sideLamps ? [1.38, 7.2, 11.8] : [8.0, 6.25, 1.37];
    add(
      "lamp",
      center,
      [6.0, 3.9, 0.3],
      [0.11, 0.13, 0.12],
      sideLamps ? Math.PI / 2 : 0,
    );
    items.at(-1).bank = true;
  }
  if (sourcePower[id]) items.at(-1).power = sourcePower[id];
  upright(
    "reflector",
    sideLamps ? 10.0 : id === "bitmask" ? 4.0 : id === "capacity" ? 8.0 : 5.7,
    redZ,
    0.95,
    8.6,
    10.3,
    red,
    sideLamps ? -78 : id === "capacity" ? 28 : 11,
  );
  items.at(-1).travel = travel;

  if (id === "antiradiance") {
    upright("baffle", 17.8, 6.2, 1.8, 10.3, 11.0);
    upright("shutter", 17.8, 11.0 + a * 11, 0.76, 8.4, 7.9, [0.48, 0.5, 0.48]);
    upright("pier", 17.8, 28.5, 1.65, 6.5, 5.8);
    steps(24.7, 7.5, 4, 8.7, 2.65, 1.55);
    upright("plinth", 28.0, 22.2, 7.8, 1.9, 6.3);
  } else if (id === "hemicube") {
    upright("baffle", 17.8, 5.6, 1.65, 10.1, 9.8);
    upright("pier", 22, 3.4, 1.4, 9.0, 2.0);
    upright("pier", 33.5, 3.4, 1.4, 9.0, 2.0);
    add("canopy", [27.8, 9.9, 5.8], [7.3, 0.48, 3.9], white);
    steps(22.7, 10.8, 3, 4.6, 3.7, 1.35);
    upright("plinth", 28, 22.4, 9.0, 1.65, 4.8);
  } else if (id === "bitmask") {
    upright("baffle", 18.4, 5.6, 1.4, 8.8, 9.8);
    for (let i = 0; i < 5; i++)
      upright("slat", 9.1, 10.5 + i * 3.25, 0.45, 8.1, 3.15, white, a);
    add("lintel", [9.1, 9.0, 17.0], [0.6, 0.23, 8.45], white);
    upright("sill", 9.1, 17, 1.25, 0.55, 17.1);
    upright("receiver", 28.5, 7.6, 8.8, 5.1, 3.8);
    upright("plinth", 26.0, 19.8, 10.6, 1.7, 5.0);
  } else if (id === "rotor") {
    upright("baffle", 18, 5.8, 1.55, 8.6, 10.4);
    steps(23, 7.7, 5, 7.8, 2.55, 1.25);
    upright("plinth", 24.6, 22, 5.4, 2.1, 5.4);
    upright("plinth", 31.9, 19.5, 4.6, 3.5, 4.6);
  } else if (id === "completion") {
    upright("baffle", 17.8, 5.8, 1.65, 8.8, 10.2);
    upright(
      "shutter",
      18.0,
      10.8 + b * 12.0,
      0.82,
      7.8,
      7.0,
      [0.53, 0.54, 0.5],
    );
    upright("receiver", 28.7, 6.5, 13.0, 5.9, 2.2);
    upright("tread", 28.7, 9.5, 13.0, 1.3, 3.7);
    upright("plinth", 29.3, 22.4, 9.4, 2.4, 5.8);
  } else if (id === "cascades") {
    upright("baffle", 17.8, 8.1, 1.8, 9.9, 14.5);
    upright("return", 21.0, 14.8, 6.7, 7.8, 1.3);
    upright("pier", 18.1, 29.3, 1.6, 6.2, 4.5);
    steps(28, 5.8, 3, 7.2, 2.8, 1.45);
    upright("plinth", 30.7, 21.9, 6.7, 2, 4.4);
  } else if (id === "wavelets") {
    upright("baffle", 18.1, 6.2, 1.4, 8.5, 10.5);
    upright("tread", 25.3, 13.4, 7.8, 1.75, 7.4);
    upright("tread", 28.1, 10.6, 5.8, 3.65, 5.7);
    upright("tread", 30.2, 8.2, 3.3, 6.0, 3.7);
    upright("plinth", 23.5, 24, 5.4, 1.1, 3.5);
  } else if (id === "capacity") {
    upright("baffle", 17.8, 6.45, 1.95, 9.7, 11.3);
    upright("baffle", 17.8, 28.0, 1.95, 9.7, 8.0);
    add("lintel", [17.8, 10.17, 18.05], [0.98, 0.45, 6.0], white);
    add(
      "blueReflector",
      [6.4, 4.4, 24],
      [0.46, 3.75, 3.5],
      [0.035, 0.13, 0.94],
      rad(16),
    );
    upright("receiver", 29, 7.8, 9.4, 5.6, 3.5);
    upright("plinth", 27.7, 20, 7.4, 1.7, 7.4);
  }
}
