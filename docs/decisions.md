# YOLT decisions log

Decisions made so far, why, and what is still open. Newest changes at the top of each section. Last updated 27 September 2026.

## Product decisions

| # | Decision | Chosen | Why / notes |
|---|---|---|---|
| D1 | Business model | Pure marketplace: sellers keep stock and ship | No warehouse or working capital needed. GST consequences in L2. |
| D2 | Payment | Prepaid only, money through the platform (split payments) | COD return-to-origin is ~21% vs ~6% prepaid; a returned one-of-one item is off the market for a week. Platform-held payment replaces the "random UPI QR" trust problem. |
| D3 | Social layer | Full: store feed, seller posts and reels with tagged listings, buyer fit pics, likes, comments | Buyer fit pics only from verified purchases (D7). Phased: see user-flows.md. |
| D4 | Drop mechanics | Scheduled FCFS drops with a timed hold; optional waiting room for busy drops (P1) | Raffles and auctions dropped for now (D12). Focus: a normal, genuinely helpful thrift platform. |
| D5 | Price negotiation | Structured offers (accept, decline, counter). No free-form chat. | Keeps haggling without DM chaos or off-platform deals. Disabled on drop items. |
| D6 | Returns | Not-as-described **and** size returns | Size returns need a short window, unworn check and seller inspection before relisting. The buyer pays return shipping on size returns (₹80–100 is 15–20% of a ₹500 item); consider limiting size returns to items above about ₹999. See market-research.md §5. |
| D7 | Reviews | Verified purchases only, shown on the **store page** | Sold items stay visible under the store's Sold out pill. Reviews sit at the bottom of the store page (like thrift pages' own sites), each showing the item bought. |
| D8 | Sellers | Curated Instagram thrift stores and individual closet sellers | Two onboarding tracks; closet sellers get stricter moderation. |
| D9 | Categories | Clothing, accessories and bags, sneakers and luxury | Sneakers/luxury labelled "seller-declared, not authenticated" until an authentication partner exists. |
| D10 | Seller verification | PAN + bank KYC before the first listing goes live, plus Instagram handle ownership check for stores | PAN/bank also required by the payment provider for payouts, so do it once. |
| D11 | Sold items | Filter pills at the top of store, search and category grids: In stock · Sold out · Coming soon. Sold items stay at their own URL, never buyable. | Shows buyers the store's track record; keeps Instagram share links working. |
| D12 | Raffles and auctions | Later, not planned | Revisit only if sellers ask. Paid raffles would need legal check L3 first. |
| D13 | Fees | **Buyers never pay a platform fee; YOLT's price matches the seller's Instagram price.** Pilot: ₹0 for everyone. Growth: sellers pay ₹0 on sales from their own links and followers, and a small commission (5–8%, to be tested) only on buyers YOLT found for them. Plus Seller Pro. | A buyer fee would make YOLT dearer than the same store's DMs and push its followers back to Instagram (Vinted's buyer fee works only because its sellers have no other shop; Mercari's shift to buyer fees cut sales). Platform absorbs gateway fees until commission starts. Split-payment setup still required. See market-research.md §5. |
| D16 | Order attribution | Every order records its source: the seller's own share link, or YOLT discovery (search, feed, drops, recommendations). First visit decides; a share-link visit marks the buyer as the seller's own for 30 days. Sellers see the split in their dashboard. | Commission (D13) applies only to YOLT-discovered orders, and "independent discovery" is the key metric in the blueprint. Must be recorded from the first order, before commission starts. |
| D17 | First-order incentive | Free shipping on a buyer's first YOLT order, funded by YOLT (P1) | A better hook for Instagram followers than any fee could be a barrier. |
| D14 | Offline events | Not now; online drops only | |
| D15 | Name | YOLT | |

## Constraints

- **Team: one person.** Scope is phased hard (P0, P1, P2 in user-flows.md). Mobile app deferred until after the web pilot has traction.
- **India-first**, INR, adult fashion.

## Tech stack (solo-adjusted)

Changed from the earlier recommendation because the team is one person: fewer servers to run, web before native app.

| Layer | Pick | Notes |
|---|---|---|
| Repo | pnpm + Turborepo monorepo, TypeScript | `apps/web`, `packages/api`, `packages/db`, `packages/shared` (Zod schemas). Ready for `apps/mobile` later. |
| Web | Next.js (App Router) on Vercel, Mumbai region | Responsive web **and** installable PWA with web push for drop reminders (iOS supports web push for installed PWAs). |
| API | Hono app with Zod-OpenAPI, mounted inside Next.js at `/api` for now | Same code can move to its own service when the Expo app arrives. The OpenAPI contract keeps a future mobile client typed. |
| ORM | Drizzle | Close to SQL; conditional `UPDATE ... WHERE status = 'AVAILABLE'` for atomic holds. |
| Database | PostgreSQL, Supabase (Mumbai, ap-south-1) used as plain managed Postgres | Less ops than RDS for one person. Move to RDS later if needed. |
| Background jobs | Now: Vercel Cron → `/api/cron/expire-holds` every minute, plus checkout frees expired holds itself. Later: Inngest draining the outbox table | No long-running worker to host. Add Inngest when notifications, search indexing and drop opening arrive. |
| Cache / rate limits | Upstash Redis | Rate limits, waiting-room positions, live counters. Never the only oversell guard. |
| Search | **Now: Postgres** full-text (prefix) + `pg_trgm` close matches, category synonyms, measurement filters that convert flat to around. **Later: Typesense Cloud** once the catalog reaches thousands of listings or search latency needs it. | No extra service for the pilot; the `/search` URL format and `searchListings()` result shape stay the same when the engine changes. Checkout always re-reads Postgres. |
| Media | Cloudflare R2 + Image Transformations; Cloudflare Stream for reels (P2) | |
| Auth | **Own phone-OTP login and database sessions** (`packages/core/src/auth.ts`), codes delivered by MSG91 (WhatsApp first, SMS fallback). Google sign-in later. | Changed from Better Auth (27 Sep 2026): its user model requires an email, and phone-only signup works by generating placeholder emails. YOLT's identity is the phone number, and the need is narrow. Design: HMAC-hashed 6-digit codes, 5 min expiry, 5 attempts, 30 s resend cooldown, 5/hour per phone, 20/hour per network; 32-byte session tokens stored only as SHA-256, 30-day sliding expiry, revocable per device or everywhere; HttpOnly SameSite=Lax cookies plus an Origin check on state-changing requests. |
| Payments | Cashfree Payments + Easy Split (vendor KYC with individual PAN) | Apply to Razorpay Route as a second provider once over its ₹40L turnover threshold. Put payments behind a provider interface. |
| KYC | Cashfree vendor KYC / Verification Suite (PAN, bank penny-drop) | |
| Shipping | Shiprocket API: one pickup location per seller, forward and reverse pickups, tracking webhooks | |
| Messaging | WhatsApp Business API via MSG91 (order updates), web push | |
| Live drop updates | Server-sent events backed by Redis pub/sub; polling fallback | |
| Analytics / errors | PostHog (events, feature flags), Sentry | |
| Mobile (later) | Expo + Expo Router, reusing `packages/api` client and `packages/shared` | |

## Open legal and compliance items (need a CA / lawyer before real payments)

| # | Question | Why it matters |
|---|---|---|
| L1 | Must YOLT register for GST and collect 1% TCS (section 52) from day one even with zero commission? | E-commerce operators collecting payment for sellers generally must. |
| L2 | Can unregistered sellers sell **inter-state** through YOLT? | Exemption (Notification 34/2023) covers intra-state only. If not, either launch in one state, require GSTIN for out-of-state shipping, or help sellers register. Decides launch geography. |
| L3 | (Deferred with raffles) Is a paid raffle a lottery under state law? | Paid entry plus chance-based winner likely counts as a lottery. Safer design: entry collects the full item price and non-winners are refunded automatically (or a payment block if the gateway supports it). Avoid non-refundable entry fees unless cleared. |
| L4 | Consumer Protection (E-Commerce) Rules 2020 obligations | Show seller name/address/contact, grievance officer (acknowledge within 48 hours, resolve within a month), return/refund policy display. |
| L5 | DPDP Act compliance by 13 May 2027 | Consent notices, deletion, breach process. Fit pics and KYC data are personal data. |
| L6 | RBI payment aggregator rules (Sept 2025) | Only collect for sellers onboarded on the platform and the provider. No manual "collect and forward". |
| L7 | Used-goods GST margin scheme, sneaker/luxury counterfeit liability | Relevant if YOLT ever acts as seller of record or authenticates. |

## Research references

- Instagram thrift booking and drop culture: https://www.shopify.com/in/blog/thrifting-in-india-complete-guide-on-how-to-start-a-successful-thrift-store
- Scam patterns (fake reviews, personal UPI QR, prepaid-only pressure): https://thriftwallet.in/blogs/the-thrift-journal/how-to-detect-fake-thrift-pages-on-instagram-2025-gen-z-guide
- Social seller order bursts and COD: https://www.icarry.in/pages/blog/instagram-shipping-guide-cut-rto-social-sellers.html
- COD vs prepaid return-to-origin rates: https://www.firstresort.in/blogs/research/fashion-ecommerce-returns-rto-india-2026
- Razorpay Route eligibility: https://razorpay.com/docs/payments/route/?preferred-country=IN
- Cashfree Easy Split vendor KYC: https://www.cashfree.com/docs/payments/split/vendor/kyc
- GST TCS section 52: https://taxguru.in/goods-and-service-tax/gst-tcs-section-52-commerce-operators-tax-compliance.html
- RBI payment aggregator directions 2025: https://www.khaitanco.com/sites/default/files/2025-10/ERGO%20-%20PA%20Master%20Directions%20-%203%20Oct%202025_0.pdf
- Instagram Graph API (for consented post import): https://developers.facebook.com/docs/instagram-platform/overview/
- MSG91 OTP pricing: https://msg91.com/in/pricing/otp
