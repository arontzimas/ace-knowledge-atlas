import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { hash01 } from './layouts.js';

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export const COLORS = {
  ink: new THREE.Color('#18181b'),
  inkSoft: new THREE.Color('#3f3f46'),
  gray: new THREE.Color('#8b8b92'),
  mute: new THREE.Color('#b9b9bf'),
  red: new THREE.Color('#e5385a'),
  line: new THREE.Color('#55555c'),
};

const POINT_VS = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aAlpha;
attribute float aRing;
uniform float uScale;
uniform float uCap;
uniform float uFogNear;
uniform float uFogFar;
varying vec3 vColor;
varying float vAlpha;
varying float vRing;
varying float vCore;
varying float vPx;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = max(0.1, -mv.z);
  float base = aSize * uScale / dist;
  float cap = uCap * clamp(aSize / 0.62, 0.75, 2.2);
  float px = max(1.6, cap * (1.0 - exp(-base / cap)));
  float total = px + aRing * (10.0 + px * 0.55);
  gl_PointSize = total;
  vPx = total;
  vCore = px / total;
  float fog = smoothstep(uFogNear, uFogFar, dist);
  vAlpha = aAlpha * (1.0 - fog * 0.86);
  vColor = aColor;
  vRing = aRing;
}`;

const POINT_FS = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vRing;
varying float vCore;
varying float vPx;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = length(c);
  float aa = 2.2 / vPx;
  float core = 1.0 - smoothstep(vCore - aa, vCore + aa * 0.5, d);
  float ring = 0.0;
  if (vRing > 0.001) {
    float rr = 1.0 - aa * 2.2;
    float w = aa * 0.9;
    ring = (1.0 - smoothstep(w, w + aa, abs(d - rr))) * vRing;
  }
  float a = max(core, ring * 0.85) * vAlpha;
  if (a < 0.008) discard;
  gl_FragColor = vec4(vColor, a);
}`;

const LINE_VS = /* glsl */ `
attribute float aA;
attribute vec3 aC;
uniform float uOpacity;
uniform float uFogNear;
uniform float uFogFar;
varying float vA;
varying vec3 vC;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float fog = smoothstep(uFogNear, uFogFar, -mv.z);
  vA = aA * uOpacity * (1.0 - fog * 0.85);
  vC = aC;
}`;

const LINE_FS = /* glsl */ `
varying float vA;
varying vec3 vC;
void main() {
  if (vA < 0.003) discard;
  gl_FragColor = vec4(vC, vA);
}`;

function makeLineMesh(maxSegments, fogUniforms) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(maxSegments * 6);
  const a = new Float32Array(maxSegments * 2);
  const c = new Float32Array(maxSegments * 6);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aA', new THREE.BufferAttribute(a, 1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aC', new THREE.BufferAttribute(c, 3).setUsage(THREE.DynamicDrawUsage));
  g.setDrawRange(0, 0);
  const m = new THREE.ShaderMaterial({
    vertexShader: LINE_VS,
    fragmentShader: LINE_FS,
    transparent: true,
    depthWrite: false,
    uniforms: { uOpacity: { value: 1 }, uFogNear: fogUniforms.uFogNear, uFogFar: fogUniforms.uFogFar },
  });
  const mesh = new THREE.LineSegments(g, m);
  mesh.frustumCulled = false;
  return { mesh, pos, a, c, max: maxSegments };
}

export class AtlasEngine {
  constructor({ host, labelHost, kb, onHover, onSelect, onBackground, onLabel, onInteract }) {
    this.kb = kb;
    this.N = kb.N;
    this.host = host;
    this.labelHost = labelHost;
    this.cb = { onHover, onSelect, onBackground, onLabel, onInteract };
    this.W = host.clientWidth || window.innerWidth;
    this.H = host.clientHeight || window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.paused = false;
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    // ---------------------------------------------------------------- three
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(this.dpr);
    renderer.setSize(this.W, this.H);
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);
    this.renderer = renderer;
    this.canvas = renderer.domElement;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, this.W / this.H, 0.5, 3000);
    this.camera.position.set(0, 60, 300);
    this.controls = new OrbitControls(this.camera, this.canvas);
    Object.assign(this.controls, {
      enableDamping: true, dampingFactor: 0.07, rotateSpeed: 0.55, zoomSpeed: 0.9, panSpeed: 0.7,
      minDistance: 5, maxDistance: 480, screenSpacePanning: true, autoRotateSpeed: 0.28,
    });
    this.controls.addEventListener('start', () => {
      this.lastInteract = performance.now();
      this.camTween = null;
      this.cb.onInteract?.('orbit');
    });

    this.fog = { uFogNear: { value: 80 }, uFogFar: { value: 260 } };

    // ---------------------------------------------------------------- atoms
    const N = this.N;
    this.pos = new Float32Array(N * 3);
    this.from = new Float32Array(N * 3);
    this.to = new Float32Array(N * 3);
    this.arc = new Float32Array(N * 3);
    this.delay = new Float32Array(N);
    this.disp = new Float32Array(N * 3);
    this.drPhase = new Float32Array(N * 3);
    this.drFreq = new Float32Array(N * 3);
    this.baseSize = new Float32Array(N);
    this.col = new Float32Array(N * 3);
    this.colT = new Float32Array(N * 3);
    this.alpha = new Float32Array(N);
    this.alphaT = new Float32Array(N);
    this.size = new Float32Array(N);
    this.sizeT = new Float32Array(N);
    this.ring = new Float32Array(N);
    this.ringT = new Float32Array(N);
    this.state = new Uint8Array(N);
    this.sizeOut = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      // start as a loose cloud far out; the first layout pulls everything in
      const r = 120 + hash01(i, 1) * 140;
      const th = hash01(i, 2) * Math.PI * 2;
      const ph = Math.acos(2 * hash01(i, 3) - 1);
      this.pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      this.pos[i * 3 + 1] = r * Math.cos(ph) * 0.6;
      this.pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      for (let k = 0; k < 3; k++) {
        this.drPhase[i * 3 + k] = hash01(i, 10 + k) * Math.PI * 2;
        this.drFreq[i * 3 + k] = 0.22 + hash01(i, 20 + k) * 0.42;
      }
      this.baseSize[i] = 0.26 + 0.55 * Math.pow(kb.atoms[i].w, 1.35);
      COLORS.ink.toArray(this.col, i * 3);
      COLORS.ink.toArray(this.colT, i * 3);
      this.alphaT[i] = 0.9;
      this.sizeT[i] = 1;
    }
    this.disp.set(this.pos);
    const g = new THREE.BufferGeometry();
    this.attrPos = new THREE.BufferAttribute(this.disp, 3).setUsage(THREE.DynamicDrawUsage);
    this.attrCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.attrAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    this.attrSize = new THREE.BufferAttribute(this.sizeOut, 1).setUsage(THREE.DynamicDrawUsage);
    this.attrRing = new THREE.BufferAttribute(this.ring, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.attrPos);
    g.setAttribute('aColor', this.attrCol);
    g.setAttribute('aAlpha', this.attrAlpha);
    g.setAttribute('aSize', this.attrSize);
    g.setAttribute('aRing', this.attrRing);
    this.pointsMat = new THREE.ShaderMaterial({
      vertexShader: POINT_VS,
      fragmentShader: POINT_FS,
      transparent: true,
      depthWrite: false,
      uniforms: { uScale: { value: 1 }, uCap: { value: 12 * this.dpr }, uFogNear: this.fog.uFogNear, uFogFar: this.fog.uFogFar },
    });
    this.points = new THREE.Points(g, this.pointsMat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    this.scene.add(this.points);

    // ---------------------------------------------------------------- lines
    this.structL = makeLineMesh(N + 400, this.fog);
    this.structL.mesh.renderOrder = 1;
    this.scene.add(this.structL.mesh);
    this.struct = null;
    this.pendingStruct = undefined;
    this.structFade = 0;
    this.structFadeT = 0;
    this.structShowAt = 0;

    this.linkL = makeLineMesh(64, this.fog);
    this.scene.add(this.linkL.mesh);
    this.links = [];
    this.linkFade = 0;

    this.ansL = makeLineMesh(24, this.fog);
    this.scene.add(this.ansL.mesh);
    this.answer = { atoms: [], anchor: null, start: 0, fade: 0, fadeT: 0 };

    this.quadGroup = null;
    this.quadFade = 0;
    this.quadFadeT = 0;
    this.pendingQuad = undefined;

    // ---------------------------------------------------------------- labels
    this.labels = new Map();
    this.pin = null;
    this.activeLabelKeys = null;

    // ---------------------------------------------------------------- state
    this.trans = null;
    this.camTween = null;
    this.drift = 0;
    this.driftT = 0.3;
    this.autoRotateAllowed = true;
    this.lastInteract = performance.now();
    this.selected = -1;
    this.hovered = -1;
    this.insets = { l: 0, r: 0, t: 0, b: 0 };
    this.insetsT = { l: 0, r: 0, t: 0, b: 0 };
    this.mouse = { x: -1, y: -1, inside: false, down: null };
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._pm = new THREE.Matrix4();
    this.t0 = performance.now();
    this.last = this.t0;

    this._bind();
    this._resize();
    this.raf = requestAnimationFrame(this._frame);
  }

  // ================================================================== public API
  setLayout(layout, { instant = false, keepCamera = false } = {}) {
    const N = this.N;
    const now = performance.now();
    this.layout = layout;
    this.from.set(this.pos);
    this.to.set(layout.positions);
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < N; i++) { cx += this.to[i * 3]; cy += this.to[i * 3 + 1]; cz += this.to[i * 3 + 2]; }
    cx /= N; cy /= N; cz /= N;
    let maxR = 1;
    const rr = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const r = Math.hypot(this.to[i * 3] - cx, this.to[i * 3 + 1] - cy, this.to[i * 3 + 2] - cz);
      rr[i] = r;
      if (r > maxR) maxR = r;
    }
    const salt = (this._layoutCount = (this._layoutCount || 0) + 1);
    for (let i = 0; i < N; i++) {
      const dx = this.to[i * 3] - this.from[i * 3];
      const dy = this.to[i * 3 + 1] - this.from[i * 3 + 1];
      const dz = this.to[i * 3 + 2] - this.from[i * 3 + 2];
      const dist = Math.hypot(dx, dy, dz);
      let ax = hash01(i, 40 + salt) - 0.5, ay = hash01(i, 50 + salt) - 0.5, az = hash01(i, 60 + salt) - 0.5;
      const al = Math.hypot(ax, ay, az) || 1;
      const amp = Math.min(14, dist * 0.17);
      this.arc[i * 3] = (ax / al) * amp;
      this.arc[i * 3 + 1] = (ay / al) * amp;
      this.arc[i * 3 + 2] = (az / al) * amp;
      this.delay[i] = (rr[i] / maxR) * 360 + hash01(i, 70 + salt) * 240;
    }
    const dur = this.reducedMotion ? 10 : 1500;
    this.trans = instant ? null : { start: now, dur };
    if (instant) { this.pos.set(this.to); }

    this.driftT = layout.drift ?? 0.2;
    this.autoRotateAllowed = !!layout.autoRotate;
    this.setLabels(layout.labels || [], instant ? 0 : 700);
    this._setStruct(layout.struct || null, now + (instant ? 0 : 900));
    this._setQuad(layout.quad || null);

    const c = this.controls;
    if (layout.id === 'quadrant') {
      c.minAzimuthAngle = -1.0; c.maxAzimuthAngle = 1.0; c.minPolarAngle = 0.55; c.maxPolarAngle = 2.4;
    } else {
      c.minAzimuthAngle = -Infinity; c.maxAzimuthAngle = Infinity; c.minPolarAngle = 0; c.maxPolarAngle = Math.PI;
    }
    if (!keepCamera && layout.camera) {
      const { position, target } = this._fitPose(layout.camera);
      this.flyTo(position, target, instant ? 0 : 1700);
    }
  }

  flyTo(position, target, dur = 1400) {
    const p = Array.isArray(position) ? new THREE.Vector3(...position) : position.clone();
    const t = Array.isArray(target) ? new THREE.Vector3(...target) : target.clone();
    if (!dur || this.reducedMotion) {
      this.camera.position.copy(p);
      this.controls.target.copy(t);
      this.controls.update();
      this.camTween = null;
      return;
    }
    this.camTween = {
      start: performance.now(), dur,
      fp: this.camera.position.clone(), ft: this.controls.target.clone(), tp: p, tt: t,
    };
  }

  /** Frame a set of atoms, keeping the current viewing direction. */
  fitAtoms(indices, { pad = 1.3, minDist = 36, maxDist = 260, dur = 1300 } = {}) {
    if (!indices || !indices.length) return;
    let cx = 0, cy = 0, cz = 0;
    indices.forEach((i) => { cx += this.to[i * 3]; cy += this.to[i * 3 + 1]; cz += this.to[i * 3 + 2]; });
    const n = indices.length;
    cx /= n; cy /= n; cz /= n;
    let r = 0;
    indices.forEach((i) => {
      r = Math.max(r, Math.hypot(this.to[i * 3] - cx, this.to[i * 3 + 1] - cy, this.to[i * 3 + 2] - cz));
    });
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const freeW = Math.max(200, this.W - this.insetsT.l - this.insetsT.r);
    const freeH = Math.max(200, this.H - this.insetsT.t - this.insetsT.b);
    const vFov = fov * (freeH / this.H);
    const hFov = 2 * Math.atan(Math.tan(fov / 2) * (freeW / this.H));
    const eff = Math.min(vFov, hFov);
    const d = Math.min(maxDist, Math.max(minDist, (r * pad + 2.5) / Math.sin(eff / 2)));
    const target = new THREE.Vector3(cx, cy, cz);
    const dir = this._v2.copy(this.camera.position).sub(this.controls.target).normalize();
    this.flyTo(target.clone().add(dir.multiplyScalar(d)), target, dur);
    this.lastInteract = performance.now();
  }

  focusAtom(i, { dist = 38, dur = 1200 } = {}) {
    if (i < 0) return;
    const t = new THREE.Vector3(this.to[i * 3], this.to[i * 3 + 1], this.to[i * 3 + 2]);
    const dir = this._v2.copy(this.camera.position).sub(this.controls.target).normalize();
    this.flyTo(t.clone().add(dir.multiplyScalar(dist)), t, dur);
    this.lastInteract = performance.now();
  }

  resetCamera() {
    if (!this.layout?.camera) return;
    const { position, target } = this._fitPose(this.layout.camera);
    this.flyTo(position, target, 1400);
  }

  /** Pull a layout's default camera back on narrow viewports so the whole layout stays in frame. */
  _fitPose(cam) {
    const I = this.insetsT;
    const aspect = Math.max(0.3, (this.W - I.l - I.r) / Math.max(200, this.H - I.t - I.b));
    const k = aspect < 1.45 ? Math.pow(1.45 / aspect, 0.85) : 1;
    const t = cam.target;
    const p = cam.position;
    return { target: t, position: [t[0] + (p[0] - t[0]) * k, t[1] + (p[1] - t[1]) * k, t[2] + (p[2] - t[2]) * k] };
  }

  setVisualTargets(v) {
    this.colT.set(v.color);
    this.alphaT.set(v.alpha);
    this.sizeT.set(v.size);
    this.ringT.set(v.ring);
    this.state.set(v.state);
  }

  setSelected(i) { this.selected = i; this._updateLinks(); }

  /** Float the selected atom's source card beside it, tethered by a hairline (Kunumi-style). */
  setPin(i, html) {
    if (this.pin && this.pin.i === i) return;
    if (this.pin) {
      const old = this.pin.el;
      old.classList.add('is-out');
      old.style.opacity = '0';
      setTimeout(() => old.remove(), 500);
      this.pin = null;
    }
    if (i < 0 || !html) return;
    const el = document.createElement('div');
    el.className = 'lbl lbl-pin';
    el.innerHTML = html;
    el.style.opacity = '0';
    this.labelHost.appendChild(el);
    this.pin = { i, el, a: 0, born: performance.now() + 450, world: new THREE.Vector3() };
  }

  setInsets(ins) { Object.assign(this.insetsT, ins); }

  setPaused(p) {
    this.paused = p;
  }

  setAnswer(atoms, anchor) {
    const same = atoms.length === this.answer.atoms.length && atoms.every((a, k) => a === this.answer.atoms[k]);
    if (!same) this.answer.start = performance.now();
    this.answer.atoms = atoms;
    this.answer.anchor = anchor;
    this.answer.fadeT = atoms.length && anchor ? 1 : 0;
  }

  setActiveLabels(keys) {
    this.activeLabelKeys = keys && keys.size ? keys : null;
    this.labels.forEach((L, key) => {
      L.el.classList.toggle('is-active', !!this.activeLabelKeys?.has(key));
      L.el.classList.toggle('is-muted', !!this.activeLabelKeys && !this.activeLabelKeys.has(key));
    });
  }

  setLabels(specs, delay = 0) {
    const now = performance.now();
    const keep = new Set(specs.map((s) => s.key));
    this.labels.forEach((L, key) => {
      if (!keep.has(key) && !L.dying) {
        L.dying = now;
        L.el.classList.add('is-out');
      }
    });
    specs.forEach((s) => {
      let L = this.labels.get(s.key);
      if (L && !L.dying) {
        L.pos.set(...s.pos);
        return;
      }
      if (L) { L.el.remove(); this.labels.delete(s.key); }
      const el = document.createElement('div');
      el.className = `lbl lbl-${s.kind}${s.cls ? ' ' + s.cls : ''}${s.click ? ' is-click' : ''}`;
      el.innerHTML = s.html;
      el.style.opacity = '0';
      if (s.click) {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          this.cb.onLabel?.(s.click);
        });
      }
      this.labelHost.appendChild(el);
      L = { el, pos: new THREE.Vector3(...s.pos), kind: s.kind, worldWidth: s.worldWidth || 0, weight: s.weight || 0, born: now + delay, a: 0, dying: 0, lastT: '', lastO: -1 };
      if (this.activeLabelKeys) {
        el.classList.toggle('is-active', this.activeLabelKeys.has(s.key));
        el.classList.toggle('is-muted', !this.activeLabelKeys.has(s.key));
      }
      this.labels.set(s.key, L);
    });
  }

  screenOf(i) {
    this._v.set(this.disp[i * 3], this.disp[i * 3 + 1], this.disp[i * 3 + 2]).project(this.camera);
    return { x: (this._v.x * 0.5 + 0.5) * this.W, y: (-this._v.y * 0.5 + 0.5) * this.H, z: this._v.z };
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this._unbind();
    this.labels.forEach((L) => L.el.remove());
    this.labels.clear();
    this.pin?.el.remove();
    this.controls.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }

  // ================================================================== internals
  _bind() {
    this._onMove = (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
      this.mouse.inside = e.target === this.canvas;
      this.mouse.dirty = true;
    };
    this._onDown = (e) => {
      if (e.target !== this.canvas) return;
      this.mouse.down = { x: e.clientX, y: e.clientY, t: performance.now() };
    };
    this._onUp = (e) => {
      const d = this.mouse.down;
      this.mouse.down = null;
      if (!d || e.target !== this.canvas) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || performance.now() - d.t > 600) return;
      this.lastInteract = performance.now();
      this._onMove(e);
      const i = this._pick();
      if (i >= 0) this.cb.onSelect?.(i);
      else this.cb.onBackground?.();
    };
    this._onLeave = () => {
      this.mouse.inside = false;
      this.mouse.dirty = true;
    };
    this._onWheel = () => {
      this.lastInteract = performance.now();
      this.camTween = null;
      this.cb.onInteract?.('wheel');
    };
    window.addEventListener('pointermove', this._onMove, { passive: true });
    this.canvas.addEventListener('pointerdown', this._onDown);
    window.addEventListener('pointerup', this._onUp);
    this.canvas.addEventListener('pointerleave', this._onLeave);
    this.canvas.addEventListener('wheel', this._onWheel, { passive: true });
    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(this.host);
    this._onVis = () => { this.last = performance.now(); };
    document.addEventListener('visibilitychange', this._onVis);
  }

  _unbind() {
    window.removeEventListener('pointermove', this._onMove);
    this.canvas.removeEventListener('pointerdown', this._onDown);
    window.removeEventListener('pointerup', this._onUp);
    this.canvas.removeEventListener('pointerleave', this._onLeave);
    this.canvas.removeEventListener('wheel', this._onWheel);
    document.removeEventListener('visibilitychange', this._onVis);
    this._ro?.disconnect();
  }

  _resize() {
    const W = this.host.clientWidth || window.innerWidth;
    const H = this.host.clientHeight || window.innerHeight;
    this.W = W;
    this.H = H;
    this.renderer.setSize(W, H);
    this.camera.aspect = W / H;
    this._applyViewOffset(true);
    this.pointsMat.uniforms.uScale.value = (H * this.dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
  }

  _applyViewOffset(force) {
    const I = this.insets;
    const x = -(I.l - I.r) / 2;
    const y = -(I.t - I.b) / 2;
    if (!force && Math.abs(x - (this._vox || 0)) < 0.25 && Math.abs(y - (this._voy || 0)) < 0.25) return;
    this._vox = x;
    this._voy = y;
    this.camera.setViewOffset(this.W, this.H, x, y, this.W, this.H);
    this.camera.updateProjectionMatrix();
  }

  _pick() {
    if (!this.mouse.inside) return -1;
    const cam = this.camera;
    cam.updateMatrixWorld();
    const m = this._pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).elements;
    const pxScale = this.H / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    const mx = this.mouse.x, my = this.mouse.y;
    let best = -1, bestScore = Infinity;
    for (let i = 0; i < this.N; i++) {
      const a = this.alpha[i];
      if (a < 0.08) continue;
      const x = this.disp[i * 3], y = this.disp[i * 3 + 1], z = this.disp[i * 3 + 2];
      const w = m[3] * x + m[7] * y + m[11] * z + m[15];
      if (w <= 0.5) continue;
      const sx = ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w * 0.5 + 0.5) * this.W;
      const sy = (-(m[1] * x + m[5] * y + m[9] * z + m[13]) / w * 0.5 + 0.5) * this.H;
      const dx = sx - mx, dy = sy - my;
      const d2 = dx * dx + dy * dy;
      const rad = Math.max(7, (this.sizeOut[i] * pxScale) / w / 2 + 5);
      if (d2 > rad * rad) continue;
      const score = d2 / (rad * rad) + (a < 0.35 ? 1.2 : 0) + w * 0.0015;
      if (score < bestScore) { bestScore = score; best = i; }
    }
    return best;
  }

  _setStruct(struct, showAt) {
    this.pendingStruct = struct;
    this.structShowAt = showAt;
    this.structFadeT = 0;
  }

  _setQuad(quad) {
    this.pendingQuad = quad;
    this.quadFadeT = 0;
  }

  _buildQuad(quad) {
    const group = new THREE.Group();
    const segs = quad.segments;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(segs.length * 6);
    const a = new Float32Array(segs.length * 2);
    const c = new Float32Array(segs.length * 6);
    segs.forEach((s, k) => {
      pos.set(s.slice(0, 6), k * 6);
      a[k * 2] = a[k * 2 + 1] = s[6];
      COLORS.line.toArray(c, k * 6);
      COLORS.line.toArray(c, k * 6 + 3);
    });
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aA', new THREE.BufferAttribute(a, 1));
    g.setAttribute('aC', new THREE.BufferAttribute(c, 3));
    const mat = new THREE.ShaderMaterial({
      vertexShader: LINE_VS, fragmentShader: LINE_FS, transparent: true, depthWrite: false,
      uniforms: { uOpacity: { value: 0 }, uFogNear: { value: 1e4 }, uFogFar: { value: 2e4 } },
    });
    const lines = new THREE.LineSegments(g, mat);
    group.add(lines);
    const panes = quad.panes.map((p) => {
      const geo = new THREE.PlaneGeometry(p.x1 - p.x0, p.y1 - p.y0);
      const m = new THREE.MeshBasicMaterial({
        color: p.action ? COLORS.red : COLORS.ink, transparent: true, opacity: 0, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set((p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, p.z);
      mesh.userData.base = p.action ? 0.055 : 0.022;
      group.add(mesh);
      return mesh;
    });
    group.userData = { lines, panes };
    group.renderOrder = 0;
    return group;
  }

  _updateLinks() {
    const links = [];
    const add = (c, kind) => {
      if (c < 0) return;
      this.kb.atoms[c].nb.slice(0, 7).forEach((j) => links.push([c, j, kind]));
    };
    add(this.selected, 1);
    if (this.hovered !== this.selected) add(this.hovered, 0);
    this.links = links;
  }

  _frame = (now) => {
    this.raf = requestAnimationFrame(this._frame);
    if (document.hidden) return;
    const dt = Math.max(0, Math.min(0.1, (now - this.last) / 1000));
    this.last = now;
    const t = (now - this.t0) / 1000;
    const N = this.N;

    // ---------------- insets / view offset
    const I = this.insets, IT = this.insetsT;
    const ki = 1 - Math.exp(-dt * 7);
    I.l += (IT.l - I.l) * ki; I.r += (IT.r - I.r) * ki; I.t += (IT.t - I.t) * ki; I.b += (IT.b - I.b) * ki;
    this._applyViewOffset(false);

    // ---------------- camera
    if (this.camTween) {
      const ct = this.camTween;
      const p = clamp01((now - ct.start) / ct.dur);
      const e = easeInOut(p);
      this.camera.position.lerpVectors(ct.fp, ct.tp, e);
      this.controls.target.lerpVectors(ct.ft, ct.tt, e);
      this.camera.lookAt(this.controls.target);
      if (p >= 1) {
        this.camTween = null;
        this.controls.update();
      }
    } else {
      const idle = now - this.lastInteract > 5000;
      this.controls.autoRotate = this.autoRotateAllowed && idle && !this.paused && this.selected < 0 && !this.reducedMotion;
      this.controls.update();
    }
    const camDist = this.camera.position.distanceTo(this.controls.target);
    this.fog.uFogNear.value = camDist * 0.72;
    this.fog.uFogFar.value = camDist * 2.1 + 40;

    // ---------------- positions
    if (this.trans) {
      const tr = this.trans;
      const el = now - tr.start;
      let done = true;
      for (let i = 0; i < N; i++) {
        const p = clamp01((el - this.delay[i]) / tr.dur);
        if (p < 1) done = false;
        const e = easeInOut(p);
        const s = Math.sin(Math.PI * e);
        const o = i * 3;
        this.pos[o] = this.from[o] + (this.to[o] - this.from[o]) * e + this.arc[o] * s;
        this.pos[o + 1] = this.from[o + 1] + (this.to[o + 1] - this.from[o + 1]) * e + this.arc[o + 1] * s;
        this.pos[o + 2] = this.from[o + 2] + (this.to[o + 2] - this.from[o + 2]) * e + this.arc[o + 2] * s;
      }
      if (done) {
        this.pos.set(this.to);
        this.trans = null;
      }
    }
    const driftTarget = this.paused || this.reducedMotion ? 0 : this.driftT;
    this.drift += (driftTarget - this.drift) * (1 - Math.exp(-dt * 2));
    const A = this.drift;
    for (let i = 0; i < N * 3; i++) {
      this.disp[i] = this.pos[i] + (A > 0.001 ? Math.sin(t * this.drFreq[i] + this.drPhase[i]) * A : 0);
    }
    this.attrPos.needsUpdate = true;

    // ---------------- visuals
    const kv = 1 - Math.exp(-dt * 9);
    for (let i = 0; i < N; i++) {
      const o = i * 3;
      this.col[o] += (this.colT[o] - this.col[o]) * kv;
      this.col[o + 1] += (this.colT[o + 1] - this.col[o + 1]) * kv;
      this.col[o + 2] += (this.colT[o + 2] - this.col[o + 2]) * kv;
      this.alpha[i] += (this.alphaT[i] - this.alpha[i]) * kv;
      this.size[i] += (this.sizeT[i] - this.size[i]) * kv;
      const rt = i === this.hovered ? Math.max(this.ringT[i], 0.75) : this.ringT[i];
      this.ring[i] += (rt - this.ring[i]) * kv;
      let s = this.size[i] * this.baseSize[i];
      if (i === this.hovered) s *= 1.45;
      if (this.state[i] === 3) s *= 1 + 0.1 * Math.sin(t * 3.2);
      this.sizeOut[i] = s;
    }
    this.attrCol.needsUpdate = true;
    this.attrAlpha.needsUpdate = true;
    this.attrSize.needsUpdate = true;
    this.attrRing.needsUpdate = true;

    // ---------------- hover picking
    if (this.mouse.dirty && !this.mouse.down) {
      this.mouse.dirty = false;
      const h = this._pick();
      if (h !== this.hovered) {
        this.hovered = h;
        this._updateLinks();
        this.canvas.style.cursor = h >= 0 ? 'pointer' : '';
      }
      if (h >= 0) {
        const s = this.screenOf(h);
        this.cb.onHover?.(h, s.x, s.y);
      } else {
        this.cb.onHover?.(-1);
      }
    } else if (this.hovered >= 0 && (this.trans || this.camTween || this.controls.autoRotate)) {
      const s = this.screenOf(this.hovered);
      this.cb.onHover?.(this.hovered, s.x, s.y);
    }

    this._frameStruct(now, dt);
    this._framePin(now, dt);
    this._frameLinks(dt);
    this._frameAnswer(now, dt, camDist);
    this._frameQuad(dt);
    this._frameLabels(now, dt);

    this.renderer.render(this.scene, this.camera);
  };

  _frameStruct(now, dt) {
    if (this.pendingStruct !== undefined) {
      this.structFadeT = 0;
      if (this.structFade < 0.03 && now >= this.structShowAt) {
        this.struct = this.pendingStruct;
        this.pendingStruct = undefined;
        this.structFadeT = this.struct ? 1 : 0;
      }
    }
    this.structFade += (this.structFadeT - this.structFade) * (1 - Math.exp(-dt * (this.structFadeT ? 2.2 : 7)));
    const L = this.structL;
    L.mesh.material.uniforms.uOpacity.value = this.structFade;
    if (!this.struct || this.structFade < 0.005) {
      L.mesh.geometry.setDrawRange(0, 0);
      return;
    }
    const { nodes, edges } = this.struct;
    const n = Math.min(edges.length, L.max);
    const red = COLORS.red, line = COLORS.line;
    for (let k = 0; k < n; k++) {
      const [ta, ia, tb, ib, base] = edges[k];
      const o = k * 6;
      const pa = ta ? this.disp : nodes;
      const pb = tb ? this.disp : nodes;
      L.pos[o] = pa[ia * 3]; L.pos[o + 1] = pa[ia * 3 + 1]; L.pos[o + 2] = pa[ia * 3 + 2];
      L.pos[o + 3] = pb[ib * 3]; L.pos[o + 4] = pb[ib * 3 + 1]; L.pos[o + 5] = pb[ib * 3 + 2];
      let alpha = base;
      let c = line;
      const atom = tb ? ib : ta ? ia : -1;
      if (atom >= 0) {
        const st = this.state[atom];
        if (st === 1) alpha *= 0.25;
        else if (st >= 2) { alpha = Math.min(0.7, base * 3.2); c = red; }
      }
      L.a[k * 2] = alpha * 0.9;
      L.a[k * 2 + 1] = alpha;
      c.toArray(L.c, o);
      c.toArray(L.c, o + 3);
    }
    L.mesh.geometry.setDrawRange(0, n * 2);
    L.mesh.geometry.attributes.position.needsUpdate = true;
    L.mesh.geometry.attributes.aA.needsUpdate = true;
    L.mesh.geometry.attributes.aC.needsUpdate = true;
  }

  _framePin(now, dt) {
    const P = this.pin;
    if (!P) return;
    const cam = this.camera;
    const i = P.i;
    const base = this._v.set(this.disp[i * 3], this.disp[i * 3 + 1], this.disp[i * 3 + 2]);
    const dist = base.distanceTo(cam.position);
    // offset up-and-right in screen space, scaled with distance so it reads the same at any zoom
    const right = this._v2.setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const k = dist * 0.16;
    P.world.copy(base).addScaledVector(right, -k * 1.15).addScaledVector(up, k * 0.62);
    const v = P.world.clone().project(cam);
    const sx = (v.x * 0.5 + 0.5) * this.W, sy = (-v.y * 0.5 + 0.5) * this.H;
    const want = now >= P.born && v.z < 1 ? 1 : 0;
    P.a += (want - P.a) * (1 - Math.exp(-dt * 6));
    P.el.style.transform = `translate3d(${sx.toFixed(1)}px,${sy.toFixed(1)}px,0) translate(-50%,-100%)`;
    P.el.style.opacity = P.a.toFixed(2);
  }

  _frameLinks(dt) {
    const L = this.linkL;
    const target = this.links.length || this.pin ? 1 : 0;
    this.linkFade += (target - this.linkFade) * (1 - Math.exp(-dt * 8));
    L.mesh.material.uniforms.uOpacity.value = this.linkFade;
    let n = Math.min(this.links.length, L.max - 1);
    for (let k = 0; k < n; k++) {
      const [a, b, kind] = this.links[k];
      const o = k * 6;
      L.pos[o] = this.disp[a * 3]; L.pos[o + 1] = this.disp[a * 3 + 1]; L.pos[o + 2] = this.disp[a * 3 + 2];
      L.pos[o + 3] = this.disp[b * 3]; L.pos[o + 4] = this.disp[b * 3 + 1]; L.pos[o + 5] = this.disp[b * 3 + 2];
      const c = kind ? COLORS.red : COLORS.line;
      c.toArray(L.c, o);
      c.toArray(L.c, o + 3);
      L.a[k * 2] = kind ? 0.55 : 0.45;
      L.a[k * 2 + 1] = kind ? 0.18 : 0.12;
    }
    if (this.pin && this.pin.a > 0.02) {
      const o = n * 6, i = this.pin.i, w = this.pin.world;
      L.pos[o] = this.disp[i * 3]; L.pos[o + 1] = this.disp[i * 3 + 1]; L.pos[o + 2] = this.disp[i * 3 + 2];
      L.pos[o + 3] = w.x; L.pos[o + 4] = w.y; L.pos[o + 5] = w.z;
      COLORS.ink.toArray(L.c, o);
      COLORS.ink.toArray(L.c, o + 3);
      L.a[n * 2] = 0.5 * this.pin.a;
      L.a[n * 2 + 1] = 0.35 * this.pin.a;
      n++;
    }
    if (n) {
      L.mesh.geometry.setDrawRange(0, n * 2);
      L.mesh.geometry.attributes.position.needsUpdate = true;
      L.mesh.geometry.attributes.aA.needsUpdate = true;
      L.mesh.geometry.attributes.aC.needsUpdate = true;
    } else if (this.linkFade < 0.01) {
      L.mesh.geometry.setDrawRange(0, 0);
    }
  }

  _frameAnswer(now, dt, camDist) {
    const A = this.answer;
    const L = this.ansL;
    A.fade += (A.fadeT - A.fade) * (1 - Math.exp(-dt * 6));
    L.mesh.material.uniforms.uOpacity.value = A.fade;
    if (!A.atoms.length || !A.anchor || A.fade < 0.01) {
      if (A.fade < 0.01) L.mesh.geometry.setDrawRange(0, 0);
      return;
    }
    // anchor: a point along the view ray under the answer panel edge
    const ndcX = (A.anchor.x / this.W) * 2 - 1;
    const ndcY = -(A.anchor.y / this.H) * 2 + 1;
    const v = this._v.set(ndcX, ndcY, 0.5).unproject(this.camera);
    v.sub(this.camera.position).normalize().multiplyScalar(camDist * 0.42).add(this.camera.position);
    const n = Math.min(A.atoms.length, L.max);
    for (let k = 0; k < n; k++) {
      const i = A.atoms[k];
      const p = easeOut(clamp01((now - A.start - 250 - k * 110) / 900));
      const o = k * 6;
      const x = this.disp[i * 3], y = this.disp[i * 3 + 1], z = this.disp[i * 3 + 2];
      L.pos[o] = x; L.pos[o + 1] = y; L.pos[o + 2] = z;
      L.pos[o + 3] = x + (v.x - x) * p; L.pos[o + 4] = y + (v.y - y) * p; L.pos[o + 5] = z + (v.z - z) * p;
      COLORS.red.toArray(L.c, o);
      COLORS.line.toArray(L.c, o + 3);
      L.a[k * 2] = 0.6;
      L.a[k * 2 + 1] = 0.22;
    }
    L.mesh.geometry.setDrawRange(0, n * 2);
    L.mesh.geometry.attributes.position.needsUpdate = true;
    L.mesh.geometry.attributes.aA.needsUpdate = true;
    L.mesh.geometry.attributes.aC.needsUpdate = true;
  }

  _frameQuad(dt) {
    if (this.pendingQuad !== undefined) {
      this.quadFadeT = 0;
      if (this.quadFade < 0.02) {
        if (this.quadGroup) {
          this.scene.remove(this.quadGroup);
          this.quadGroup.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
          this.quadGroup = null;
        }
        if (this.pendingQuad) {
          this.quadGroup = this._buildQuad(this.pendingQuad);
          this.scene.add(this.quadGroup);
          this.quadFadeT = 1;
        }
        this.pendingQuad = undefined;
      }
    }
    this.quadFade += (this.quadFadeT - this.quadFade) * (1 - Math.exp(-dt * (this.quadFadeT ? 2.5 : 9)));
    if (this.quadGroup) {
      const { lines, panes } = this.quadGroup.userData;
      lines.material.uniforms.uOpacity.value = this.quadFade;
      panes.forEach((p) => { p.material.opacity = p.userData.base * this.quadFade; });
    }
  }

  _frameLabels(now, dt) {
    const cam = this.camera;
    const ka = 1 - Math.exp(-dt * 7);
    const fogNear = this.fog.uFogNear.value, fogFar = this.fog.uFogFar.value;
    const pxPerUnit = this.H / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    const toRemove = [];
    const cands = [];
    const PRI = { root: 0, domain: 1, group: 2, topic: 3, theme: 4, card: 5, quad: 9, axis: 9, tick: 9 };
    this.labels.forEach((L, key) => {
      if (L.dying && now - L.dying > 600) { toRemove.push(key); return; }
      const v = this._v.copy(L.pos).applyMatrix4(cam.matrixWorldInverse);
      const depth = -v.z;
      L.depth = depth;
      L.want = L.dying ? 0 : now >= L.born && depth > 1 ? 1 - smooth(fogNear * 0.95, fogFar * 0.9, depth) * 0.85 : 0;
      if (depth > 1) {
        v.copy(L.pos).project(cam);
        L.sx = (v.x * 0.5 + 0.5) * this.W;
        L.sy = (-v.y * 0.5 + 0.5) * this.H;
        if (L.sx < -300 || L.sx > this.W + 300 || L.sy < -200 || L.sy > this.H + 200) L.want = 0;
      } else L.want = 0;
      if (L.want > 0 && PRI[L.kind] < 9) cands.push(L);
    });
    // declutter: nearer and more important labels win; overlapping ones fade out
    cands.forEach((L) => {
      L.act = L.el.classList.contains('is-active') ? 1 : 0;
      if (L.kind === 'card') L.cs = Math.max(0.14, Math.min(1.5, (L.worldWidth * pxPerUnit) / L.depth / 120));
    });
    cands.sort((a, b) => (b.act - a.act) || PRI[a.kind] - PRI[b.kind] || (a.kind === 'card' ? b.weight / (b.depth + 20) - a.weight / (a.depth + 20) : a.depth - b.depth));
    const placed = [];
    cands.forEach((L) => {
      if (!L.w) { L.w = L.el.offsetWidth || 80; L.h = L.el.offsetHeight || 18; }
      const pad = L.kind === 'card' ? 2 : 6;
      const k = L.kind === 'card' ? L.cs : 1;
      const w = L.w * k, h = L.h * k;
      const r = [L.sx - w / 2 - pad, L.sy - h / 2 - pad, L.sx + w / 2 + pad, L.sy + h / 2 + pad];
      const hit = placed.some((p) => r[0] < p[2] && r[2] > p[0] && r[1] < p[3] && r[3] > p[1]);
      if (hit) L.want = 0;
      else placed.push(r);
    });
    this.labels.forEach((L) => {
      if (L.dying && now - L.dying > 600) return;
      L.a += ((L.want || 0) - L.a) * ka;
      const op = L.a;
      if (op < 0.01) {
        if (L.lastO !== 0) { L.el.style.opacity = '0'; L.el.style.visibility = 'hidden'; L.lastO = 0; }
        return;
      }
      let scale = 1;
      if (L.kind === 'card') scale = Math.max(0.14, Math.min(1.5, (L.worldWidth * pxPerUnit) / L.depth / 120));
      const tr = `translate3d(${L.sx.toFixed(1)}px,${L.sy.toFixed(1)}px,0) translate(-50%,-50%) scale(${scale.toFixed(3)})`;
      if (tr !== L.lastT) { L.el.style.transform = tr; L.lastT = tr; }
      const o = op.toFixed(2);
      if (o !== L.lastO) { L.el.style.opacity = o; L.el.style.visibility = 'visible'; L.lastO = o; }
      if (L.kind === 'card') L.el.style.zIndex = String(10000 - Math.round(L.depth * 10));
    });
    toRemove.forEach((k) => { this.labels.get(k)?.el.remove(); this.labels.delete(k); });
  }
}
