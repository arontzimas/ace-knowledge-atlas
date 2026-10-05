# UHC Knowledge Base crawl + atomization brief

You are building part of a demo knowledge base of "atoms" sourced from the public website https://www.uhc.com (UnitedHealthcare). An atom is the smallest self-contained unit of content: one specific claim, definition, FAQ answer, comparison, process, or stat — readable on its own, traceable to its source page.

## How to fetch
- Use the WebFetch tool (the shell cannot reach uhc.com). Use a prompt like:
  "Return the complete main content of this page as verbatim markdown: every heading, paragraph, list item, FAQ question and answer, and table, in order, using the page's own wording. Do not summarize or paraphrase. After the content, list every content image as `IMAGE: <absolute src url> | <alt text>`, every video as `VIDEO: <url or thumbnail url> | <title>`, every PDF link as `PDF: <absolute url> | <link text>`, and every in-content link to another uhc.com page as `LINK: <absolute url>`."
- If a response looks paraphrased or thin, refetch once with a more specific prompt. If a page 404s, redirects off uhc.com, is a login/form/search page, or is mostly empty, skip it and pick another page from the same section.
- Ignore site chrome (header, footer, cookie banners, "sign in" prompts, legal boilerplate repeated on every page).

## What to write
One JSON file per page at `pipeline/raw/pages/<slug>.json`, where slug is the URL path with `/` replaced by `__` (e.g. `medicare__medicare-advantage-plans.json`). Schema:

```json
{
  "url": "https://www.uhc.com/...",
  "title": "Page title as shown on the page (no ' | UnitedHealthcare' suffix)",
  "domain": "one of the DOMAINS below",
  "page_type": "hub | article | product | faq | glossary | news | case-study | guide",
  "summary": "One sentence describing what the page covers.",
  "published": "YYYY-MM-DD if the page shows a date, else null",
  "assets": [
    {"kind": "image", "src": "https://www.uhc.com/content/dam/...jpg", "alt": "alt text or short description"},
    {"kind": "video", "src": "https://...", "alt": "video title"},
    {"kind": "pdf", "src": "https://...pdf", "alt": "document title"}
  ],
  "atoms": [
    {
      "type": "faq | definition | assertion | comparison | steps | stat",
      "title": "Short headline, max 9 words",
      "question": "For faq atoms the question as asked; otherwise the most natural question this atom answers",
      "text": "30-130 words. Self-contained. Stays close to the page's own wording.",
      "topic": "one TOPIC from the list below",
      "tags": ["3-6 lowercase semantic tags, e.g. 'deductible', 'out-of-network', 'part d'"],
      "entities": ["named things mentioned: plan names, programs, laws, products, e.g. 'Medicare Advantage', 'ACA', 'HSA', 'Surest'"],
      "personas": ["1-2 from PERSONAS"],
      "intent": "one INTENT",
      "stage": "one STAGE",
      "questions": ["2-3 natural-language prompts a person might type that this atom answers"]
    }
  ]
}
```

Aim for 8-12 atoms per page (min 4, max 16). Richer pages get more. Cover the page's substance; don't create near-duplicate atoms. Asset lists: only real content images (skip logos, icons, spacer gifs, social icons); 0-4 images per page is typical. Only include URLs that actually appeared in the fetched content — never construct or guess a URL.

## Accuracy rules (important)
- Atoms only restate what the page says. Never invent numbers, prices, dates, plan names, eligibility rules, or claims. If the page gives a number, keep it exactly.
- Each atom must make sense without the page: name the subject explicitly ("A Medicare Advantage plan..." not "This plan...").
- Neutral, plain voice. No marketing superlatives that aren't on the page. No emoji.
- `type` guide: faq = question + direct answer; definition = a term and what it means; assertion = one standalone factual statement; comparison = contrast between two+ options on named dimensions; steps = a sequenced process ("1) ... 2) ..."); stat = a number-led fact.

## Controlled vocabularies (use exactly)
DOMAINS: Health Insurance Basics | Medicare | Medicaid | Individual & Family | Dental, Vision & Supplemental | Employer Solutions | Care & Member Experience | Company & News

TOPICS (pick the best fit; topic should normally sit under the page's domain, but an atom may use a topic from another domain if that is clearly a better fit):
- Health Insurance Basics: How insurance works | Plan types & networks | Costs & cost-sharing | HSA, HRA & FSA | Enrollment & life events | Claims, EOB & prior auth | Prescription coverage | Insurance glossary
- Medicare: Medicare basics | Medicare Advantage | Part D prescription plans | Medicare Supplement | Special Needs Plans | Medicare enrollment
- Medicaid: Medicaid eligibility | Medicaid renewal | Community Plan benefits | CHIP & children's coverage | Dual eligible coverage
- Individual & Family: ACA Marketplace | Subsidies & tax credits | Short-term coverage | Plans through work | Student & self-employed | Coverage after job loss
- Dental, Vision & Supplemental: Dental coverage | Vision coverage | Accident & critical illness | Hospital indemnity | Life insurance | Travel insurance
- Employer Solutions: Plan funding models | Pharmacy benefits | Specialty benefits | Advocacy & member support | Wellness programs | Regulatory & compliance | Cost management | Broker resources
- Care & Member Experience: Finding care & networks | Virtual care | Digital tools & app | Rewards & incentives | Behavioral health | Women's & family health | Chronic condition support
- Company & News: Newsroom | AI & innovation | Health equity & community

PERSONAS: Medicare shopper | Individual & family shopper | Employer / HR leader | Broker / consultant | Current member | Medicaid household | Caregiver
INTENTS: Learn | Compare | Estimate cost | Check eligibility | Enroll | Use benefits | Get support | Stay compliant
STAGES: Awareness | Consideration | Decision | Member

## Validate
After writing each file run: `python3 pipeline/validate_page.py <file>` and fix any FAIL. Write files with the Write tool (or python json.dump) so JSON is valid — be careful with quotes inside strings.

## Report back
When done, reply with only: number of pages written, total atoms, total assets, and any pages you skipped (one line each). Do not paste file contents.
