import { QUAD_PRESETS, QUAD_PLANE, qx, qy, metricOf } from './quad.js';
import { FORMAT_LABEL } from '../search/kb.js';

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export function hash01(i, salt = 0) {
  let x = (i + 1) * 374761393 + salt * 668265263;
  x = (x ^ (x >>> 13)) * 1274126177;
  x = x ^ (x >>> 16);
  return ((x >>> 0) % 100000) / 100000;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fibSphere(n, i) {
  const y = 1 - ((i + 0.5) / n) * 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const t = GOLDEN * i;
  return [Math.cos(t) * r, y, Math.sin(t) * r];
}

function fibBall(n, i, R) {
  const [x, y, z] = fibSphere(n, i);
  const rr = R * Math.cbrt((i + 0.5) / n);
  return [x * rr, y * rr, z * rr];
}

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** orthonormal basis around direction d */
function basis(d) {
  const up = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = normalize(cross(up, d));
  const v = cross(d, u);
  return [u, v];
}

// ------------------------------------------------------------------ constellation
export function constellationLayout(kb) {
  const N = kb.N;
  const P = new Float32Array(N * 3);
  kb.atoms.forEach((a, i) => P.set(a.xyz, i * 3));
  // theme labels at theme centroids
  const sums = kb.themes.map(() => [0, 0, 0, 0]);
  kb.atoms.forEach((a) => {
    const s = sums[a.theme];
    s[0] += a.xyz[0]; s[1] += a.xyz[1]; s[2] += a.xyz[2]; s[3]++;
  });
  const labels = kb.themes.map((t, k) => {
    const s = sums[k];
    return {
      key: 'theme-' + k, kind: 'theme',
      pos: [s[0] / s[3], s[1] / s[3] + 2.5, s[2] / s[3]],
      html: `<span>${esc(t.label)}</span>`,
      click: { kind: 'theme', id: t.id },
    };
  });
  return {
    id: 'constellation', positions: P, labels, struct: null,
    camera: { position: [0, 16, 122], target: [0, 0, 0] },
    drift: 0.32, autoRotate: true,
  };
}

// ------------------------------------------------------------------ clusters
export const GROUPS = {
  topic: { label: 'Topic' },
  domain: { label: 'Domain' },
  theme: { label: 'Semantic theme' },
  type: { label: 'Format' },
  persona: { label: 'Persona' },
  stage: { label: 'Funnel stage' },
  intent: { label: 'Intent' },
};

export function groupKeys(kb, by) {
  const m = kb.meta;
  switch (by) {
    case 'domain': return { names: kb.ontology.domains.map((d) => d.name), key: (a) => a.domain };
    case 'theme': return { names: kb.themes.map((t) => t.label), key: (a) => a.theme };
    case 'type': return { names: m.formats.map((f) => FORMAT_LABEL[f]), key: (a) => m.formats.indexOf(a.type) };
    case 'persona': return { names: m.personas, key: (a) => m.personas.indexOf(a.personas[0]) };
    case 'stage': return { names: m.stages, key: (a) => m.stages.indexOf(a.stage) };
    case 'intent': return { names: m.intents, key: (a) => m.intents.indexOf(a.intent) };
    case 'topic':
    default: return { names: kb.ontology.topics.map((t) => t.name), key: (a) => a.topic };
  }
}

export function clustersLayout(kb, by = 'topic') {
  const N = kb.N;
  const P = new Float32Array(N * 3);
  const { names, key } = groupKeys(kb, by);
  const G = names.length;
  const members = names.map(() => []);
  kb.atoms.forEach((a, i) => {
    const g = key(a);
    if (g >= 0) members[g].push(i);
  });
  // secondary order keeps semantically close atoms adjacent inside each cluster
  members.forEach((list) => list.sort((i, j) => {
    const a = kb.atoms[i], b = kb.atoms[j];
    const sa = by === 'topic' ? a.theme : a.topic;
    const sb = by === 'topic' ? b.theme : b.topic;
    return sa - sb || a.xyz[0] - b.xyz[0];
  }));
  const groups = names.map((n, g) => ({ g, name: n, list: members[g] })).filter((x) => x.list.length);
  const ring = groups.length <= 10;
  const labels = [];
  const maxR = Math.max(...groups.map((x) => 1.45 * Math.cbrt(x.list.length)));
  groups.forEach((grp, k) => {
    const n = grp.list.length;
    const r = 1.45 * Math.cbrt(n) + 0.6;
    let c;
    if (ring) {
      const R = Math.max(30, (groups.length * (maxR * 2 + 7)) / (2 * Math.PI));
      const ang = (k / groups.length) * Math.PI * 2;
      c = [Math.sin(ang) * R, Math.sin(ang * 2) * 3, Math.cos(ang) * R];
    } else {
      const d = fibSphere(groups.length, k);
      c = [d[0] * 50, d[1] * 44, d[2] * 50];
    }
    grp.list.forEach((i, j) => {
      const p = fibBall(n, j, r);
      P[i * 3] = c[0] + p[0];
      P[i * 3 + 1] = c[1] + p[1];
      P[i * 3 + 2] = c[2] + p[2];
    });
    labels.push({
      key: `grp-${by}-${grp.g}`, kind: 'group',
      pos: [c[0], c[1] + r + 2.2, c[2]],
      html: `<span>${esc(grp.name)}</span><em>${n}</em>`,
      click: { kind: by === 'topic' ? 'topic' : by === 'domain' ? 'domain' : by === 'theme' ? 'theme' : 'group', id: grp.g, by },
    });
  });
  return {
    id: 'clusters', positions: P, labels, struct: null,
    camera: ring ? { position: [0, 52, 128], target: [0, -2, 0] } : { position: [0, 14, 178], target: [0, 0, 0] },
    drift: 0.22, autoRotate: true,
  };
}

// ------------------------------------------------------------------ ontology (radial 3D tree)
export function ontologyLayout(kb) {
  const N = kb.N;
  const P = new Float32Array(N * 3);
  const { domains, topics } = kb.ontology;
  const nodes = [];
  const edges = [];
  const labels = [];
  // node 0 = root
  nodes.push([0, 0, 0]);
  labels.push({ key: 'onto-root', kind: 'root', pos: [0, 0, 0], html: `<span>${esc(kb.meta.name)}</span><em>${kb.N.toLocaleString()} atoms</em>`, click: { kind: 'all' } });
  const R_D = 28, R_T = 46, R_A = 63;
  const topicMembers = topics.map(() => []);
  kb.atoms.forEach((a, i) => topicMembers[a.topic].push(i));
  topicMembers.forEach((l) => l.sort((i, j) => kb.atoms[i].theme - kb.atoms[j].theme || kb.atoms[i].xyz[1] - kb.atoms[j].xyz[1]));

  domains.forEach((d, di) => {
    // rotate the fibonacci distribution a little so no domain sits at a pole
    let dir = fibSphere(domains.length, di);
    dir = normalize([dir[0] + 0.25, dir[1] * 0.78, dir[2]]);
    const dIdx = nodes.length;
    nodes.push([dir[0] * R_D, dir[1] * R_D, dir[2] * R_D]);
    edges.push([0, 0, 0, dIdx, 0.5]);
    labels.push({ key: 'onto-d-' + di, kind: 'domain', pos: [dir[0] * R_D, dir[1] * R_D + 1.6, dir[2] * R_D], html: `<span>${esc(d.name)}</span>`, click: { kind: 'domain', id: di } });
    const [u, v] = basis(dir);
    const tk = d.topics.length;
    const spread = tk > 1 ? 0.36 + tk * 0.012 : 0;
    d.topics.forEach((ti, k) => {
      const ang = (k / tk) * Math.PI * 2 + di;
      const tdir = normalize([
        dir[0] + (u[0] * Math.cos(ang) + v[0] * Math.sin(ang)) * spread,
        dir[1] + (u[1] * Math.cos(ang) + v[1] * Math.sin(ang)) * spread,
        dir[2] + (u[2] * Math.cos(ang) + v[2] * Math.sin(ang)) * spread,
      ]);
      const tIdx = nodes.length;
      nodes.push([tdir[0] * R_T, tdir[1] * R_T, tdir[2] * R_T]);
      edges.push([0, dIdx, 0, tIdx, 0.42]);
      labels.push({ key: 'onto-t-' + ti, kind: 'topic', pos: [tdir[0] * R_T, tdir[1] * R_T + 1.3, tdir[2] * R_T], html: `<span>${esc(topics[ti].name)}</span><em>${topics[ti].count}</em>`, click: { kind: 'topic', id: ti } });
      const list = topicMembers[ti];
      const n = list.length;
      const [tu, tv] = basis(tdir);
      const cap = 0.028 * Math.sqrt(n) + 0.02;
      list.forEach((i, j) => {
        const rr = cap * Math.sqrt((j + 0.5) / n);
        const th = GOLDEN * j;
        const shell = R_A + (hash01(i, 3) - 0.5) * 5 + rr * 18;
        const ad = normalize([
          tdir[0] + (tu[0] * Math.cos(th) + tv[0] * Math.sin(th)) * rr,
          tdir[1] + (tu[1] * Math.cos(th) + tv[1] * Math.sin(th)) * rr,
          tdir[2] + (tu[2] * Math.cos(th) + tv[2] * Math.sin(th)) * rr,
        ]);
        P[i * 3] = ad[0] * shell;
        P[i * 3 + 1] = ad[1] * shell;
        P[i * 3 + 2] = ad[2] * shell;
        edges.push([0, tIdx, 1, i, 0.12]);
      });
    });
  });
  return {
    id: 'ontology', positions: P, labels,
    struct: { nodes: new Float32Array(nodes.flat()), edges },
    camera: { position: [22, 42, 222], target: [0, 0, 0] },
    drift: 0.14, autoRotate: true,
  };
}

// ------------------------------------------------------------------ sources (atoms gather around their page)
let _pageCenters = null;
function pageCenters(kb) {
  if (_pageCenters) return _pageCenters;
  const P = kb.pages.length;
  const c = new Float32Array(P * 3);
  kb.pages.forEach((p, k) => {
    let x = 0, y = 0, z = 0;
    p.atoms.forEach((i) => { const a = kb.atoms[i].xyz; x += a[0]; y += a[1]; z += a[2]; });
    const n = p.atoms.length || 1;
    c[k * 3] = (x / n) * 1.35; c[k * 3 + 1] = (y / n) * 1.25; c[k * 3 + 2] = (z / n) * 1.35;
  });
  // relax overlaps so each source has room for its card and orbit
  const MIN = 8.5;
  for (let it = 0; it < 90; it++) {
    let moved = 0;
    for (let a = 0; a < P; a++) {
      for (let b = a + 1; b < P; b++) {
        const dx = c[b * 3] - c[a * 3], dy = c[b * 3 + 1] - c[a * 3 + 1], dz = c[b * 3 + 2] - c[a * 3 + 2];
        const d = Math.hypot(dx, dy, dz) || 0.01;
        if (d < MIN) {
          const push = (MIN - d) / 2 / d;
          c[a * 3] -= dx * push; c[a * 3 + 1] -= dy * push; c[a * 3 + 2] -= dz * push;
          c[b * 3] += dx * push; c[b * 3 + 1] += dy * push; c[b * 3 + 2] += dz * push;
          moved++;
        }
      }
    }
    if (!moved) break;
  }
  _pageCenters = c;
  return c;
}

export function sourcesLayout(kb) {
  const N = kb.N;
  const P = new Float32Array(N * 3);
  const C = pageCenters(kb);
  const labels = [];
  const edges = [];
  const nodes = [];
  kb.pages.forEach((p, k) => {
    const cx = C[k * 3], cy = C[k * 3 + 1], cz = C[k * 3 + 2];
    nodes.push([cx, cy, cz]);
    const n = p.atoms.length;
    const r = 1.1 * Math.cbrt(n) + 1.2;
    p.atoms.forEach((i, j) => {
      const q = fibSphere(n, j);
      P[i * 3] = cx + q[0] * r;
      P[i * 3 + 1] = cy + q[1] * r;
      P[i * 3 + 2] = cz + q[2] * r;
      edges.push([0, k, 1, i, 0.2]);
    });
    const kinds = { image: 0, pdf: 0, video: 0 };
    p.assets.forEach((s) => { kinds[s.kind]++; });
    labels.push({
      key: 'src-' + k, kind: 'card', pos: [cx, cy, cz], worldWidth: 4.6, weight: n,
      html: p.image
        ? `<img src="${esc(p.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add('noimg');this.remove()"/><b>${esc(p.title)}</b>`
        : `<b>${esc(p.title)}</b>`,
      cls: p.image ? '' : 'noimg',
      click: { kind: 'page', id: p.id },
    });
  });
  return {
    id: 'sources', positions: P, labels,
    struct: { nodes: new Float32Array(nodes.flat()), edges },
    camera: { position: [0, 12, 150], target: [0, 0, 0] },
    drift: 0.12, autoRotate: false,
  };
}

// ------------------------------------------------------------------ quadrant (semi-3D)
export function quadrantLayout(kb, presetId = 'gap', scoreBy = 'atom') {
  const preset = QUAD_PRESETS[presetId];
  const N = kb.N;
  const P = new Float32Array(N * 3);
  const nd = kb.ontology.domains.length;
  kb.atoms.forEach((a, i) => {
    const vx = metricOf(kb, i, preset.x, scoreBy);
    const vy = metricOf(kb, i, preset.y, scoreBy);
    let x = qx(vx), y = qy(vy);
    let z = (a.domain - (nd - 1) / 2) * 1.5;
    if (scoreBy === 'page') {
      const k = a.page.atoms.indexOf(i);
      const q = fibSphere(a.page.atoms.length, k);
      const r = 0.55 * Math.cbrt(a.page.atoms.length);
      x += q[0] * r; y += q[1] * r; z = (a.page.domainIdx - (nd - 1) / 2) * 1.5 + q[2] * r;
    } else {
      // soften exact ties (many atoms share 0% or 100%) into a band
      y += (hash01(i, 7) - 0.5) * 1.2;
      x += (hash01(i, 9) - 0.5) * 0.35;
      z += (hash01(i, 11) - 0.5) * 1.4;
    }
    P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
  });

  const { x0, x1, y0, y1 } = QUAD_PLANE;
  const tx = qx(preset.tx), ty = qy(preset.ty);
  const zb = -1.5;
  const seg = [];
  const L = (a, b, alpha) => seg.push([...a, ...b, alpha]);
  // threshold cross
  L([tx, y0 - 1, zb], [tx, y1 + 1, zb], 0.32);
  L([x0 - 1, ty, zb], [x1 + 1, ty, zb], 0.32);
  // baseline + left axis
  L([x0, y0 - 2.4, zb], [x1, y0 - 2.4, zb], 0.22);
  L([x0 - 2.4, y0, zb], [x0 - 2.4, y1, zb], 0.22);
  for (let v = 0; v <= 1.0001; v += 0.2) {
    L([qx(v), y0 - 2.4, zb], [qx(v), y0 - 3.4, zb], 0.3);
  }
  [0, 0.5, 1].forEach((v) => L([x0 - 2.4, qy(v), zb], [x0 - 3.4, qy(v), zb], 0.3));
  const panes = [
    { q: 'tl', x0, y0: ty, x1: tx, y1 },
    { q: 'tr', x0: tx, y0: ty, x1, y1 },
    { q: 'bl', x0, y0, x1: tx, y1: ty },
    { q: 'br', x0: tx, y0, x1, y1: ty },
  ].map((p) => ({ ...p, z: zb - 0.2, action: p.q === preset.action }));

  const cornerPos = {
    tl: [x0 + 2, y1 - 1.5, zb], tr: [x1 - 2, y1 - 1.5, zb],
    bl: [x0 + 2, y0 + 1.6, zb], br: [x1 - 2, y0 + 1.6, zb],
  };
  const labels = ['tl', 'tr', 'bl', 'br'].map((q) => ({
    key: `quad-${preset.id}-${q}`, kind: 'quad', pos: cornerPos[q],
    cls: `q-${q}${q === preset.action ? ' is-action' : ''}`,
    html: `<span>${esc(preset.plural[q])}</span>`, click: { kind: 'quadrant', id: q },
  }));
  for (let v = 0; v <= 1.0001; v += 0.2) {
    labels.push({ key: `qtx-${v.toFixed(1)}`, kind: 'tick', pos: [qx(v), y0 - 5.2, zb], html: `${Math.round(v * 100)}%` });
  }
  [0, 0.5, 1].forEach((v) => labels.push({ key: `qty-${v}`, kind: 'tick', cls: 'tick-y', pos: [x0 - 6.2, qy(v), zb], html: `${Math.round(v * 100)}%` }));
  labels.push({ key: `qax-l-${preset.id}`, kind: 'axis', pos: [x0 + 6, y0 - 8.4, zb], html: `<span>← ${esc(preset.xLabel[0])}</span>` });
  labels.push({ key: `qax-r-${preset.id}`, kind: 'axis', pos: [x1 - 6, y0 - 8.4, zb], html: `<span>${esc(preset.xLabel[1])} →</span>` });
  labels.push({ key: `qay-t-${preset.id}`, kind: 'axis', cls: 'axis-y', pos: [x0 - 9.5, y1 - 8, zb], html: `<span>${esc(preset.yLabel[1])} →</span>` });
  labels.push({ key: `qay-b-${preset.id}`, kind: 'axis', cls: 'axis-y', pos: [x0 - 9.5, y0 + 8, zb], html: `<span>← ${esc(preset.yLabel[0])}</span>` });

  return {
    id: 'quadrant', positions: P, labels, struct: null,
    quad: { segments: seg, panes },
    camera: { position: [34, 12, 112], target: [2, -3, -2] },
    drift: 0.035, autoRotate: false,
  };
}

export function buildLayout(kb, view, opts = {}) {
  switch (view) {
    case 'clusters': return clustersLayout(kb, opts.groupBy);
    case 'ontology': return ontologyLayout(kb);
    case 'sources': return sourcesLayout(kb);
    case 'quadrant': return quadrantLayout(kb, opts.quadPreset, opts.scoreBy);
    case 'constellation':
    default: return constellationLayout(kb);
  }
}
