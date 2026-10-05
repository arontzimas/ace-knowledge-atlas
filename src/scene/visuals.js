import { COLORS } from './engine.js';
import { QUAD_PRESETS, atomQuadrant } from './quad.js';

/**
 * Per-atom visual targets. States: 0 normal · 1 dimmed · 2 highlighted · 3 selected · 4 context (neighbour)
 */
export function computeVisuals(kb, { view, passes, highlight, selected, quadPreset, scoreBy, quadFocus }) {
  const N = kb.N;
  const color = new Float32Array(N * 3);
  const alpha = new Float32Array(N);
  const size = new Float32Array(N);
  const ring = new Float32Array(N);
  const state = new Uint8Array(N);
  const preset = QUAD_PRESETS[quadPreset] || QUAD_PRESETS.gap;
  const hasHi = highlight && highlight.size > 0;
  let maxScore = 0;
  if (hasHi) highlight.forEach((s) => { if (s > maxScore) maxScore = s; });
  const nbSet = new Set(selected >= 0 ? kb.atoms[selected].nb.slice(0, 7) : []);

  for (let i = 0; i < N; i++) {
    let c = COLORS.ink, a = 0.88, s = 1, r = 0, st = 0;
    if (view === 'quadrant') {
      const q = atomQuadrant(kb, i, preset, scoreBy);
      if (q === preset.action) { c = COLORS.red; a = 0.82; }
      else { c = COLORS.gray; a = 0.62; }
      if (quadFocus && q !== quadFocus) { a *= 0.22; st = 1; }
      else if (quadFocus) { s = 1.15; st = 2; }
    }
    if (!passes(i)) {
      c = COLORS.mute; a = 0.1; s = 0.65; st = 1;
    } else if (hasHi) {
      if (highlight.has(i)) {
        const sc = maxScore ? highlight.get(i) / maxScore : 1;
        c = COLORS.red; a = 1; s = 1.6 + 1.0 * sc; st = 2;
      } else {
        c = COLORS.mute; a = 0.2; s = 0.8; st = 1;
      }
    }
    if (selected >= 0) {
      if (i === selected) { c = COLORS.red; a = 1; s = 2.3; r = 1; st = 3; }
      else if (nbSet.has(i)) { if (st !== 2) { c = COLORS.ink; a = 1; s = Math.max(s, 1.3); } st = st === 2 ? 2 : 4; }
    }
    color[i * 3] = c.r; color[i * 3 + 1] = c.g; color[i * 3 + 2] = c.b;
    alpha[i] = a; size[i] = s; ring[i] = r; state[i] = st;
  }
  return { color, alpha, size, ring, state };
}
