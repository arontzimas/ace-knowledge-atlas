# ACE Knowledge Atlas · UnitedHealthcare demo

A 3D, prompt-first view of a brand's knowledge base. Every point is an **atom**, a self-contained unit of content that ACE composes from. This demo is built on 1,623 atoms from 186 public pages of uhc.com.

- **Ask** a question in natural language. The atoms it draws on light up and link to the answer panel, and the answer is composed with citations back to each atom.
- **Search** by topic, theme, tag, entity, page or keyword. Matches light up live as you type.
- **Explore** five layouts, with fluid transitions between them:
  - **Constellation**: atoms placed by meaning (UMAP of LSA embeddings).
  - **Clusters**: group by topic, domain, semantic theme, format, persona, stage or intent.
  - **Ontology**: a radial tree of domain → topic → atom.
  - **Sources**: atoms gathered around the pages, images, PDFs and videos they came from.
  - **Quadrant**: a semi-3D performance chart. Presets: knowledge gap, demand vs coverage, and human vs agent.
- **Click any atom** to open it: full text, ontology, semantic tags, entities, source page and assets, metrics, related atoms, and the prompts it answers.

**Live:** https://ace-knowledge-atlas.vercel.app (Vercel project `ace-knowledge-atlas`, Knotch Product Team)

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
```

`/api/ask` only runs on Vercel (or with `vercel dev`). Without it, the app composes answers in the browser from the retrieved atoms, so the full experience still works offline.

## Deploy (Vercel)

The repo is a standard Vite project with one Edge Function at `api/ask.js`. Import the repo into Vercel and keep the defaults. `vercel.json` sets the framework, output directory and cache headers.

Optional environment variables enable model-composed answers:

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Preferred. Answers are composed with Gemini (ACE runs on Gemini on Vertex AI). |
| `GEMINI_MODEL` | Defaults to `gemini-2.5-flash`. |
| `ANTHROPIC_API_KEY` | Alternative composer. |
| `ANTHROPIC_MODEL` | Defaults to `claude-haiku-4-5-20251001`. |

`/api/ask` only answers same-origin requests from the app itself, and caps question and atom sizes. With no key set, it returns `501` and the browser falls back to its extractive composer. Answers stay grounded either way: the model only sees the retrieved atoms and must cite them. The Data source panel shows which composer is live.

Deploys so far have used the CLI (`vercel deploy --prod --scope knotch`). To redeploy automatically on every push, connect the repo under Project → Settings → Git. That requires a GitHub login connection on the Vercel account.

## How it fits together

```
pipeline/raw/pages/*.json   crawled + atomized uhc.com pages (one file per page)
pipeline/build_kb.py        ontology, tags, LSA vectors, UMAP 3D layout, themes, metrics, prompts
public/data/kb.json         the bundle the app loads (ACE atom schema, ace-atom/0.1)
src/search/                 tokenizer, BM25 + LSA hybrid retrieval, local answer composer
src/scene/                  Three.js engine (points, lines, labels, camera), layouts, quadrant presets
src/ui/                     side nav, panels, prompt bar, answer + atom drawers
api/ask.js                  streaming answer composer (Gemini or Claude)
```

Retrieval runs in the browser. It combines BM25 with a 64-dimension LSA projection shipped in `kb.json`, applies MMR for diversity, and estimates coverage. When coverage is low the answer is flagged as a knowledge gap.

## Rebuilding the knowledge base

```bash
pip install -r pipeline/requirements.txt
python3 pipeline/build_kb.py          # writes public/data/kb.json (deterministic)
python3 pipeline/validate_page.py pipeline/raw/pages/*.json
```

To add pages, follow `pipeline/CRAWL_BRIEF.md`: one JSON file per page, atoms in six formats (FAQ, definition, assertion, comparison, step-by-step, stat), tagged against the controlled ontology. Then rebuild.

## Connecting the ACE Knowledge Base (later)

The app reads one object, `kb.json`. To go live, serve the same shape from ACE:

- `atoms[]`: `id`, `type`, `title`, `q`, `text`, `topic`, `theme`, `tags`, `ents`, `personas`, `intent`, `stage`, `qs`, `p` (page index), `xyz`, `nb` (neighbours), `w` (weight), and `m` (metrics: `cov`, `cit`, `dem`, `eng`, `cites`)
- `pages[]`: `url`, `path`, `title`, `domain`, `type`, `summary`, `assets[]`, `atoms[]`
- `ontology`, `themes`, `tags`, `entities`, `prompts`, `lsa`

Swap the URL in `src/search/kb.js` (`loadKB`) for an ACE endpoint. For live citation data, replace the modeled `m.cit`, `m.dem` and `m.eng` values.

## Data notes

- Content comes from public uhc.com pages, crawled and atomized on 2026-10-05. FAQ answers inside collapsed accordions were not captured, and no atom text was invented.
- **Coverage** is computed from the atoms. **Citation strength, demand and engagement are modeled sample data**, and the UI labels them that way.
- The prompt set has two parts: questions derived from the atoms, and 80 real-world demand prompts. The demand prompts are what make knowledge gaps show up honestly.

## Adding to the side nav

Nav items are defined in `NAV` in `src/ui/Chrome.jsx`. Each item opens a panel registered in `SidePanel` in `src/ui/Panels.jsx`. To add a section, add a panel component and a `NAV` entry, and optionally map it to a 3D view in `openPanel` in `src/store.js`.
