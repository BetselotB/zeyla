# Zeyla — Lean Canvas & 4-Minute Pitch Brief

> Product concept for the whole company (not just the backend). Built around the **Lean Canvas** (Ash Maurya / Business Model Canvas for early-stage Problem–Solution fit), then turned into a **~4 minute** pitch.

**Category:** B2C / two-sided marketplace (local services)  
**X for Y:** Uber for local services — but the product is **trust + escrow**, not the map pin.

---

## One-liner

**Zeyla is a trusted local-services marketplace for Ethiopia** — find nearby providers, verify who they are, hold payment in escrow until the job is done, and build reputation you can actually trust.

---

## Zeyla Lean Canvas (one page)

Use this as the single sheet you memorize. Boxes follow the Lean Canvas layout: problem-heavy, solution small, UVP in the middle.

### Problem (top 3)

1. **No trustworthy way to hire local help** — you can’t tell a skilled neighbor from a first-timer or a scam; there is no shared reputation.
2. **Payment is unsafe either way** — pay before → risk of no-show / incomplete work; pay after → providers won’t start or argue over price.
3. **Discovery is informal and broken** — “Who is near me and available *now*?” is answered by WhatsApp/Telegram groups, neighbor referrals, and luck.

**If there is no makeshift alternative, it isn’t a real problem.** People already work around this every day — which is why the alternatives below matter.

### Existing Alternatives

| Alternative | Good | Bad / Ugly |
| --- | --- | --- |
| Neighbor / family referrals | Social trust | Tiny network; no portable score; fails when you move or need a new skill |
| Telegram / WhatsApp groups | Fast, free, familiar | No KYC, no escrow, no tracking, scams scale with group size |
| Cash on arrival / after job | Simple | Disputes, unpaid work, price fights, no neutral third party |
| Generic classifieds / Facebook posts | Broad reach | Listings without money safety or identity |
| Global gig apps (where available) | App UX | Weak local payment + identity fit for Ethiopia; often not built for informal trades |

### Customer Segments

- **Urban households** who need plumbing, electrical, cleaning, repairs, and similar help on short notice  
- **Busy professionals / renters** who can’t rely on an inherited “guy” network  
- **Independent service providers** who want paid jobs, portable reputation, and fewer “I’ll pay later” losses  
- **Small businesses** that occasionally need local trades without a preferred vendor list  

### Early Adopters (who feels the pain hardest)

- Tech-comfortable urban residents already using Telebirr / mobile money and messaging apps  
- People who regularly hire from Telegram groups and have been burned (or nearly burned) once  
- Providers who already get work from referrals but lose money to no-shows and unpaid jobs  
- Neighborhoods with dense demand for one category first (e.g. plumbing or cleaning in Addis)

### Channels (where we reach them)

- Mobile / PWA install links + app-store style sharing  
- Telegram / WhatsApp community seeding in target neighborhoods  
- Provider onboarding via trade groups and referral invites  
- Social / short-video demos of “fund → track → release”  
- Partnerships with local payment rails and community orgs (later)

### Solution (smallest version that works)

A phone-first marketplace that:

1. Shows **nearby providers ranked by trust**  
2. Lets the customer **ping and book** a job  
3. **Holds payment in escrow** until the job completes  
4. Updates a **transparent trust score** from completed work, reviews, KYC, and flags  

Live tracking, voice request parsing, and Pro badges amplify this — they are not the MVP.

**Core loop:**

```
Need → Discover (map + trust) → Ping → Fund escrow
    → Track → Complete → Payout → Review → Trust updates
```

### Unique Value Proposition

**UVP formula:** *End result the customer wants + time period + address the objections.*

> Hire a nearby, verified service provider in minutes — **pay only when the job is done**, with a trust score you can actually explain.

**Objection killers baked into the UVP:**

- “What if they don’t show / finish?” → money stays in escrow  
- “How do I know they’re real?” → KYC + score + reviews/flags  
- “Is this just another listings app?” → settlement + reputation, not posts  

**Pitch sentence:**  
*Uber for local services — but the product is trust and escrow, not the map.*

### Key Metrics (split by journey)

| Stage | Metric | What “good” looks like |
| --- | --- | --- |
| **Acquisition** | Installs / first visits; provider signups in pilot zone | Growing both sides in the same neighborhoods |
| **Activation** | Customer completes first funded escrow; provider completes KYC + first accepted ping | First *protected* job, not just an account |
| **Retention** | Customers with ≥2 completed jobs / 30 days; providers with repeat weekly jobs | Habit > one-off curiosity |
| **Revenue** | Completed contracts with fee taken on escrow release | Monetize success, not noise |
| **Trust health** | % jobs with review; dispute rate; avg trust of matched providers | Marketplace quality, not just GMV |

Early-stage focus (Lean Canvas rule of thumb): **Activation** and **Retention** before vanity downloads.

### Revenue Streams

1. **Take rate on escrow release (primary)** — fee when money safely completes (e.g. 5–12% or flat + %)  
2. **Priority / instant payout** — providers pay for faster settlement  
3. **Boosted discovery** — labeled visibility in category + radius (never bury low-trust safety)  
4. **Zeyla Pro subscription** — deeper verification, higher limits, badge  
5. **Later:** job guarantee / insurance premium; ping/lead credits on tiny jobs  

**Judge / investor line:** *We get paid when jobs get done safely — the same moment the market creates value.*

### Cost Structure

- Product engineering & hosting (API, PostGIS, Redis, realtime, PWA)  
- Payment rail fees (Chapa / local processors) + escrow ops  
- KYC / verification ops (storage, review, fraud)  
- Dual-sided acquisition (customer campaigns + provider onboarding incentives)  
- Support & dispute handling  
- Optional: voice/NLP, maps, push infra  

### LTV / CAC (lean check)

Use as a planning frame, not fake precision:

```
LTV ≈ avg job value × jobs per retained customer × retention window × contribution margin
CAC  ≈ direct cost to acquire one activated customer (or provider) in a pilot zone
Target: LTV / CAC ≈ 3:1
```

**Implication:** win on **repeat jobs in dense neighborhoods** and **provider density**, not national spray-and-pray ads.

### Unfair Advantage (hard to copy)

Being first is **not** an unfair advantage. Aim for:

| Advantage | Why it’s hard to copy |
| --- | --- |
| **Escrow + trust as one product loop** | Competitors can copy a map; copying held settlement + score architecture + ops is harder |
| **Local payment + identity fit** | Built around Ethiopian phone OTP + Chapa-class rails from day one |
| **Compounding trust graph** | Reviews, flags, completed contracts, KYC — data network effects over time |
| **Provider community density in a pilot wedge** | Liquidity in one category/neighborhood becomes a moat |
| **Brand of “safe hire”** | If we own the category phrase, listings apps look incomplete |

---

## Lean Canvas at a glance (fill-in style)

| Box | Zeyla |
| --- | --- |
| **Problem** | No trust signal; unsafe pay either way; broken nearby discovery |
| **Existing alternatives** | Referrals, Telegram/WhatsApp, cash, classifieds |
| **Customer segments** | Urban households + independent providers (+ SMB occasional hire) |
| **Early adopters** | Mobile-money users burned by group hires; providers tired of unpaid jobs |
| **Solution** | Nearby match + escrow hold + transparent trust score |
| **UVP** | Nearby verified help in minutes — pay when done, score you can explain |
| **Channels** | PWA, Telegram/WhatsApp seeding, provider invites, social demos |
| **Key metrics** | Funded first job (activation); repeat jobs/30d (retention); fee on release (revenue) |
| **Revenue** | Escrow take rate; priority payout; boosts; Pro sub |
| **Cost structure** | Eng/hosting, payment fees, KYC/dispute ops, dual acquisition |
| **Unfair advantage** | Escrow+trust loop, local rails fit, compounding trust graph |

---

## Solution depth (for demo / product, not the canvas box)

Keep the canvas Solution box small. Use this when judges ask “what did you build?”

### Trust layer

- Phone OTP auth  
- KYC upload (ID + selfie; hackathon = simplified verification)  
- Trust score: base 50 + completed contracts + ratings + KYC − flags (+ optional public-profile match)  
- On-screen “why this score” explanation  
- Reviews + flags  

### Money layer (core IP)

Contract state machine:

`awaiting_escrow → escrowed → active → completed`  
(+ `disputed` with admin release)

- Fund via Chapa hosted checkout → hold → payout on complete  

### Experience layer

- Geo discovery (PostGIS radius, category, trust filters)  
- Realtime ping  
- Live location while active  
- Optional voice → category / urgency / location  

**Product pillars:** Discover with confidence · Pay with protection · Reputation that compounds.

---

## Monetizable features (mapped to canvas Revenue)

| Feature | Who pays | When | Canvas role |
| --- | --- | --- | --- |
| Escrow take rate | Customer and/or provider (embedded in fee) | On successful release | Primary |
| Priority payout | Provider | On cash-out | Add-on margin |
| Discovery boost | Provider | Campaign / peak hours | Growth + ARPU |
| Zeyla Pro | Provider (subscription) | Monthly | Retention + quality supply |
| Guarantee premium | Customer (later) | High-value jobs | Trust infrastructure |
| Ping / lead credits | Provider (optional) | When free tier exhausted | Thin-job monetization |

**Do not lead with:** selling user data, predatory payout lending, boosts that hide low-trust providers.

---

## Demo story (activation path)

This is the Activation metric made visible:

1. Login with phone OTP  
2. Discover nearby providers sorted by trust  
3. Open trust breakdown  
4. Ping → accept  
5. Fund escrow (Chapa or demo checkout)  
6. Live track  
7. Complete → payout  
8. Review → trust score updates  

Polish this path first — it *is* Problem → Solution fit on stage.

---

## 4-minute pitch (mapped to Lean Canvas)

Speak the canvas in order; don’t dump features.

### 0:00–0:35 — Problem + alternatives

> “You need a plumber. You don’t open an app — you text three people, get one name from a Telegram group, and pay cash hoping they finish. That’s the market: referrals, group chats, and risk.”

Name top 3 pains. Name the workarounds (referrals, WhatsApp, cash).

### 0:35–1:10 — Customers + early adopters

> “Urban households who need help now, and skilled providers who lose money to ‘I’ll pay later.’ Our early adopters already use mobile money — they just don’t have a safe hire button.”

### 1:10–2:20 — Solution + UVP + demo

> “Zeyla: find someone nearby, see a trust score you can explain, hold payment in escrow until the job is done, then release and review.”

UVP line: *Nearby verified help in minutes — pay when done.*  
Then run the demo click-path (60–90s).

### 2:20–3:00 — Key metrics + unfair advantage

> “We don’t celebrate downloads. We celebrate the first funded job, then the second job in 30 days. Our advantage isn’t a map — it’s escrow and trust compounding together, on local payment rails.”

### 3:00–3:35 — Revenue + costs (business model)

> “We take a fee when escrow successfully completes. Then priority payout, boosts, and Pro verification. We monetize protected completed work — same moment value is created. LTV comes from repeat neighborhood jobs; we keep CAC tight with community seeding, not national ads.”

### 3:35–4:00 — Close / ask

> “Zeyla is the trust and settlement layer for services next door. Not another listings feed — a marketplace where money and reputation only move when the job is real.”

Ask: hackathon win / pilot neighborhood / next milestone.

---

## Soundbites (pick 2–3)

- “Uber for local services — but the product is **trust and escrow**, not the map.”  
- “If the only alternative is a Telegram group and cash, the problem is real.”  
- “Activation isn’t signup — it’s the first funded escrow.”  
- “We monetize completed, protected work — not noise.”  
- “Listings without settlement make scams scale. We hold the money and update the score.”  

---

## Vetting questions (Lean Canvas fieldwork)

Use these with real users before / after the hackathon:

**Problem**

- Do you face trouble finding reliable local help?  
- What’s the pain level (1–10)?  
- What’s your current workaround?

**Solution**

- Does “nearby providers + escrow until done + trust score” solve that?  
- How well, 1–10?  
- What would still stop you from using it?

**Channels / early adopters**

- Where did you last find a plumber/cleaner?  
- Would you trust an app more if money was held until completion?

---

## Risks & honest framing

| Risk | Stance |
| --- | --- |
| KYC depth | Hackathon = simplified ID + selfie; production needs stronger ops |
| Disputes | Clear states + admin release first; full mediation later |
| Cold start | Wedge: one category + one neighborhood; dual incentives |
| Payment rails | Chapa sandbox → production; `DEMO_MODE` for demo resilience |
| Live GPS | Scripted movement OK if device GPS flakes |
| “Unfair advantage” | We earn it via trust graph + liquidity — we don’t claim patents on day one |

---

## What we’re building (surface area)

| Area | User-facing |
| --- | --- |
| Onboarding | Phone login, KYC, provider profile |
| Discovery | List/map, filters, trust detail |
| Match | Request + ping + accept |
| Money | Escrow fund → Chapa → return |
| Live job | Map tracking |
| Closeout | Complete → payout → review/flag |
| Ops | Admin release for disputes |

**Stack:** React (Vite) PWA · Express modular monolith · Postgres + PostGIS · Redis · Socket.io · Supabase Auth · Chapa · Render.

**Core IP:** escrow / contract state machine + trust score formula.

---

## Team context (hackathon)

Parallel tracks: identity & money · marketplace & realtime · onboarding/payment UI · discovery/tracking/reviews UI · shared design system + demo path.

**North star:** Problem–Solution fit on stage = escrow + trust working in one click-path.

---

## One-paragraph abstract

Zeyla is a phone-first local-services marketplace for Ethiopia that solves unsafe hiring: customers discover nearby providers by trust, fund jobs through escrow, track work in realtime, and release payment on completion while providers earn portable reputation. Existing alternatives — referrals, Telegram/WhatsApp groups, and cash — have no settlement or shared score. We activate users on the first funded job, retain them on repeat neighborhood work, and monetize take rates on escrow release plus priority payout, boosts, and Pro verification. Unfair advantage accrues from the escrow–trust loop, local payment fit, and a compounding trust graph — not from being first with a map.


Create a premium startup pitch deck (maximum 10 slides) for a company called Zeyla.

This is not a school presentation. Design it like a presentation from Stripe, Airbnb, Linear, Notion, Apple, or Y Combinator Demo Day.

The presentation should feel like it was designed by a professional product designer.

Design Style

Theme:





Minimal



Modern



Premium



Technology startup



Trustworthy



Elegant



Spacious

Color Palette

Primary:





Emerald Green #16A34A

Secondary:





Dark Navy #0F172A

Accent:





Soft Green #DCFCE7

Background:





White #FFFFFF



Very Light Gray #F8FAFC

Text:





Dark Gray #111827

Success:





#22C55E

Avoid:





Bright gradients



Cartoon graphics



Clipart



Busy backgrounds



Random colors

Typography

Use only clean modern fonts similar to





Inter



SF Pro Display



Manrope



Plus Jakarta Sans

Large bold headings

Minimal text

Lots of whitespace

Maximum 5 bullet points per slide.

Icons

Use consistent outline icons.

Examples:

Shield

Map Pin

Wallet

Verification Badge

Users

Home

Handshake

Money

Location

No emojis.

Illustrations

Use premium flat illustrations.

Do not use stock photos.

Prefer:

Phone mockups

Maps

Workflow diagrams

Simple UI illustrations

Cards

Trust score components

Slide 1 — Cover

Title



Zeyla

Subtitle

Trusted Local Services for Ethiopia

Tagline

Trust • Escrow • Reputation

Background:

Minimal abstract map lines or geometric shapes.

Include a modern logo placeholder.

Slide 2 — Problem

Title

The Problem

Show three large cards.





No trustworthy way to hire local service providers.





Unsafe payments.

Customers fear paying before.



Providers fear working before payment.



Discovery is broken.

People rely on Telegram groups, WhatsApp, and referrals.

Bottom quote

"If the only alternative is a Telegram group and cash, the problem is real."

Slide 3 — Solution

Title

How Zeyla Works

Create a horizontal journey.

Need Help

↓

Find Nearby Providers

↓

Trust Score

↓

Book Service

↓

Escrow Payment

↓

Live Tracking

↓

Complete Job

↓

Release Payment

↓

Review

Each step should have an icon.

Keep it visually clean.

Slide 4 — Product

Show large mobile phone mockups.

Screen examples





Discovery



Provider Profile



Trust Score



Escrow



Live Tracking



Review

Modern UI.

Do not overload the slide.

Slide 5 — Why We're Different

Comparison table.

Rows

Trust Score

Escrow

Verified Providers

Live Tracking

Reviews

Columns

Zeyla

Telegram

Facebook

Referrals

Highlight Zeyla in green.

Slide 6 — Business Model

Left side

Revenue

• Escrow Fee

• Zeyla Pro

• Priority Payout

• Featured Providers

• Future Protection Plans

Right side

Costs

Engineering

Payment Processing

KYC

Support

Marketing

Display as beautiful cards.

Slide 7 — Market

Customer Segments

Use illustrations.

Urban Households

Busy Professionals

Independent Service Providers

Small Businesses

Bottom section

Early Adopters

People already using mobile money and hiring through Telegram.

Slide 8 — Competitive Advantage

Four premium feature cards.

Escrow + Trust Loop

Local Ethiopian Payment Integration

Compounding Trust Graph

Neighborhood Liquidity Network

Bottom statement

"Our product is trust and escrow—not the map."

Slide 9 — Vision

Large illustration.

Headline

The Trust Layer for Local Services

Small text

Today:



Plumbers, Electricians, Cleaners

Tomorrow:



Mechanics, Tutors, Car Wash, Home Repair, Freelancers, and more.

Include an ecosystem illustration.

Slide 10 — Closing

Large title

Thank You

Big statement

Zeyla is building the trust and settlement layer for local services in Ethiopia.

Bottom

Questions?

Leave room for

Website

QR Code

Team

Visual Guidelines

Every slide should have

Consistent margins

Consistent spacing

Same icon style

Same card radius

Same shadow

Same typography

Same colors

Use subtle animations and slide transitions.

No slide should feel crowded.

Every slide should look like it belongs in the same design system.

The final presentation should resemble a $100M startup investor deck, with clean visual storytelling, modern layouts, and a polished, premium aesthetic. 

