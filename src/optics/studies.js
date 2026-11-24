export const opticalStudies = [
  {
    id: "talbot",
    name: "Talbot self-imaging",
    method: "Fresnel diffraction",
    detail: "532 nm coherent source",
    controls: [
      ["Card distance (mm)", 0, 46.992481, 24, 0.000001],
      ["Grating pitch (µm)", 65, 200, 100, 1],
    ],
    action: "Snap to self-image",
    momentary: true,
    summary:
      "Drag the white card along the optical bench. The bands split and reunite as it passes through the diffracted field.",
    notes:
      "The cross-grating separates into two complex Fresnel transforms, each resolved at 512 samples per period. The card integrates irradiance over each of its 256 × 256 pixels. The translucent bench section shows a longitudinal slice of that field. At twice the pitch squared divided by wavelength, every order returns in phase. Field shows the irradiance measured on the card. The chamber magnifies the grating and compresses axial travel.",
  },
  {
    id: "fluorescence",
    name: "Fluorescent relay",
    method: "Spectral conversion",
    detail: "Two pigment bounces",
    controls: [
      ["UV source power", 0, 1, 0.85, 0.01],
      ["Quantum yield", 0, 1, 0.88, 0.01],
    ],
    action: "Swap the tiles",
    activeAction: "Restore tile order",
    summary:
      "Follow the UV source through the two baffled bays. Swap the pigments and watch the red signal at the end of the relay.",
    notes:
      "Five wavelength bands carry radiant power. Each tile applies a spectral transfer matrix with an ordinary reflection diagonal and an off-diagonal fluorescence term. Wavelength ratios account for the Stokes energy loss. Field shows the final receiver. A finite diffuse aperture sets the receiver footprint. Its area mean equals the collected spectral power. The violet indicator locates the invisible UV source.",
  },
  {
    id: "winding",
    name: "Winding-number lighting",
    method: "Path classification",
    detail: "Signed boundary crossings",
    controls: [
      ["Route", 0, 3, 0, 1],
      ["Wall reflectance", 0.65, 0.99, 0.98, 0.01],
    ],
    defaultVariant: 1,
    labels: [["All routes", "Clockwise", "Counterclockwise", "Extra laps"]],
    action: "Tint the routes",
    activeAction: "Use neutral light",
    summary:
      "Solo a route around the central pillar. The far side can receive light from either direction and from paths that circle the pillar again.",
    notes:
      "A discrete annular light guide scatters power between adjacent angular sectors. Each crossing of a fixed cut updates an integer. Subtracting the reference route to each sector yields the signed angular travel. A closed-form steady-state solution sums paths through arbitrarily many turns. The outer field sums the selected classes.",
  },
  {
    id: "mosaic",
    name: "Mirror mosaic",
    method: "Inverse caustic design",
    detail: "144 steerable facets",
    controls: [
      ["Target pattern", 0, 2, 0, 1],
      ["Brush radius", 1, 5, 2, 1],
    ],
    labels: [["Ring", "Double slit", "Wave"]],
    action: "Cover half the mirrors",
    activeAction: "Uncover mirrors",
    summary:
      "Draw a new caustic on the receiver. A first stroke replaces the preset. Cover half the mirror bed to see the power loss after the facets retarget.",
    notes:
      "A minimum-cost assignment transports equal mirror packets to samples of the drawn brightness distribution. Each facet tilts to bisect its source and target directions. Equal-power target regions are represented by their light centroids. The detector integrates round beam spots at fixed exposure. Rays near the edge can deposit power outside the sensor. Field shows the delivered caustic.",
  },
  {
    id: "photoelastic",
    name: "Photoelastic glass",
    method: "Stress birefringence",
    detail: "Crossed polarizers",
    controls: [
      ["Clamp load", 0, 1.6, 0.85, 0.01],
      ["Polarizer angle (°)", 0, 90, 39, 1],
    ],
    action: "Use parallel polarizers",
    activeAction: "Cross the polarizers",
    summary:
      "Push the clamp against the perforated plate. Rotate the polarizers to see how the stress orientation changes the fringes.",
    notes:
      "Triangular plane-stress elements solve a unit horizontal compression around a traction-free hole. Linear elasticity scales that solution with load. The principal stress difference sets retardance, while the principal axis sets the orientation in a 29-wavelength white-light calculation with overlapping model RGB sensor responses.",
  },
  {
    id: "folded",
    name: "Folded-sheet transport",
    method: "Surface diffusion",
    detail: "Anisotropic scattering",
    controls: [
      ["Tip separation", 0, 1, 0.24, 0.01],
      ["Fiber conductance", 0.4, 4, 2.5, 0.05],
    ],
    action: "Join the tips",
    activeAction: "Disconnect tips",
    summary:
      "Bring the two ends of the pleated sheet close. Join the tips optically to give the glow a short route through the material.",
    notes:
      "A triangulated ribbon carries diffusion along and across the fibers with absorption at every vertex. Changing the opening updates intrinsic edge lengths. Joining its boundary edges adds optical conductance between the tips. A banded Cholesky solve balances the flux at every free vertex. Field unwraps the sheet from the illuminated edge to its far edge.",
  },
  {
    id: "rank-one",
    name: "Rank-one radiosity",
    method: "Sherman–Morrison update",
    detail: "All diffuse bounces",
    controls: [
      ["Tile reflectance", 0, 1, 0.85, 0.01],
      ["Lamp power", 0.2, 2.5, 1.25, 0.01],
    ],
    action: "Compare fresh solve",
    activeAction: "Use cached update",
    summary:
      "Repaint the tile in the stairwell. The landing behind the partition receives its light through diffuse reflections.",
    notes:
      "The floor and walls are subdivided into patches. Visibility-tested quadrature bounds energy while preserving reciprocal patch exchange. Chamber interpolates within each face. Field shows the floor solution. A single editable face changes one row of the radiosity matrix per channel. A cached baseline and inverse column yield the new solution. Compare recomputes the entire linear system and reports the largest difference.",
  },
  {
    id: "nlos",
    name: "Around-the-corner imaging",
    method: "Transient backprojection",
    detail: "Confocal wall scan",
    controls: [
      ["Target position", 0, 1, 0.52, 0.01],
      ["Time bin (ps)", 10, 400, 30, 2],
    ],
    action: "Reveal hidden target",
    activeAction: "Conceal target",
    summary:
      "Move the reflector behind the partition. Widen the detector’s time bins and watch depth detail fade in the reconstructed image.",
    notes:
      "An 11 × 9 wall scan records round-trip delays from a hidden stepped reflector. The inverse pass receives only the histograms, wall coordinates and bin duration. Measured time envelopes exclude empty space in this noiseless scene. Time-filtered backprojection gathers evidence on a 48 × 18 × 48 grid. Three sweeps of interleaved scan subsets then match the predicted returns to the measured histograms. The readout and Field show its top-down peak projection. A fixed inverse-hyperbolic-sine curve brings out faint returns. The cutaway reveals the physical target for comparison.",
  },
];
