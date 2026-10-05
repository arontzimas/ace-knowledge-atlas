export const METRICS = {
  cov: { label: 'Knowledge coverage', short: 'Coverage', sample: false },
  cit: { label: 'AI citation strength', short: 'Citation strength', sample: true },
  dem: { label: 'Prompt demand', short: 'Demand', sample: true },
  eng: { label: 'Human engagement', short: 'Engagement', sample: true },
};

export const QUAD_PRESETS = {
  gap: {
    id: 'gap',
    label: 'Knowledge gap analysis',
    blurb: 'Coverage of the knowledge base against how often AI engines cite it. Strong content that is not being cited is where optimization pays off.',
    x: 'cov', y: 'cit', tx: 0.6, ty: 0.5,
    names: { tl: 'High authority', tr: 'Top performer', bl: 'Knowledge gap', br: 'Optimization opportunity' },
    plural: { tl: 'High authority', tr: 'Top performers', bl: 'Knowledge gaps', br: 'Optimization opportunities' },
    action: 'br',
    xLabel: ['Weak coverage', 'Strong coverage'],
    yLabel: ['Low citation strength', 'High citation strength'],
  },
  demand: {
    id: 'demand',
    label: 'Demand vs coverage',
    blurb: 'Where audience demand outruns what the knowledge base covers. High-demand, low-coverage atoms point at content to write next.',
    x: 'cov', y: 'dem', tx: 0.6, ty: 0.55,
    names: { tl: 'Unmet demand', tr: 'Well served', bl: 'Low priority', br: 'Over-served' },
    plural: { tl: 'Unmet demand', tr: 'Well served', bl: 'Low priority', br: 'Over-served' },
    action: 'tl',
    xLabel: ['Weak coverage', 'Strong coverage'],
    yLabel: ['Low demand', 'High demand'],
  },
  audience: {
    id: 'audience',
    label: 'Human vs agent performance',
    blurb: 'How each atom performs with the dual audience: people who engage with it, and AI agents that cite it.',
    x: 'cit', y: 'eng', tx: 0.5, ty: 0.5,
    names: { tl: 'Human favorite', tr: 'Winning both', bl: 'Underperforming', br: 'Agent favorite' },
    plural: { tl: 'Human favorites', tr: 'Winning both audiences', bl: 'Underperforming', br: 'Agent favorites' },
    action: 'tl',
    xLabel: ['Rarely cited by AI', 'Often cited by AI'],
    yLabel: ['Low engagement', 'High engagement'],
  },
};

export function metricOf(kb, i, key, scoreBy) {
  const a = kb.atoms[i];
  return scoreBy === 'page' ? a.page.m[key] : a.m[key];
}

export function quadrantOf(x, y, preset) {
  const right = x >= preset.tx;
  const top = y >= preset.ty;
  return (top ? 't' : 'b') + (right ? 'r' : 'l');
}

export function atomQuadrant(kb, i, preset, scoreBy) {
  return quadrantOf(metricOf(kb, i, preset.x, scoreBy), metricOf(kb, i, preset.y, scoreBy), preset);
}

/** Plane geometry shared by layout + labels. */
export const QUAD_PLANE = { x0: -42, x1: 42, y0: -24, y1: 24 };
export const qx = (v) => QUAD_PLANE.x0 + (QUAD_PLANE.x1 - QUAD_PLANE.x0) * v;
export const qy = (v) => QUAD_PLANE.y0 + (QUAD_PLANE.y1 - QUAD_PLANE.y0) * v;
