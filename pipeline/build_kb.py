#!/usr/bin/env python3
"""Build the ACE knowledge base bundle (kb.json) from crawled page files.

Outputs public/data/kb.json consumed by the web app:
  meta, ontology (domains/topics), themes, tags, entities, pages, atoms, prompts, lsa (query projection)
Sample (modeled) metrics are seeded deterministically and flagged in meta.sampleMetrics.
"""
import json, glob, re, math, os, hashlib, base64, collections, random
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.decomposition import TruncatedSVD
from sklearn.cluster import KMeans
import umap

ROOT = os.path.dirname(os.path.abspath(__file__))  # the pipeline/ folder
OUT = os.path.join(os.path.dirname(ROOT), "public", "data", "kb.json")
os.makedirs(os.path.dirname(OUT), exist_ok=True)

# ---------------------------------------------------------------- ontology
DOMAINS = [
    ("Health Insurance Basics", "How coverage works, what it costs, and the vocabulary behind every plan."),
    ("Medicare", "Coverage for people 65+ and those with qualifying disabilities: Parts A-D, Medicare Advantage, Supplement and SNPs."),
    ("Medicaid", "Community Plan coverage for low-income households, children, pregnancy and dual-eligible members."),
    ("Individual & Family", "Coverage people buy on their own: ACA Marketplace, short-term plans and options after job loss."),
    ("Dental, Vision & Supplemental", "Standalone dental and vision, supplemental cash benefits, life and travel protection."),
    ("Employer Solutions", "Group benefits for employers and brokers: funding models, pharmacy, specialty and wellness programs."),
    ("Care & Member Experience", "Finding and using care: networks, virtual visits, digital tools, rewards and condition support."),
    ("Company & News", "Newsroom, innovation and AI, and community health commitments."),
]
TOPICS = {
    "Health Insurance Basics": ["How insurance works", "Plan types & networks", "Costs & cost-sharing", "HSA, HRA & FSA", "Enrollment & life events", "Claims, EOB & prior auth", "Prescription coverage", "Insurance glossary"],
    "Medicare": ["Medicare basics", "Medicare Advantage", "Part D prescription plans", "Medicare Supplement", "Special Needs Plans", "Medicare enrollment"],
    "Medicaid": ["Medicaid eligibility", "Medicaid renewal", "Community Plan benefits", "CHIP & children's coverage", "Dual eligible coverage"],
    "Individual & Family": ["ACA Marketplace", "Subsidies & tax credits", "Short-term coverage", "Plans through work", "Student & self-employed", "Coverage after job loss"],
    "Dental, Vision & Supplemental": ["Dental coverage", "Vision coverage", "Accident & critical illness", "Hospital indemnity", "Life insurance", "Travel insurance"],
    "Employer Solutions": ["Plan funding models", "Pharmacy benefits", "Specialty benefits", "Advocacy & member support", "Wellness programs", "Regulatory & compliance", "Cost management", "Broker resources"],
    "Care & Member Experience": ["Finding care & networks", "Virtual care", "Digital tools & app", "Rewards & incentives", "Behavioral health", "Women's & family health", "Chronic condition support"],
    "Company & News": ["Newsroom", "AI & innovation", "Health equity & community"],
}
TOPIC_DOMAIN = {t: d for d, ts in TOPICS.items() for t in ts}
DOMAIN_NAMES = [d for d, _ in DOMAINS]
TOPIC_LIST = [t for d in DOMAIN_NAMES for t in TOPICS[d]]
FORMATS = ["faq", "definition", "assertion", "comparison", "steps", "stat"]
PERSONAS = ["Medicare shopper", "Individual & family shopper", "Employer / HR leader", "Broker / consultant", "Current member", "Medicaid household", "Caregiver"]
INTENTS = ["Learn", "Compare", "Estimate cost", "Check eligibility", "Enroll", "Use benefits", "Get support", "Stay compliant"]
STAGES = ["Awareness", "Consideration", "Decision", "Member"]

# ---------------------------------------------------------------- tokenizer (mirrored in src/search/text.js)
STOP = set("""a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just let me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves may might must shall get gets got one two us use used using like can't don't it's i'm you're also etc via per within without may""".split())

def tokens(s):
    toks = [t for t in re.findall(r"[a-z0-9]+", s.lower()) if len(t) > 1 and t not in STOP]
    return toks

def analyzer(s):
    t = tokens(s)
    return t + [t[i] + "_" + t[i + 1] for i in range(len(t) - 1)]

def norm_tag(t):
    t = re.sub(r"\s+", " ", str(t).strip().lower())
    return t.strip(" .,")

def h01(*parts):
    """deterministic hash -> [0,1)"""
    s = "|".join(str(p) for p in parts)
    return int(hashlib.md5(s.encode()).hexdigest()[:12], 16) / float(16 ** 12)

# ---------------------------------------------------------------- load pages
files = sorted(glob.glob(os.path.join(ROOT, "raw", "pages", "*.json")))
pages, atoms = [], []
for f in files:
    d = json.load(open(f))
    url = d["url"].split("#")[0]
    path = re.sub(r"^https?://www\.uhc\.com", "", url) or "/"
    pid = len(pages)
    seen = set()
    assets = []
    for a in d.get("assets", []):
        src = a.get("src", "")
        if not src.startswith("http") or src in seen:
            continue
        seen.add(src)
        assets.append({"kind": a["kind"], "src": src, "alt": (a.get("alt") or "").strip()})
    page = {
        "id": pid, "url": url, "path": path,
        "title": re.sub(r"\s*\|\s*UnitedHealthcare\s*$", "", d["title"]).strip(),
        "domain": d["domain"] if d["domain"] in DOMAIN_NAMES else "Care & Member Experience",
        "type": d.get("page_type", "article"), "summary": d.get("summary", ""),
        "published": d.get("published"), "assets": assets, "atoms": [],
    }
    pages.append(page)
    for a in d["atoms"]:
        topic = a["topic"] if a["topic"] in TOPIC_DOMAIN else None
        if topic is None:
            # fall back to the first topic of the page domain
            topic = TOPICS[page["domain"]][0]
        atoms.append({
            "page": pid, "type": a["type"], "title": a["title"].strip(),
            "q": (a.get("question") or "").strip(), "text": a["text"].strip(),
            "topic": topic, "tags": sorted({norm_tag(t) for t in a.get("tags", []) if norm_tag(t)}),
            "ents": sorted({str(e).strip() for e in a.get("entities", []) if str(e).strip()}),
            "personas": [p for p in a.get("personas", []) if p in PERSONAS] or ["Individual & family shopper"],
            "intent": a["intent"], "stage": a["stage"],
            "qs": [q.strip() for q in a.get("questions", []) if q.strip()][:3],
        })

# de-duplicate exact duplicate atoms (same text)
seen_text = {}
uniq = []
for a in atoms:
    k = re.sub(r"\W+", " ", a["text"].lower()).strip()
    if k in seen_text:
        continue
    seen_text[k] = True
    uniq.append(a)
atoms = uniq
for i, a in enumerate(atoms):
    a["id"] = f"A-{i + 1:04d}"
    pages[a["page"]]["atoms"].append(i)
pages = [p for p in pages if p["atoms"]]
# re-index pages after filtering
remap = {p["id"]: i for i, p in enumerate(pages)}
for i, p in enumerate(pages):
    p["id"] = i
for a in atoms:
    a["page"] = remap[a["page"]]
print(f"pages {len(pages)}  atoms {len(atoms)}")

# ---------------------------------------------------------------- vectors
def atom_doc(a):
    p = pages[a["page"]]
    return " ".join([a["title"], a["title"], a["q"], a["text"], " ".join(a["tags"]) * 1, " ".join(a["ents"]), " ".join(a["qs"]), a["topic"], p["title"]])

docs = [atom_doc(a) for a in atoms]
vec = TfidfVectorizer(analyzer=analyzer, min_df=2, max_df=0.5, sublinear_tf=True, max_features=6000)
X = vec.fit_transform(docs)
vocab = vec.get_feature_names_out()
idf = vec.idf_
print("vocab", len(vocab))

svd_hi = TruncatedSVD(n_components=128, random_state=7).fit(X)
Z_hi = svd_hi.transform(X)
Z_hi /= np.linalg.norm(Z_hi, axis=1, keepdims=True) + 1e-9

DIM = 64
svd = TruncatedSVD(n_components=DIM, random_state=7).fit(X)
Z = svd.transform(X)
Z /= np.linalg.norm(Z, axis=1, keepdims=True) + 1e-9

# neighbours on the richer space
S = Z_hi @ Z_hi.T
np.fill_diagonal(S, -1)
NB = np.argsort(-S, axis=1)[:, :8]

# ---------------------------------------------------------------- UMAP 3D constellation
reducer = umap.UMAP(n_components=3, n_neighbors=30, min_dist=0.9, spread=2.4, metric="cosine", random_state=42)
U = reducer.fit_transform(Z_hi)
U -= U.mean(axis=0)
r = np.percentile(np.linalg.norm(U, axis=1), 95)
U = U / r * 50.0
# relax clumps so every atom has breathing room while keeping the semantic structure
from scipy.spatial import cKDTree
DMIN = 1.7
for _ in range(60):
    tree = cKDTree(U)
    pairs = tree.query_pairs(DMIN, output_type="ndarray")
    if not len(pairs):
        break
    a, b = pairs[:, 0], pairs[:, 1]
    d = U[b] - U[a]
    dist = np.linalg.norm(d, axis=1, keepdims=True) + 1e-6
    push = (DMIN - dist) / dist * 0.5 * d * 0.6
    np.add.at(U, a, -push)
    np.add.at(U, b, push)

# ---------------------------------------------------------------- semantic themes (emergent clusters)
K = 28
km = KMeans(n_clusters=K, n_init=10, random_state=3).fit(Z_hi)
theme_of = km.labels_
themes = []
for k in range(K):
    idx = np.where(theme_of == k)[0]
    tc = collections.Counter(t for i in idx for t in atoms[i]["tags"])
    top = [t for t, _ in tc.most_common(6)]
    # label: two most common distinct tags
    label = []
    for t in top:
        if all(t not in l and l not in t for l in label):
            label.append(t)
        if len(label) == 2:
            break
    topic_c = collections.Counter(atoms[i]["topic"] for i in idx).most_common(1)[0][0]
    themes.append({"id": k, "label": " · ".join(label) if label else topic_c, "topic": topic_c, "count": int(len(idx)), "tags": top})
# order themes by size for stable display
order = sorted(range(K), key=lambda k: -themes[k]["count"])
theme_remap = {old: new for new, old in enumerate(order)}
themes = [dict(themes[o], id=theme_remap[o]) for o in order]

# ---------------------------------------------------------------- importance (point size)
indeg = collections.Counter(int(j) for row in NB for j in row[:5])
TYPE_W = {"definition": 0.18, "faq": 0.14, "comparison": 0.16, "steps": 0.12, "stat": 0.1, "assertion": 0.0}
w_raw = np.array([indeg.get(i, 0) / 5.0 + TYPE_W[a["type"]] + min(len(a["text"].split()), 120) / 400 for i, a in enumerate(atoms)])
w = (w_raw - w_raw.min()) / (w_raw.max() - w_raw.min())

# ---------------------------------------------------------------- metrics
# Coverage (computed): how well the atom answers the prompts it is meant to surface for,
# blended with specificity and neighbourhood support.
def qvec(texts):
    Q = vec.transform(texts)
    q = svd_hi.transform(Q)
    return q / (np.linalg.norm(q, axis=1, keepdims=True) + 1e-9)

all_q = [q for a in atoms for q in (a["qs"] or [a["q"] or a["title"]])]
owner = [i for i, a in enumerate(atoms) for _ in (a["qs"] or [a["q"] or a["title"]])]
QV = qvec(all_q)
q_fit = collections.defaultdict(list)
for qi, ai in enumerate(owner):
    q_fit[ai].append(float(QV[qi] @ Z_hi[ai]))
fit = np.array([np.mean(q_fit[i]) for i in range(len(atoms))])
spec = np.array([min(1.0, (len(re.findall(r"\d", a["text"])) > 0) * 0.4 + len(a["ents"]) * 0.15 + len(a["text"].split()) / 260) for a in atoms])
support = np.sort(S, axis=1)[:, -5:].mean(axis=1)
raw_cov = 0.55 * fit + 0.2 * spec + 0.25 * support
ranks = raw_cov.argsort().argsort() / (len(atoms) - 1)
# map rank to a soft normal centred near 60%
from statistics import NormalDist
nd = NormalDist(0.6, 0.15)
cov = np.array([min(0.99, max(0.16, nd.inv_cdf(min(0.995, max(0.005, r))))) for r in ranks])

def sample_cit(i, a, c):
    """modeled AI citation strength 0..1 (sample data)"""
    bonus = {"faq": 0.5, "definition": 0.45, "comparison": 0.3, "stat": 0.25, "steps": 0.1, "assertion": -0.2}[a["type"]]
    z = -1.15 + (c - 0.6) * 5.2 + bonus + (h01(a["id"], "z") - 0.5) * 1.6
    p_high = 1 / (1 + math.exp(-z))
    u = h01(a["id"], "u")
    if u < p_high:
        v = 1 - (h01(a["id"], "b") ** 2.2) * 0.42  # clusters near the top
        if h01(a["id"], "full") < 0.35:
            v = 1.0
    else:
        v = (h01(a["id"], "l") ** 3.2) * 0.38      # clusters near zero
        if h01(a["id"], "zero") < 0.55:
            v = 0.0
    return round(float(v), 3)

topic_size = collections.Counter(a["topic"] for a in atoms)
max_ts = max(topic_size.values())
metrics = []
for i, a in enumerate(atoms):
    c = float(cov[i])
    cit = sample_cit(i, a, c)
    demand = 0.25 + 0.45 * (topic_size[a["topic"]] / max_ts) + 0.3 * h01(a["id"], "dem")
    if a["stage"] in ("Decision", "Consideration"):
        demand += 0.08
    demand = min(0.99, max(0.05, demand + (h01(a["id"], "dj") - 0.5) * 0.35))
    eng = min(0.99, max(0.03, 0.18 + 0.45 * w[i] + 0.4 * h01(a["id"], "eng") - (0.1 if a["type"] == "assertion" else 0)))
    metrics.append({"cov": round(c, 3), "cit": cit, "dem": round(demand, 3), "eng": round(eng, 3)})

# citation counts per atom (sample) for tables
for i, a in enumerate(atoms):
    m = metrics[i]
    m["cites"] = int(round(m["cit"] * (8 + 40 * h01(a["id"], "cn")))) if m["cit"] > 0.05 else 0

# page level metrics
for p in pages:
    idx = p["atoms"]
    cs = sorted((metrics[i]["cov"] for i in idx), reverse=True)
    p["m"] = {
        "cov": round(float(np.mean(cs[:3])) * 0.82, 3),
        "cit": round(float(np.mean([metrics[i]["cit"] for i in idx])), 3),
        "dem": round(float(np.mean([metrics[i]["dem"] for i in idx])), 3),
        "eng": round(float(np.mean([metrics[i]["eng"] for i in idx])), 3),
    }

# ---------------------------------------------------------------- prompts
# Two sources: questions derived from atoms (what the content is built to answer) and a bank of
# real-world demand prompts (what people actually ask). Coverage is computed honestly from
# retrieval similarity, so demand prompts the site doesn't answer surface as knowledge gaps.
cand = []
for i, a in enumerate(atoms):
    for q in a["qs"]:
        cand.append((q, i))
rng = random.Random(11)
rng.shuffle(cand)
CQ = qvec([c[0] for c in cand])
chosen, chosen_vecs = [], []
per_topic = collections.Counter()
N_DERIVED = 330
cap = {t: max(3, int(round(topic_size[t] / len(atoms) * N_DERIVED))) for t in TOPIC_LIST}
for (q, ai), v in zip(cand, CQ):
    t = atoms[ai]["topic"]
    if per_topic[t] >= cap[t]:
        continue
    if chosen_vecs and max(float(v @ u) for u in chosen_vecs[-400:]) > 0.72:
        continue
    chosen.append((q, ai, v, "derived"))
    chosen_vecs.append(v)
    per_topic[t] += 1
    if len(chosen) >= N_DERIVED:
        break
DEMAND = [l.strip() for l in open(os.path.join(ROOT, "demand_prompts.txt")) if l.strip()]
DV = qvec(DEMAND)
for q, v in zip(DEMAND, DV):
    chosen.append((q, None, v, "demand"))

page_vec = np.array([Z_hi[p["atoms"]].mean(axis=0) for p in pages])
page_vec /= np.linalg.norm(page_vec, axis=1, keepdims=True) + 1e-9
best_all = np.array([float(np.max(Z_hi @ v)) for _, _, v, _ in chosen])
s_lo, s_hi = np.percentile(best_all, 4), np.percentile(best_all, 97)
print("prompt best-sim p4/p50/p97", round(s_lo, 3), round(float(np.median(best_all)), 3), round(s_hi, 3))

def calib(s, lo=0.14, hi=0.96):
    x = (s - s_lo) / (s_hi - s_lo)
    return float(min(0.99, max(0.06, lo + (hi - lo) * max(0.0, x) ** 0.85)))

prompts = []
for (q, ai, v, src), best in zip(chosen, best_all):
    sims = Z_hi @ v
    top = np.argsort(-sims)[:6]
    psims = page_vec @ v
    bp = int(np.argmax(psims))
    cov_a = calib(best)
    cov_p = min(cov_a - 0.04, calib(float(psims[bp]) + 0.05) * 0.86)
    lead = atoms[int(top[0])]
    cit = float(np.mean([metrics[int(j)]["cit"] for j in top[:3]]))
    cit = cit * (0.55 + 0.6 * cov_a) + (h01(q, "ct") - 0.5) * 0.22
    cit = min(1.0, max(0.0, cit))
    if cit < 0.14:
        cit = 0.0 if h01(q, "z") < 0.75 else round(cit, 3)
    cites = int(round(cit * (10 + 40 * h01(q, "n")))) if cit > 0.1 else 0
    base = atoms[ai] if ai is not None else lead
    prompts.append({
        "q": q[0].lower() + q[1:],
        "src": src,
        "atoms": [int(j) for j in top],
        "cov": round(cov_a, 3), "pcov": round(max(0.04, cov_p), 3), "page": bp,
        "cit": round(cit, 3), "cites": cites,
        "topic": base["topic"], "persona": base["personas"][0],
    })
prompts.sort(key=lambda p: p["q"])
print("prompts", len(prompts))

# ---------------------------------------------------------------- tags & entities
tag_c = collections.Counter(t for a in atoms for t in a["tags"])
tag_topics = collections.defaultdict(collections.Counter)
for a in atoms:
    for t in a["tags"]:
        tag_topics[t][a["topic"]] += 1
tags = [{"t": t, "n": n, "topic": tag_topics[t].most_common(1)[0][0]} for t, n in tag_c.most_common() if n >= 2]
ent_c = collections.Counter(e for a in atoms for e in a["ents"])
entities = [{"e": e, "n": n} for e, n in ent_c.most_common() if n >= 2]

# ---------------------------------------------------------------- ontology output
topic_tags = collections.defaultdict(collections.Counter)
for a in atoms:
    for t in a["tags"]:
        topic_tags[a["topic"]][t] += 1
ontology = {
    "domains": [{"id": i, "name": d, "desc": desc, "topics": [TOPIC_LIST.index(t) for t in TOPICS[d]]} for i, (d, desc) in enumerate(DOMAINS)],
    "topics": [{"id": i, "name": t, "domain": DOMAIN_NAMES.index(TOPIC_DOMAIN[t]), "count": topic_size.get(t, 0), "tags": [x for x, _ in topic_tags[t].most_common(8)]} for i, t in enumerate(TOPIC_LIST)],
}

# ---------------------------------------------------------------- LSA projection for in-browser semantic search
def q8(M):
    M = np.asarray(M, dtype=np.float32)
    scale = float(np.abs(M).max()) / 127.0
    return base64.b64encode(np.clip(np.round(M / scale), -127, 127).astype(np.int8).tobytes()).decode(), scale

termvec_b64, termscale = q8(svd.components_.T)       # [V, DIM]
atomvec_b64, atomscale = q8(Z)                          # [N, DIM]
lsa = {"dim": DIM, "terms": list(vocab), "idf": [round(float(x), 3) for x in idf],
       "termVecs": termvec_b64, "termScale": termscale, "atomVecs": atomvec_b64, "atomScale": atomscale}

# ---------------------------------------------------------------- atoms output
out_atoms = []
for i, a in enumerate(atoms):
    out_atoms.append({
        "id": a["id"], "p": a["page"], "type": a["type"], "title": a["title"], "q": a["q"], "text": a["text"],
        "topic": TOPIC_LIST.index(a["topic"]), "theme": theme_remap[int(theme_of[i])],
        "tags": a["tags"], "ents": a["ents"], "personas": a["personas"], "intent": a["intent"], "stage": a["stage"],
        "qs": a["qs"], "xyz": [round(float(x), 2) for x in U[i]], "nb": [int(j) for j in NB[i]],
        "w": round(float(w[i]), 3), "m": metrics[i],
    })

meta = {
    "name": "UnitedHealthcare", "source": "www.uhc.com", "crawled": "2026-10-05",
    "pages": len(pages), "atoms": len(atoms), "assets": sum(len(p["assets"]) for p in pages),
    "formats": FORMATS, "personas": PERSONAS, "intents": INTENTS, "stages": STAGES,
    "sampleMetrics": ["cit", "dem", "eng", "cites"],
    "computedMetrics": ["cov"],
    "schema": "ace-atom/0.1",
}
kb = {"meta": meta, "ontology": ontology, "themes": themes, "tags": tags, "entities": entities,
      "pages": pages, "atoms": out_atoms, "prompts": prompts, "lsa": lsa}
with open(OUT, "w") as f:
    json.dump(kb, f, separators=(",", ":"), ensure_ascii=False)
print("wrote", OUT, round(os.path.getsize(OUT) / 1e6, 2), "MB")
q = collections.Counter(("R" if m["cov"] >= 0.6 else "L") + ("H" if m["cit"] >= 0.5 else "L") for m in metrics)
print("atom quadrants", q)
pq = collections.Counter(("R" if p["cov"] >= 0.6 else "L") + ("H" if p["cit"] >= 0.5 else "L") for p in prompts)
print("prompt quadrants", pq)
print("themes", [t["label"] for t in themes])
