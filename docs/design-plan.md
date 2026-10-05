# YOLT design plan: Claude Design ↔ code in sync

How the UI goes from "working but plain" to a launch-quality product, without design and code drifting apart. The brief for Claude Design is [claude-design-prompt.md](claude-design-prompt.md). Last updated 5 October 2026.

## 1. Where we are

- **The product works end to end:** browse, search, store page, product, bag, OTP sign-in, checkout with holds, sandbox payments, orders and shipping, buyer protection claims, reviews, saves and follows, drops, the seller workspace and admin.
- **The UI was never built from the design.**
  - `apps/web/src/app/globals.css` still has placeholder tokens.
  - The font is Geist.
  - There's no bottom nav and no component library.
  - The Claude Design canvas ([YOLT — Product designs](https://claude.ai/artifact/PAXQ44qWcFKHokx9Yh5eKb), 21 boards) was never read by the code.
- **The canvas has gaps and conflicts.**
  - Missing: the store page (the most important screen), checkout address and payment-status screens, stock pills, seller orders, the drop builder, payouts and admin.
  - Contradicting [decisions.md](decisions.md): an email sign-in, a "fit returns" line, a drop waiting room, AI style tags and commission placeholders.

## 2. How we stay in sync

The **design contract** in section 3 of the brief:
- One canvas.
- Board titles carry the **route and state**.
- Fixed **token names**: `background`, `surface`, `foreground`, `accent`, …
- Fixed **component names**: `ProductCard`, `StockPills`, `DropTicket`, …
- A handoff sticky per canvas page that lists routes, components, states and exact strings.

In code:
- Token names become CSS variables in `globals.css`.
- Component names become files in `apps/web/src/components/ui/`.
- Board IDs (e.g. B3.2) go in commit messages.

**Rules:**
- **The canvas is the source of truth for looks; [decisions.md](decisions.md) is the source of truth for behaviour.** If they disagree, the decision wins and the board gets fixed.
- **Engineering reads the boards directly** from the canvas (Claude Code reads the `.dc.html` files by URL). No screenshots or exports needed.
- **Anything new goes into the design first.** A new screen or state is added to the canvas before (or with) the code, so the canvas stays complete.
- Copy written on a board is final unless it breaks a decision.

## 3. Workflow

1. Paste the brief into the Claude Design chat. It does Batch 0 (fixing the existing boards) and Batch 1 (foundations).
2. **Your one decision:** pick one of the two variants of the "Street × cute" direction, then say "next". Both are black and white with subtle accents; they differ in type pairing and accent colour.
3. Keep saying "next" for Batches 2–11. Say "fix: …" whenever something looks off.
4. After any batch, tell Claude Code "batch N done". It reads those boards and builds them on a branch. Design can run ahead of code, so you don't have to wait.
5. Each code batch is checked against its boards with Playwright screenshots at 390 and 1280, in light and dark mode, then reviewed and merged.

## 4. Batches, and what code does after each

| Batch | Claude Design makes | Then in code |
|---|---|---|
| 0 + 1 | Existing boards fixed; brand directions; tokens; component sheet | Tokens in `globals.css` (light and dark); fonts via next/font; `components/ui/*` primitives (Button, StatusBadge, StockPills, ProductCard, Toast, BottomSheet, Skeleton…); `Header`, `BottomNav`, footer; Lucide icons. Every page restyles at once, because pages already use the token classes. |
| 2 | Landing (guest) with a 5-slide hero carousel, signed-in home, skeleton, welcome and preferences | New `/` with the ticker; a `HeroCarousel` whose slides come from real data (brand slide; next drop with countdown; featured store; edit; fit slide), with autoplay that pauses and is off under reduced motion. The **first screen is about 55% hero and 45% products**: a compact hero, then **Trending now** (most saved this week, or "Just dropped" when there's no data yet) and **Grails** (staff-curated, hidden when there are none). The search bar is sticky in the header. Then the drops strip, shop-your-size, fresh finds, why YOLT, styles, stores, just sold, seller band and footer; signed-in home variant; preferences (new: saved sizes on the user) |
| 3 | Store page (6 states), product page (6 states) | Rebuild `/s/[handle]` and `/p/[slug]`: gallery with zoom, sticky buy bar, rating breakdown |
| 4 | Search, filter sheet, zero results, explore, drops list | Filter sheet, explore tab, rebuilt `/drops` |
| 5 | Sign-in (6), bag, checkout (9), desktop checkout | Login as a bottom sheet, OTP boxes, SMS-fallback UI; stepped checkout; payment status screens |
| 6 | Profile, orders, order detail (7), review form, claim sheet and status, saved, addresses | **New routes:** `/account`, `/account/addresses`; rebuilt orders, claims and saved |
| 7 | Drop page (6 states), waiting room (P1) | Rebuilt `/d/[id]` with the opening transition |
| 8 | Seller overview, listings, editor (6), store settings, `/sell` | Seller nav (sidebar plus mobile tabs). **New:** `/seller/store` settings and the `/sell` apply form (stores an application for admin) |
| 9 | Seller orders, order detail, reviews, drops, payouts | **New:** `/seller/payouts` (pilot ₹0 statement, Your link vs Found on YOLT) |
| 10 | Admin (including homepage curation), 404, error, offline, legal, install card, push prompt, toasts | Admin restyle; **new: homepage curation** (featured store, Grails list and edit for the hero, scheduled; until it exists, the hero uses the store with the most live pieces and the newest category); `not-found`, `error`; **PWA manifest, service worker, install card, web push** (the next P0 feature, so drop reminders actually send) |
| 11 | Desktop pass, handoff index | Desktop polish across all pages |

Roughly one or two working sessions per code batch. Batches 0+1 and 2 matter most: once the tokens and components land, every page looks better at once.

## 5. Landing page direction

Research notes:
- **Indian streetwear sites:**
  - Bluorng: a full-bleed campaign hero, an announcement bar for live drops, collection carousels, sold-out badges.
  - Jaywalking: caps product names, front and back photos, a "One of one" section.
  - Crepdog Crew: dark, bold caps headings, curated edits.
- **Resale marketplaces:**
  - Vinted: a "declutter" hero with Sell now, a dense listing grid with condition and size, popular categories.
  - Depop: shop by style, a social and editorial feel.

- **Main inspiration: Crepdog Crew**, chosen 5 Oct. Bold caps headings, black-and-white layouts, a dense grid, curated edits, and subtle product-card hovers (each card swaps to a second photo on hover).
- **Crepdog Crew sells new streetwear; we're thrift.** So we change these:
  - no size selectors (one of one);
  - no MRP, strike-through prices or sale banners;
  - measurements and flaws are the stars of the page;
  - sold out stays visible;
  - stores matter more than brands;
  - never "authentic" (YOLT doesn't authenticate);
  - prepaid only, no COD or EMI.
- **Culture Circle:** only for price-bucket shopping and its youth tone.

**YOLT's take: "Street × cute", for the youth.**
- **Colour: black and white**, with subtle accents only: stickers, the save sparkle, the Live stamp, the active pill. Product photos supply the colour.
- **Street:** bold caps grotesk display and hard contrast.
- **Cute:** a rounded friendly body font, die-cut sticker badges, tiny doodles, chunky rounded corners and playful micro-interactions.
- **Product card hover** (desktop): crossfade to the back photo, a slight zoom and lift, the hang-tag price swings, and an Add to bag bar slides up. Every hover has a tap equivalent on phones, and reduced motion is respected.
- The usefulness of a marketplace, and honesty as the brand.

- **Above the fold:** search and products. A loud headline ("THRIFT WITHOUT THE DMs.") over a collage of real product photos with hang-tag prices.
- **Signature devices:**
  - the thrift **hang tag**, for prices, drop tickets and empty states;
  - **ticket-stub** drop cards, the BookMyShow nod;
  - a **tape-measure** "Shop your size" module, our differentiator: real measurements;
  - **Shop by price** hang-tag tiles (Under ₹499 · ₹999 · ₹1,999 · ₹2,000+). No strike-through prices, because thrift has no MRP.
- **Social proof only from real data:** verified reviews, store sold counts, and a "Just found a home" strip of real sold pieces. No invented stats, no sale banners, no fake urgency.
- **A seller band at the bottom:** "Run a thrift page? Stop selling in DMs." with ₹0 commission on the seller's own buyers.

## 6. Decisions the boards must follow

The full list is in section 4 of the brief. The ones the current canvas breaks:

- **Sign-in:** phone only; WhatsApp code, then SMS. No email.
- **Returns:** no size returns, everywhere, in the exact protection line.
- **Drops:** first to claim gets a 5-minute hold, with a per-buyer limit. The waiting room is P1.
- **Fees:** ₹0 in the pilot. No commission placeholders; orders are labelled Your link / Found on YOLT.
- **Scope:** no AI style tags, CSV import, analytics or notifications bell until they're planned.

## 7. Done means

A code batch is done when:
- every board in it is matched at 390 and 1280, in light and dark mode;
- every listed state is reachable in the app;
- the copy matches the board;
- there are no contrast failures;
- typecheck, lint, tests and the build pass;
- Playwright screenshots are attached to the PR.
