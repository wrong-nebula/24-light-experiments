import "./style.css";
import * as T from "three/webgpu";
import { createBounceSolver } from "./bounce/runtime.js";
import { createInstrument } from "./optics/runtime.js";
import { opticalStudies } from "./optics/studies.js";
import { talbotDistance } from "./optics/diffraction.js";
import { studies } from "./catalog.js";
import { createGPU, makeField } from "./gpu.js";
import { geometry, chamber } from "./chamber.js";
import { lattice } from "./solvers/lattice.js";
import { gaussians } from "./solvers/gaussians.js";
import { msdf } from "./solvers/msdf.js";
import { flood } from "./solvers/flood.js";
import { nca } from "./solvers/nca.js";
import { reverb } from "./solvers/reverb.js";
import { edges } from "./solvers/edges.js";
import { gravity } from "./solvers/gravity.js";
const factories = {
  lattice,
  gaussians,
  msdf,
  flood,
  nca,
  reverb,
  edges,
  gravity,
};
const notes = [
  "The streaming step moves RGB radiance along 18 moving directions and one resting channel. Solid voxels redistribute the incoming energy between diffuse and specular directions. Each tick advances one lattice link. The discrete directions and finite resolution produce visible angular bands.",
  "Each splat exchanges energy with its 26 nearest grid neighbors using equal-covariance Gaussian overlaps. Ellipsoidal extinction estimates transmittance between centers. The volume reconstructs the light field from local Gaussian weights. The finite neighborhood and Gaussian blockers approximate mesh visibility.",
  "The two masks encode edge-colored convex apertures. The shader takes the median of the sampled RGB distances and varies the transition width with receiver height. Additional gradient and color taps model dispersion. The finite texture limits the distance and zoom range.",
  "A top-down receiver map stores a dominant patch and a height bound in each of eight sectors. Nine halving strides propagate candidate patches, followed by rectangular contour shading. A second flood takes illuminated obstacles as secondary emitters. Sector sampling can over-occlude or leak at thin geometry.",
  "The local rule was trained on 30 randomized 2D rooms against 128-sample, 16-step path-traced targets and evaluated on six held-out rooms. A material-conditioned MLP supplies the scattering matrix. Each cell carries twelve directional RGB components, three radiance components and an occupancy channel. Height shading extrudes this planar simulation.",
  "The 32 feedback lines use different integer delays. Visibility gates the butterfly rotations in a Walsh–Hadamard network. Orthogonal mixing preserves squared amplitude before wall losses and delay-dependent RT60 attenuation. The displayed late-light energy follows a temporal acoustic analogy.",
  "Each emitter edge contributes a signed Lambert contour integral at each floor receiver. Instanced hardware lines cover one receiver row per edge and add into a floating-point target. A second fixed-function source-alpha blend supports negative and above-one coefficients. The analytical result applies to the unobstructed floor.",
  "A midpoint path integrator advances the perpendicular refractive-index gradient. A Gaussian index bump attracts rays toward the lens center. Each segment deposits density in the volume and each solid hit deposits energy in the receiver voxel. Path highlighting emphasizes a sparse subset of the traced bundle.",
];
const $ = (id) => document.getElementById(id);
const index = $("index");
$("total").textContent = String(studies.length);
for (const [position, study] of studies.entries()) {
  const link = document.createElement("a");
  const number = document.createElement("span");
  link.href = "#" + study.id;
  link.className = "nav-link";
  number.className = "num";
  number.textContent = String(position + 1).padStart(2, "0");
  link.append(number, document.createTextNode(study.name));
  index.append(link);
}

function bindPanel(panel, trigger) {
  const sync = () => {
    const open = panel.matches(":popover-open");
    trigger.setAttribute("aria-expanded", String(open));
    if (
      open &&
      panel.id === "study-index" &&
      !document.documentElement.hasAttribute("data-pointer")
    ) {
      index.querySelector('[aria-current="page"]')?.focus();
    }
  };
  trigger.setAttribute("aria-controls", panel.id);
  trigger.setAttribute("aria-expanded", "false");
  panel.addEventListener("toggle", sync);
}
bindPanel($("study-index"), $("study-open"));
bindPanel($("controls"), $("controls-open"));
addEventListener(
  "pointerdown",
  () => document.documentElement.setAttribute("data-pointer", ""),
  { capture: true },
);
addEventListener(
  "keydown",
  () => document.documentElement.removeAttribute("data-pointer"),
  { capture: true },
);

index.addEventListener("click", (event) => {
  if (
    !event.target.closest("a") ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  $("study-index").hidePopover();
  $("study-open").focus({ preventScroll: true });
});
index.addEventListener("keydown", (event) => {
  const links = [...index.children];
  const position = links.indexOf(document.activeElement);
  if (position < 0) return;
  const destinations = {
    ArrowUp: (position - 1 + links.length) % links.length,
    ArrowDown: (position + 1) % links.length,
    Home: 0,
    End: links.length - 1,
  };
  if (!(event.key in destinations)) return;
  event.preventDefault();
  links[destinations[event.key]].focus();
});
let current = null,
  g,
  renderer,
  volume,
  planar,
  view,
  solver,
  frame = 0,
  serial = Promise.resolve(),
  revision = 0,
  previous = 0,
  selected = 0;
function indexFromURL() {
  const i = studies.findIndex((s) => s.id === location.hash.slice(1));
  return Math.max(0, i);
}
function setPhase(label) {
  const phase = label.toLowerCase();
  $("live").textContent = phase === "initializing" ? "Loading study…" : label;
  $("live").dataset.phase = phase;
  const unavailable = phase === "initializing" || phase === "unavailable";
  $("pause").disabled = unavailable;
  $("action").disabled = unavailable;
}
function syncPlayback() {
  const label = current.paused ? "Resume simulation" : "Pause simulation";
  $("pause").setAttribute("aria-label", label);
  $("pause").title = label;
  $("pause")
    .querySelector("use")
    .setAttribute("href", current.paused ? "#i-play" : "#i-pause");
}
function fail(error) {
  cancelAnimationFrame(frame);
  console.error(error);
  $("error").hidden = false;
  $("error").textContent = error.message || String(error);
  setPhase("UNAVAILABLE");
}
function updateControls(s) {
  $("action").removeAttribute("aria-pressed");
  $("sliders").replaceChildren();
  s.controls.forEach(([name, min, max, value, step], i) => {
    const wrap = document.createElement("div");
    wrap.className = "slider";
    const id = "control-" + i;
    wrap.innerHTML =
      '<label for="' +
      id +
      '">' +
      name +
      '<output></output></label><input type="range" id="' +
      id +
      '" min="' +
      min +
      '" max="' +
      max +
      '" step="' +
      step +
      '" value="' +
      value +
      '">';
    const input = wrap.querySelector("input"),
      output = wrap.querySelector("output");
    function sync() {
      const v = Number(input.value);
      current[["a", "b", "panel"][i]] = v;
      current.dirty = true;
      output.value =
        s.labels?.[i]?.[v] ??
        (Number.isInteger(step) ? String(v) : v.toFixed(2));
      if (s.labels?.[i]) input.setAttribute("aria-valuetext", output.value);
      input.style.setProperty(
        "--fill",
        ((v - min) / (Number(input.max) - min)) * 100 + "%",
      );
      if (s.id === "talbot" && i === 1) {
        const distance = $("control-0");
        distance.max = (1.25 * talbotDistance(v)).toFixed(6);
        distance.dispatchEvent(new Event("input"));
      }
    }
    input.oninput = sync;
    sync();
    $("sliders").append(wrap);
  });
}
function textUI(i) {
  const s = studies[i];
  current = {
    a: 0,
    b: 0,
    on: 1,
    variant: s.defaultVariant ?? 0,
    time: 0,
    dt: 1 / 60,
    tick: 0,
    paused: matchMedia("(prefers-reduced-motion: reduce)").matches,
    first: true,
    dirty: true,
    action: false,
    plan: false,
    items: [],
  };
  document.title = s.name + " · Transport Atlas";
  $("number").textContent = String(i + 1).padStart(2, "0");
  $("name").textContent = s.name;
  $("study-open").setAttribute("aria-label", s.name + ", choose a study");
  $("method").textContent = s.method;
  $("method-detail").textContent = s.detail;
  $("summary").textContent = s.summary;
  $("action").textContent =
    s.action === "Toggle emitter"
      ? "Switch emitter off"
      : current.variant
        ? s.activeAction
        : s.action;
  $("notes-text").textContent = s.notes ?? notes[i];
  $("diagnostic").textContent = "";
  [...index.children].forEach((link, j) => {
    if (i === j) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  updateControls(s);
  if (s.activeAction)
    $("action").setAttribute("aria-pressed", String(!!current.variant));
  syncPlayback();
  setPlan(false);
  setPhase("INITIALIZING");
  $("error").hidden = true;
  $("error").textContent = "";
}
function setPlan(p) {
  if (!current) return;
  current.plan = p;
  view?.setPlan(p);
  $("chamber").setAttribute("aria-pressed", String(!p));
  $("field").setAttribute("aria-pressed", String(p));
  const zoom = matchMedia("(pointer: coarse)").matches
    ? "Pinch to zoom"
    : "Scroll to zoom";
  $("gesture").textContent = p
    ? zoom
    : (studies[selected].id === "wavelets"
        ? "Drag on the luminous panel to paint · "
        : "") +
      "Drag to orbit · " +
      zoom;
}
function draw(t) {
  if (!view || !current) return;
  const s = current,
    dt = Math.min(0.05, Math.max(0.001, (t - previous) / 1000));
  previous = t;
  const moved = view.prepare(),
    changed = s.first || s.dirty;
  const cameraChanged = solver.cameraChanged?.(view.camera, s.plan);
  if (
    (!s.paused && !solver.onDemand) ||
    s.dirty ||
    s.first ||
    s.action ||
    cameraChanged ||
    solver.needsUpdate
  ) {
    if (!s.paused) s.time += dt;
    s.dt = s.paused ? 0 : dt;
    if (s.first || (s.dirty && !solver.onDemand)) {
      s.items = geometry(studies[selected].id, s.a, s.b, s.panel);
      g.geometry(s.items);
      view.update(s.items, s.on, s.a, s.b, s.variant);
    }
    if (solver.patches || solver.onDemand) {
      solver.step(null, s);
    } else {
      g.uniform([
        s.a,
        s.b,
        s.on,
        s.time,
        s.tick,
        s.variant,
        s.dt,
        s.items.length,
      ]);
      const enc = g.device.createCommandEncoder();
      solver.step(enc, s);
      g.device.queue.submit([enc.finish()]);
    }
    s.releaseCount = 0;
    s.tick++;
    s.first = s.dirty = s.action = false;
  }
  if (
    !(solver.patches || solver.onDemand) ||
    moved ||
    (changed && !solver.onDemand) ||
    solver.takeFrame()
  )
    view.draw();
  frame = requestAnimationFrame(draw);
}
async function load(i, r) {
  cancelAnimationFrame(frame);
  if (view) {
    view.dispose();
    view = null;
  }
  solver?.dispose?.();
  solver = null;
  if (g) {
    await g.device.queue.onSubmittedWorkDone();
    g.clear();
  }
  if (r !== revision) return;
  selected = i;
  textUI(i);
  if (!renderer) {
    if (!navigator.gpu)
      throw Error(
        "WebGPU is required for these experiments. Open this page in a WebGPU-enabled browser.",
      );
    renderer = new T.WebGPURenderer({
      canvas: $("scene"),
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
    await renderer.init();
    if (!renderer.backend.isWebGPUBackend)
      throw Error(
        "This browser could not start a WebGPU device. Enable hardware acceleration and reload the page.",
      );
    renderer.setClearColor(0x121212, 0);
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    volume = makeField();
    planar = new T.StorageTexture(512, 512);
    planar.type = T.HalfFloatType;
    planar.generateMipmaps = false;
    renderer.initTexture(planar);
    g = createGPU(renderer, volume);
    g.planar = renderer.backend
      .get(planar)
      .texture.createView({ mipLevelCount: 1 });
    g.device.addEventListener("uncapturederror", (e) => fail(e.error));
    g.device.lost.then((info) => {
      if (info.reason !== "destroyed")
        fail(
          Error("The GPU device was lost. Reload to restart the experiments."),
        );
    });
  }
  const id = studies[i].id;
  solver = factories[id]
    ? await factories[id](g)
    : (opticalStudies.includes(studies[i])
        ? createInstrument
        : createBounceSolver)(
        id,
        (text) => {
          if (r === revision) $("diagnostic").textContent = text;
        },
        (error) => {
          if (r === revision) fail(error);
        },
      );
  if (r !== revision) return;
  current.items = geometry(studies[i].id, current.a, current.b, current.panel);
  view = chamber(
    renderer,
    $("scene"),
    volume,
    planar,
    studies[i].id,
    solver,
    current.items,
    (index, value) => {
      const input = $("control-" + index);
      input.value = value.toFixed(2);
      input.dispatchEvent(new Event("input"));
    },
  );
  view.setPlan(current.plan);
  previous = performance.now();
  draw(previous);
  await solver.ready;
  await g.device.queue.onSubmittedWorkDone();
  if (r === revision && $("error").hidden)
    setPhase(current.paused ? "PAUSED" : "LIVE");
}
function navigate() {
  const i = indexFromURL(),
    r = ++revision;
  serial = serial.then(() => load(i, r)).catch(fail);
}
$("prev").onclick = () =>
  (location.hash =
    studies[(indexFromURL() + studies.length - 1) % studies.length].id);
$("next").onclick = () =>
  (location.hash = studies[(indexFromURL() + 1) % studies.length].id);
$("chamber").onclick = () => setPlan(false);
$("field").onclick = () => setPlan(true);
$("pause").onclick = () => {
  if (!current) return;
  current.paused = !current.paused;
  syncPlayback();
  setPhase(current.paused ? "PAUSED" : "LIVE");
};
$("reset").onclick = () => {
  navigate();
};
$("action").onclick = () => {
  const s = studies[selected],
    c = current;
  if (!c) return;
  c.dirty = true;
  c.action = true;
  if (s.increment) {
    const input = $("control-0");
    input.value = String((Number(input.value) + 1) % (Number(input.max) + 1));
    input.dispatchEvent(new Event("input"));
    return;
  }
  if (s.momentary) {
    if (s.id === "talbot") {
      const input = $("control-0");
      input.value = String(talbotDistance(c.b));
      input.dispatchEvent(new Event("input"));
    }
    if (s.id === "wavelets") solver.clearPaint();
    if (s.id === "rotor") c.releaseCount = (c.releaseCount || 0) + 1;
    return;
  }
  if (s.action === "Toggle emitter") {
    c.on = 1 - c.on;
    $("action").textContent = c.on ? "Switch emitter off" : "Switch emitter on";
  } else if (s.id !== "nca") {
    c.variant = 1 - c.variant;
    $("action").setAttribute("aria-pressed", String(!!c.variant));
    if (s.activeAction)
      $("action").textContent = c.variant ? s.activeAction : s.action;
    if (s.id === "gravity")
      $("action").textContent = c.variant ? "Hide ray paths" : "Show ray paths";
    if (s.id === "edges")
      $("action").textContent = c.variant
        ? "Sum edge terms"
        : "Show edge terms";
  }
};
addEventListener("hashchange", navigate);
navigate();
