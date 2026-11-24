import { bounceStudies } from "./bounce/studies.js";
import { opticalStudies } from "./optics/studies.js";
export const studies = [
  {
    id: "lattice",
    name: "Lattice transport",
    family: "Fluid dynamics",
    method: "D3Q19",
    summary:
      "Follow light through a lattice of 19 velocity channels. Move the partition to redirect the beam, or increase viscosity to scatter light along a swirling flow.",
    controls: [
      ["Light viscosity", 0, 1, 0.22, 0.01],
      ["Door position", 0, 1, 0.48, 0.01],
    ],
    action: "Toggle emitter",
    detail: "40 × 18 × 32 voxels",
  },
  {
    id: "gaussians",
    name: "Gaussian radiosity",
    family: "Gaussian splatting",
    method: "Analytic overlap",
    summary:
      "A field of overlapping Gaussians carries radiance between patches. Slide the warm light lobe across the room and stretch its footprint.",
    controls: [
      ["Lobe position", 0, 1, 0.48, 0.01],
      ["Lobe stretch", 0.45, 2.4, 1.15, 0.01],
    ],
    action: "Swap spectrum",
    detail: "2,048 light Gaussians",
  },
  {
    id: "msdf",
    name: "Distance-field optics",
    family: "Font rendering",
    method: "MSDF projection",
    summary:
      "An edge-colored distance texture projects a rotating optical mask. Adjust the receiver distance to soften its penumbra and separate the color bands.",
    controls: [
      ["Receiver distance", 0, 1, 0.32, 0.01],
      ["Dispersion", 0, 1, 0.58, 0.01],
    ],
    action: "Change gobo",
    detail: "256 × 256 RGB mask",
  },
  {
    id: "flood",
    name: "Directional flood",
    family: "Voronoi diagrams",
    method: "Jump flooding",
    summary:
      "Eight angular sectors carry bright surface patches across a height map. Step through the flood to see the contribution of each propagation distance.",
    controls: [
      ["Flood passes", 1, 9, 9, 1],
      ["Wall height", 1, 12, 6, 0.1],
    ],
    action: "Toggle emitter",
    detail: "512 × 512 receiver plane",
  },
  {
    id: "nca",
    name: "Living light",
    family: "Neural automata",
    method: "Learned local rule",
    summary:
      "A trained cellular automaton exchanges light with neighboring cells. Erase its memory and watch the illumination grow back around a moving block.",
    controls: [
      ["Ticks per frame", 1, 16, 12, 1],
      ["Block position", 0, 1, 0.58, 0.01],
    ],
    action: "Erase state",
    detail: "16 channels per cell",
  },
  {
    id: "reverb",
    name: "Light reverb",
    family: "Audio processing",
    method: "Hadamard FDN",
    summary:
      "Delayed reflections circulate between room probes. Switch off the emitter and tune the decay time to watch its color linger in the room.",
    controls: [
      ["Decay time", 0.2, 4, 1.8, 0.05],
      ["Diffusion", 0, 1, 0.74, 0.01],
    ],
    action: "Toggle emitter",
    detail: "32 delayed probe lines",
  },
  {
    id: "edges",
    name: "Contour irradiance",
    family: "Line rasterization",
    method: "Edge integration",
    summary:
      "Four boundary edges integrate a rectangular emitter over the receiver. A second hardware blend pass lets you pull the floor color toward or beyond a source color.",
    controls: [
      ["Emitter width", 4, 24, 16, 0.25],
      ["Blend alpha", -1, 1.6, 0, 0.05],
    ],
    action: "Show edge terms",
    detail: "RGBA16F blend target",
  },
  {
    id: "gravity",
    name: "Gravity optics",
    family: "Gradient-index optics",
    method: "Eikonal transport",
    summary:
      "A smooth refractive-index field bends a bundle of rays through the chamber. Move the lens and tune its strength to steer the focal caustic.",
    controls: [
      ["Index strength", 0, 1.8, 0.86, 0.01],
      ["Lens position", 0, 1, 0.58, 0.01],
    ],
    action: "Show ray paths",
    detail: "4,096 optical paths",
  },
  ...bounceStudies,
  ...opticalStudies,
];
