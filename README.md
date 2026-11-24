# Transport Atlas

Twenty-four interactive light-transport experiments share a Three.js r187 cutaway chamber. Each study has its own solver, a 3D view, a plan view, adjustable parameters, and field notes explaining its approximations.

[Explore Transport Atlas](https://wrong-nebula.github.io/24-light-experiments/) in a WebGPU-capable browser.

In Chamber view, a small double-ended arrow marks each draggable object and shows its direction of travel. Drag the object itself to move it.

## Run locally

Use Node.js 22 and a WebGPU-capable browser with hardware acceleration enabled.

```sh
npm ci
npm run dev
```

Open the localhost URL printed by Vite. The app loads its shaders, scene geometry, optical masks, and trained model locally. To build and serve the production bundle, run `npm run build`, then `npm run preview`. The build output is in `dist/`.

## Studies

| Study                 | Implementation                                                                                                                                                                                                           | Interaction to try                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Lattice transport     | RGB D3Q19 streaming and collisions in a 40 × 18 × 32 voxel grid. Surface albedo and normals control diffuse and specular redistribution. High viscosity adds a rotating directional bias.                                | Drag the partition and compare the light field at low and high viscosity.           |
| Gaussian radiosity    | 2,048 light Gaussians exchange energy through analytic overlap weights, with ellipsoidal Gaussian extinction integrated between centers. A local reconstruction shades meshes and the surrounding volume.                | Drag the wire ellipsoid, stretch the lobe, and swap its spectrum.                   |
| Distance-field optics | Two 256 × 256 edge-colored optical masks. The median distance reconstructs the aperture, a distance-dependent transition controls penumbra width, and gradient-directed samples separate the color bands.                | Pause the rotating mask, increase dispersion, then change the gobo.                 |
| Directional flood     | Eight sectors propagate dominant patch candidates and height bounds across a 512 × 512 top-down map. Two nine-stride sweeps include secondary sources on lit obstacles. Rectangular contour factors shade the receivers. | Use Field view and change the pass count or wall height.                            |
| Living light          | A 10,048-parameter material-conditioned MLP governs a 16-channel planar cellular automaton. Conditioned scattering matrices are cached on the GPU, and local state updates run 1–16 ticks per frame.                     | Drag the block and erase the state. Set one tick per frame to slow the recovery.    |
| Light reverb          | 32 unequal delay lines use visibility-gated Walsh–Hadamard butterfly mixing, wall-albedo losses, and RT60-dependent feedback. A 120 Hz simulation clock drives the network independently of display refresh.             | Set a long decay and switch off the emitter.                                        |
| Contour irradiance    | Instanced hardware scanlines accumulate four signed edge integrals per floor receiver into RGBA16F. A second hardware blend pass uses the adjustable source alpha.                                                       | Inspect the edge contributions, sum them, and move alpha below zero or above one.   |
| Gravity optics        | 4,096 paths use midpoint integration of the gradient-index ray equation. Segment density and surface hits accumulate into a voxel field.                                                                                 | Set index strength to zero, show the ray paths, then increase it and drag the lens. |

## Surface-bounce studies

Studies 09–16 use the same cutaway scale and camera as the first eight. Each room has its own architectural layout, an adjustable red reflector, a lamp, a partition, and pale receivers. Drag the reflector or use its slider. Chamber shows the complete room. Field shows the solved floor patches. The new transport calculations run in a Web Worker on edits and publish a half-float surface atlas to Three.js WebGPU. The screen-space study also updates when the camera moves.

| Study | Room and interaction |
| --- | --- |
| Antiradiance | A shutter on twin rails controls the light reaching a stepped alcove. Compare the signed correction with the uncorrected left half. |
| Hemicube feedback | A raised canopy and terraced floor exchange light. Step the five-face quadrature through individual diffuse bounces. |
| Visibility bitmasks | Five rotating louvers interrupt a red reflector. A camera-space depth buffer and 32-bit sector masks estimate one diffuse bounce. |
| Rotor-router radiosity | Two plinths and a stepped gallery receive weighted packets. Add batches to the estimate or compare random routing. |
| Matrix-completion GI | Move a divider across a broad receiving wall. Fit sampled virtual-light links or display all 64 virtual lights with exact link visibility. |
| Radiance cascades | A narrow strip feeds an L-shaped corridor. Four planar interval cascades merge near and far samples and feed radiance back onto surfaces. |
| Wavelet relighting | Paint an 8 × 8 luminous panel facing a stepped sculpture. Choose how many Haar coefficients reconstruct its baked light response. |
| Capacity-limited bounce | Two colored reflector bays feed one lintelled doorway. Limit shared indirect power or bypass the budget to compare linear transport. |

Each room's lamp spectrum feeds its transport solver, so the source color also appears in the indirect lighting. The trim, grilles, bevels, and mounting hardware dress the transport geometry. The solvers use the principal box faces. The worker retains transport caches until a geometry edit invalidates them.

## Training

The 40,192-byte checkpoint ships in `public/nca-weights.bin`. The training script runs on CPU and can also run in a Colab checkout.

```sh
python -m pip install numpy numba torch
python training/train_nca.py
```

Training uses 30 seeded randomized rooms and six held-out rooms. The reference tracer samples 128 paths per cell with up to 16 steps of volume transport and cosine-weighted wall reflections. After 220 optimization steps, the held-out mean squared error in square-root radiance was 0.002003, with solid cells masked as in the training objective.

## Scope and verification

The chamber geometry, source locations, and projection conventions are authored per study. The NCA and jump flood operate in a planar domain. Gaussian visibility uses soft blocker approximations. The contour solution covers an unobstructed floor and the reverb tail uses an acoustic analogy. Resolution, finite propagation time, and angular discretization are visible in the field views.

The browser checks exercised the original eight studies in Chrome on Apple Metal, including parameter changes, view switching, reset, and mobile layout. GPU readback compared the rectangular emitter against independent surface quadrature at three floor points. Readback at alpha −0.8 and 1.4 also matched the floating-point source-over equation.

The surface-bounce tests run as part of `npm test`. The tests cover shutter cancellation, successive bounces, camera dependence, reproducible packet routing, full-sample matrix and wavelet reconstruction, cascade feedback, and competition for doorway capacity.

The extended-alpha study applies the compositing formulation from [Opacity Is Not Just Opacity](https://arxiv.org/abs/2609.14971v3).

## Optical studies 17–24

These instruments use the same cutaway shell, camera and monochrome controls. The calculations run on edits in a Web Worker. Chamber displays the instruments in context. Field enlarges each detector image, unwrapped material field, or floor solution. The optical benches use illustrative scale, and the controls display the physical units used by the solver. Workers upload linear half-float detector textures. Camera exposure and the final display transform are applied during rendering. Detector images and active materials show the computed measurements. The surrounding shell uses a separate studio fill for visibility. The rank-one stairwell displays its solved patch radiance across the architecture.

| Study | Experiment |
| --- | --- |
| 17 · Talbot self-imaging | Drag a detector through a 532 nm coherent field. Snap to the calculated recurrence and compare the irradiance with the input grating. Two separable complex Fresnel transforms resolve 512 samples per period. The card integrates each pixel area, and the longitudinal section displays the same field along the optical rail. |
| 18 · Fluorescent relay | Swap two pigments in a five-band relay. Wavelength conversion and collection losses determine the red power reaching the final receiver. |
| 19 · Winding-number lighting | Solo clockwise, counterclockwise, or extra-lap paths in an annular guide. An infinite-path steady-state solution includes repeated laps at high reflectance. Colored routes can be switched back to the neutral sum. |
| 20 · Mirror mosaic | Paint the receiver and tilt 144 mirrors through a minimum-cost assignment. Covering half recalculates the assignment with 72 packets. Field shows where the reflected rays land. |
| 21 · Photoelastic glass | Load a perforated plate and rotate the polarizers. A triangular plane-stress solve and 29-wavelength integration produce the white-light fringes. |
| 22 · Folded-sheet transport | Change the gap in a pleated ribbon, then join the ends. The field unwraps an anisotropic diffusion solution on the connected material. |
| 23 · Rank-one radiosity | Repaint one face in a stairwell. Compare cached Sherman–Morrison updates with a fresh diffuse patch solve. |
| 24 · Around-the-corner imaging | Change the hidden reflector position and timing resolution. The scanner estimates a volume from confocal wall returns. The reveal control opens the target bay for comparison. |

Run `npm test` to check recurrence, energy accounting, path-class recombination, elastic and polarization behavior, optical connectivity, radiosity agreement and blind target localization alongside the earlier surface-bounce tests.
