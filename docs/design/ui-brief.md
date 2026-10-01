# The Walshe Content Hub: UI Design Brief (v2.0.0 overhaul)

Governs AC19-AC23 in `/REQUIREMENTS.md`. Design-only: no functional or data-wiring change.
Accessed 2026-10-01.

## 1. Provenance: what came from where

| Part of the brief | Origin |
| --- | --- |
| Palette (teal / mint / warm grey / neutral grey / green), type family (Founders Grotesk + Lato), taglines, tone, nav vocabulary, stats-band pattern | **USER REFERENCE**: extracted from the live walshegroup.com markup/CSS (section 3) |
| Product framing (verified hub, a-la-carte assembly, two tiers, personalization, seasonal/moment marketing, AI first draft) | **USER INPUT**: `docs/requirements/*.docx` |
| Landing structure (hero, audience split, feature benefits, proof, closing CTA), scorecard/growth-platform dashboards | **USER REFERENCE**: pattern only from elevatetourism.com; its colours are NOT used |
| Font licensing caveat and fallback; contrast ratios; dashboard/chart accessibility rules | **WEB RESEARCH** (complements, never overrides the references) |
| Spacing/radius scale, component specs, layout grid | **DERIVED** (AI-generated design decisions; no external source) |

## 2. Direction

"Premium airline-grade editorial." Calm, confident, generous whitespace, deep teal as the anchor,
warm-grey surfaces, mint highlights, large light-weight headlines. It must read as Walshe: a trade
partner of airlines and destinations, not a generic SaaS template. Product pattern (not colour)
follows ElevateTourism: segmented audience entry, scorecards, outcome-led value props.

Taglines to reuse verbatim (from walshegroup.com): "Premium brands, trusted outcomes";
"Celebrating 50 years in business in 2026"; "destination marketing & regenerative tourism
specialist"; "Airline GSA & approved service provider". Hero source line: "Australia and New
Zealand's premier airline GSA, service provider and destination marketing agency".
Stats-band facts on the site (70 employees, 6 locations, 17-year average partnerships) may be
echoed as brand proof; do not invent other numbers. Demo data must be labelled as sample.

## 3. Tokens (single source: `tailwind.config.ts` + CSS vars in `app/globals.css`)

Extracted from walshegroup.com computed styles (rgba values converted to hex):

| Token | Hex | Site usage | Role in app |
| --- | --- | --- | --- |
| `walshe-teal` | `#005653` | section/background fill (32 uses), text | primary, nav, buttons, headings on light |
| `walshe-mint` | `#E5F6DF` | text on teal (24 uses) | text on teal, selected/hover tints |
| `walshe-stone` | `#ECEBE8` | light section background (22 uses) | page and card-alt surface |
| `walshe-ink` | `#000000` | body/headline text | headings, strong text |
| `walshe-grey` | `#737373` | secondary text (129 uses) | captions, helper text (large/regular on white only) |
| `walshe-white` | `#FFFFFF` | cards | card surface |
| `walshe-green` | `#00AE41` | small icon fill | accent for icons/chart marks, status "approved". Never body text (about 3:1 on white) |

Derived (AI-generated, labelled): `teal-700 #003E3C` hover/pressed; `teal-100 #CFE6E3` tint;
`danger #B3261E`, `warn #8A5A00` for states. Chart series order: teal, green, grey, teal-300;
always add direct labels or patterns (never colour alone).

Contrast (computed, WCAG 2.1 AA needs 4.5:1 text, 3:1 UI): teal on white about 8.4:1; mint on
teal about 7.4:1; grey `#737373` on white about 4.7:1 and on stone about 4.9:1 (pass, do not
lighten); green on white about 3:1 (graphics/large only).

Typography: the site uses **Founders Grotesk** (Light for body/headings, Bold, Medium Italic for
emphasis) with Lato as secondary. Founders Grotesk is a paid Klim commercial face with per-project
web licences (no free tier), so we must not bundle it unlicensed. Plan: font stack
`"Founders Grotesk", "Helvetica Neue", Inter, system-ui, sans-serif` with **Inter** (open licence,
via `next/font`) as the shipped fallback and Lato for UI small text; swap in licensed WOFF2 files
without code changes if Walshe supplies them. Scale: display 56/60 light, h1 40/44, h2 28/34,
h3 20/28 bold, body 16/26 light-to-regular, small 14/20. Light weight for large type only; body
min 16px regular for readability.

Spacing 4px base (4, 8, 12, 16, 24, 32, 48, 64, 96). Radius: restrained, `sm 6`, `md 12`
(cards), `pill 999` (chips, primary CTA). Elevation: 1px stone border first, soft shadow
(`0 8px 24px rgb(0 86 83 / .08)`) only on hover/overlays.

## 4. Layout

- **Landing `/` (AC20)**: transparent-to-teal sticky header (logo, "For the Trade", "How it works",
  Sign in) > full-bleed teal hero (display headline, tagline, primary pill CTA "Sign in", secondary
  "See how it works", destination imagery) > stats/proof band (50 years in 2026, brand echo) >
  audience split cards (Content Providers / Tourism Agents / Walshe Admin) > four value props
  (Verified content hub · AI-assembled comms · Trade personalization · Social engagement) with
  a product screenshot/mock per prop > "from brief to published in minutes" flow (browse > build >
  personalize > export > measure) > closing teal CTA band > footer (taglines, 50 years).
- **App shell (AC21)**: left rail (desktop) / top bar + drawer (mobile); Walshe logo top-left;
  role-aware items; page header with breadcrumb and primary action; content max-width 1200,
  12-col grid, 24px gutters.
- **Dashboards (AC22)**: row of 3-4 stat tiles (one KPI per tile, delta chip), one primary chart
  (engagement over time) plus a ranked list/scorecard (ElevateTourism-style "scorecard"), then
  recent catalog/compositions as image cards. Provider: approved vs pending verification,
  asset counts. Admin: users/tenants, verification queue.
- **Catalog**: image-first cards with a "Verified" mint chip; filter bar; grid 1/2/3/4 cols.
- **Design Studio**: dark-neutral canvas surround, teal toolbar, Builder panel on the right;
  keep Fabric canvas white.

## 5. Components

Button (primary pill teal/mint; secondary outline teal; ghost), Card (white, stone border,
md radius), StatTile, Chart wrapper (title, summary text, data-table toggle), Badge/Chip
(verified = mint bg + teal text + check icon; draft = stone), Table (only for dense admin lists,
zebra stone), Form fields (48px height, visible 2px teal focus ring), Empty state (illustration
+ one action), Skeleton loaders, Toast, Nav item (active = mint tint + teal bar).

## 6. Do / Don't

Do: teal-first hierarchy, generous whitespace, real imagery, sentence-case copy, visible focus
rings, labelled charts with text summary, mobile-first (no horizontal scroll, AC23), explicit
empty and loading states, Contract 1 respected (only approved content is shown in agent views).

Don't: use ElevateTourism colours; use pure Tailwind defaults (indigo/blue/gray); use grey text
lighter than `#737373`; put green text on white; ship Founders Grotesk without a licence; show
or screenshot login screens, keys or PII; invent client logos, metrics or testimonials; use
emojis in UI or docs.

## 7. Verification

The ui-reviewer scores landing, agent dashboard, catalog and studio against sections 3-6 each
round. Playwright covers AC20-AC23; a Vitest test asserts the theme exposes the section 3 tokens
(AC19). Screenshots exclude `/login` and any credential or key.

## 8. Sources (accessed 2026-10-01)

1. The Walshe Group (primary anchor): https://walshegroup.com/ . Colours, fonts, taglines and nav
   read from live markup; supports sections 2-3.
2. ElevateTourism (UX pattern only): https://elevatetourism.com/ . Dual-path hero, outcome
   value-prop lists, scorecard/social-proof sequencing; supports section 4.
3. Founders Grotesk, Klim Type Foundry (commercial licence, per-project web licensing):
   https://klim.co.nz/ (via search results incl. https://en.wikipedia.org/wiki/Klim_Type_Foundry
   and https://madegooddesigns.com/founders-grotesk-font/ ). Supports the fallback plan. Note: the
   Klim licence terms page itself was not fetched; confirm pricing/terms with Klim.
4. SaaS dashboard accessibility and KPI guidance: https://www.gooddata.com/docs/cloud/create-dashboards/accessibility/
   and https://www.adacompliancepros.com/blog/accessible-charts (WCAG 2.1 AA 4.5:1 text / 3:1
   UI, non-colour encodings, text alternatives); https://www.context.dev/blog/dashboard-design-best-practices
   (one job per KPI card). Secondary/aggregator sources; supports section 3 and 4 rules.
5. Internal: `docs/requirements/*.docx` (discovery notes) and `/REQUIREMENTS.md` AC19-AC23.

Ideas without an external source (spacing/radius scale, derived tints, chart order, component
list): **No source found — this is an AI-generated idea.**
