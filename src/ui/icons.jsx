const S = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props} />
);

export const I = {
  atlas: (p) => (
    <S {...p}><circle cx="12" cy="12" r="2.2" /><ellipse cx="12" cy="12" rx="9.5" ry="4" /><ellipse cx="12" cy="12" rx="9.5" ry="4" transform="rotate(60 12 12)" /><ellipse cx="12" cy="12" rx="9.5" ry="4" transform="rotate(120 12 12)" /></S>
  ),
  tree: (p) => (
    <S {...p}><circle cx="12" cy="4.5" r="2" /><circle cx="5" cy="19.5" r="2" /><circle cx="12" cy="19.5" r="2" /><circle cx="19" cy="19.5" r="2" /><path d="M12 6.5v4m0 0H5.8a.8.8 0 0 0-.8.8v6.2M12 10.5h6.2a.8.8 0 0 1 .8.8v6.2M12 10.5v7" /></S>
  ),
  tag: (p) => (
    <S {...p}><path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7a1 1 0 0 1 .7.3l7.6 7.6a1 1 0 0 1 0 1.4l-7.7 7.7a1 1 0 0 1-1.4 0l-7.6-7.6a1 1 0 0 1-.3-.7Z" /><circle cx="8" cy="8" r="1.4" /></S>
  ),
  layers: (p) => (
    <S {...p}><path d="m12 3.5 9 4.8-9 4.8-9-4.8 9-4.8Z" /><path d="m3 12.2 9 4.8 9-4.8" /><path d="m3 16.1 9 4.8 9-4.8" /></S>
  ),
  quad: (p) => (
    <S {...p}><path d="M4 4v16h16" /><path d="M12 4v12M4 12h16" strokeDasharray="0" opacity=".45" /><circle cx="16.5" cy="7.5" r="1.3" fill="currentColor" stroke="none" /><circle cx="8" cy="15.5" r="1.3" fill="currentColor" stroke="none" /><circle cx="16" cy="16" r="1.3" fill="currentColor" stroke="none" /></S>
  ),
  db: (p) => (
    <S {...p}><ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" /><path d="M4.5 5.5v6.5c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V5.5" /><path d="M4.5 12v6.5c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V12" /></S>
  ),
  search: (p) => (
    <S {...p}><circle cx="10.8" cy="10.8" r="6.3" /><path d="m20 20-4.5-4.5" /></S>
  ),
  send: (p) => (
    <S {...p} strokeWidth="1.9"><path d="M12 19V5m0 0-6 6m6-6 6 6" /></S>
  ),
  close: (p) => (
    <S {...p}><path d="M6 6l12 12M18 6 6 18" /></S>
  ),
  chevDown: (p) => (
    <S {...p}><path d="m6.5 9.5 5.5 5.5 5.5-5.5" /></S>
  ),
  chevRight: (p) => (
    <S {...p}><path d="m9.5 6.5 5.5 5.5-5.5 5.5" /></S>
  ),
  back: (p) => (
    <S {...p}><path d="M14.5 6.5 9 12l5.5 5.5" /></S>
  ),
  spark: (p) => (
    <S {...p}><path d="M12 3.5c.5 4.3 2.7 6.5 7 7-4.3.5-6.5 2.7-7 7-.5-4.3-2.7-6.5-7-7 4.3-.5 6.5-2.7 7-7Z" /></S>
  ),
  ext: (p) => (
    <S {...p}><path d="M14 4.5h5.5V10M19.5 4.5 11 13" /><path d="M18 14v4.5a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1H10" /></S>
  ),
  image: (p) => (
    <S {...p}><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m4 17.5 5-4.5 4 3.5 3-2.5 4.5 3.5" /></S>
  ),
  pdf: (p) => (
    <S {...p}><path d="M6.5 3.5h7.5l4.5 4.5v12a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-15.5a1 1 0 0 1 1-1Z" /><path d="M13.5 3.5V8.5h5" /><path d="M8.5 13h7M8.5 16.5h5" /></S>
  ),
  video: (p) => (
    <S {...p}><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" /><path d="m10.5 9.5 4.5 2.5-4.5 2.5v-5Z" fill="currentColor" /></S>
  ),
  pause: (p) => (
    <S {...p}><rect x="7" y="5.5" width="3" height="13" rx="1" /><rect x="14" y="5.5" width="3" height="13" rx="1" /></S>
  ),
  play: (p) => (
    <S {...p}><path d="M8 5.5v13l10.5-6.5L8 5.5Z" /></S>
  ),
  target: (p) => (
    <S {...p}><circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="2.5" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" /></S>
  ),
  sidebar: (p) => (
    <S {...p}><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="M9.5 4.5v15" /></S>
  ),
  question: (p) => (
    <S {...p}><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6" /><circle cx="12" cy="16.8" r=".6" fill="currentColor" /></S>
  ),
  info: (p) => (
    <S {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5" /><circle cx="12" cy="7.8" r=".7" fill="currentColor" /></S>
  ),
  copy: (p) => (
    <S {...p}><rect x="8.5" y="8.5" width="11" height="11" rx="2" /><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" /></S>
  ),
  check: (p) => (
    <S {...p}><path d="m5.5 12.5 4 4 9-9" /></S>
  ),
  atom: (p) => (
    <S {...p}><circle cx="12" cy="12" r="1.8" fill="currentColor" /><circle cx="12" cy="12" r="8.5" opacity=".35" /><circle cx="18" cy="7.5" r="1.2" fill="currentColor" stroke="none" /><circle cx="6.5" cy="16" r="1.2" fill="currentColor" stroke="none" /></S>
  ),
  doc: (p) => (
    <S {...p}><path d="M6.5 3.5h11a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z" /><path d="M8.5 8h7M8.5 11.5h7M8.5 15h4" /></S>
  ),
  download: (p) => (
    <S {...p}><path d="M12 4.5v11m0 0-4.5-4.5M12 15.5l4.5-4.5M5 19.5h14" /></S>
  ),
  plug: (p) => (
    <S {...p}><path d="M9 3.5v4M15 3.5v4M7 7.5h10v3a5 5 0 0 1-10 0v-3ZM12 15.5v5" /></S>
  ),
};

export function BrandMark(props) {
  return (
    <svg viewBox="0 0 32 32" {...props} aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="#18181b" />
      <circle cx="16" cy="16" r="9.5" fill="none" stroke="rgba(255,255,255,.28)" strokeWidth="1" />
      <circle cx="16" cy="16" r="3.4" fill="#e5385a" />
      <circle cx="24.6" cy="12" r="1.6" fill="#fff" />
      <circle cx="9.2" cy="21.6" r="1.3" fill="#fff" opacity=".8" />
      <circle cx="11" cy="9.4" r="1" fill="#fff" opacity=".6" />
    </svg>
  );
}

export const KIND_ICON = {
  topic: I.tree, domain: I.tree, theme: I.atlas, tag: I.tag, entity: I.tag, page: I.doc, atom: I.atom, group: I.atlas,
};
