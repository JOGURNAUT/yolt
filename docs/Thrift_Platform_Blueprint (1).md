# Thrift platform product and engineering blueprint

Prepared for Rajat Srivastava · 21 September 2026

Build a curated, seller-fulfilled thrift marketplace with familiar fashion-commerce navigation, reliable single-item inventory, measurable discovery for independent sellers, and optional scheduled drops. Deliver responsive web first, then a shared-backend mobile app. This plan is a proposed design, not a claim that features or business outcomes have already been achieved.

## 1. Product thesis and launch assumptions

The promise: discover unique clothes from independent sellers, know their condition and availability, and buy without negotiating ownership in Instagram DMs.

Use Myntra as a reference for familiar shopping patterns—large product photos, categories, filters, wishlists, bag and orders—while creating original branding and layouts. A current live Myntra interface audit was unavailable because its public homepage returned maintenance during this research.

Initial assumptions to test:

- India-first, INR pricing, adult fashion, seller-fulfilled shipping, invite-only independent sellers.
- Each listing describes one physical garment. Quantity defaults to one. A second garment, even of the same brand and size, gets another listing if its condition differs.
- Launch with one coherent style niche selected from interviews, such as affordable streetwear or vintage casualwear. Do not start with every category and geography.
- Sellers own inventory and ship it; the platform handles catalog discovery, checkout, tracking and support coordination.
- Begin with one seller per checkout. The bag may group several sellers, but each group has its own payment and shipping total. Combined payment and split settlements are later work.
- Use a sandbox payment flow for the engineering demo; enable real payments only when provider onboarding and operating policies are ready.
- Sellers must reserve pilot inventory for the platform or use a disciplined external-sale marking workflow. Without channel integration, immediate accuracy across Instagram DMs cannot be guaranteed.

## 2. Research and validation

The supplied research comprises interviews with 10+ independent thrift sellers. It supports seller pain points, but buyer personas remain hypotheses unless buyers were separately interviewed. Avoid describing three personas as validated solely by seller interviews.

| Persona | Job to accomplish | Main uncertainty | Validation task |
|---|---|---|---|
| Thrift hunter | Find a distinctive item and compete fairly for limited drops | Will a queue feel fair or obstructive? | Observe a drop prototype with scarce items |
| Casual buyer | Find something affordable that fits and arrives as described | Does distrust or sizing prevent purchase? | Ask buyers to compare listings and complete checkout |
| Small seller | Reach relevant buyers and manage sales without DM chaos | Will extra listing work outweigh benefits? | Observe onboarding and five real listing uploads |

Next research: interview 5–8 thrift buyers across experience levels; observe 3 sellers handling an actual drop; test one clickable buyer journey and one seller journey. These are proposed sample sizes, not statistical validation. Record behavior, abandoned steps, exact quotes with consent, and counterexamples.

Test willingness to pay through a transparent fee proposal and a real pilot, not only “would you use this?” Ask sellers about weekly listing volume, simultaneous channels, cancelled sales, dispatch process, margins and acceptable onboarding effort. Ask buyers about measurement habits, trusted sellers, delivery expectations, returns and purchase frequency.

Shadowbanning is a reported external pain point. Do not promise to prevent Instagram shadowbans or present seller reports as independently verified incidents. Measure discovery and sales originating inside your platform and seller dependence on external traffic instead.

## 3. Product surfaces and navigation

Buyer mobile app: Home, Explore, Drops, Saved, Profile in the bottom navigation. Bag stays in the header; search is prominent on Home and Explore. Avoid six or seven bottom tabs. Notifications live behind a header icon.

Desktop web: persistent search, category navigation, Drops, Discover Sellers, Saved, Bag and Profile. Product grids have a filter sidebar; product detail uses gallery and details columns. The mobile website uses the app information architecture with responsive sheets and sticky actions.

Seller workspace: Overview, Listings, Drops, Orders, Earnings, Analytics, Store and Settings. Build responsive web first so sellers can photograph and upload from phones while managing inventory from laptops.

Admin workspace: seller approvals, listing moderation, orders and disputes, payout reconciliation, featured collections, queue monitoring and audit history. One account may be both buyer and seller; switching workspace does not create another identity. Admin permissions are separate and never self-selectable.

## 4. Buyer screen inventory

| ID | Screen | Main content and actions | Important states |
|---|---|---|---|
| B01 | Welcome and guest entry | Brand, browse now, sign in | Skip without losing destination |
| B02 | Authentication | Phone OTP or configured managed auth method | Wrong code, expiry, resend limit, recovery |
| B03 | Optional preferences | Styles, size preferences, budget, followed stores | Skip, edit later, no matching inventory |
| B04 | Home | Search, fresh listings, saved-size picks, smaller stores, drops | New user, returning user, low inventory |
| B05 | Explore categories | Category and style entry points | Empty category, loading |
| B06 | Search input | Recent searches, suggestions, brands, stores | Typo, no suggestions, clear history |
| B07 | Search results | Products and stores tabs, count, sort, filter chips | No results, sparse results, sold item |
| B08 | Filters and sort | Size, measurements, price, condition, brand, style | Reset, incompatible filters, preserve choices |
| B09 | Product detail | Actual garment photos, defects, measurements, seller, delivery | Available, reserved, scheduled, sold, removed |
| B10 | Measurement guide | Flat measurements, diagram, inches and centimetres | Unknown fields, category-specific fields |
| B11 | Seller storefront | Story, verification scope, listings, reviews, upcoming drops | New seller, away, suspended |
| B12 | Saved items | Products, followed stores, saved searches | Sold item retained with alternatives |
| B13 | Bag | Seller groups, item availability, shipping estimate | Price changed, sold, hold belongs elsewhere |
| B14 | Address and serviceability | Address form, pincode check, saved addresses | Unsupported pincode, validation failure |
| B15 | Order review | Exact item snapshot, policies, fees, total, payment | Hold expiry, price reconfirmation |
| B16 | Payment status | Processing, retry, confirmed, needs reconciliation | App closed, late webhook, duplicate attempt |
| B17 | Confirmation | Order reference, dispatch estimate, next actions | Payment received but allocation failed |
| B18 | Order list and detail | Timeline, tracking, help, receipt | Delayed, cancelled, lost, returned |
| B19 | Issue and return request | Reason, evidence, expected next update | Ineligible request, evidence upload failure |
| B20 | Review | Condition accuracy, dispatch and seller experience | Only verified delivered purchases |
| B21 | Drop calendar | Upcoming and live drops, reminders | Cancelled, rescheduled, sold out |
| B22 | Drop preview | Item previews, time zone, rules, reminder | Not yet open, changed item |
| B23 | Waiting room | Position, status, access rules, leave action | Reconnect, paused drop, expired access |
| B24 | Live drop | Live availability and claim action | Another buyer reserved, inventory exhausted |
| B25 | Notifications | Order events, reminders, saved-search matches | Permission denied, read state, empty |
| B26 | Profile and settings | Orders, addresses, preferences, account controls | Deletion request, active order retained |
| B27 | Outfit studio | Garment selection, photo choice, preview history | Opt-in, queued, failed, unsupported garment |

Design reusable templates rather than 27 unrelated visual systems. Authentication, filters, measurements and confirmation can be sheets where appropriate. Web routes must deep-link to product, seller, search and drop destinations; share links should open the installed app when configured and otherwise open the website.

## 5. Home and product experience

Home order: search and serviceability shortcut; one editorial collection; Fresh Finds; Shop by Style; Picks in Your Preferred Sizes; Discover Independent Stores; Upcoming Drops; Recently Viewed. Do not fill the first viewport with promotional banners. Explain recommendations through labels such as “Because you saved denim jackets.”

Product card: garment photo, short title, price, tag size, condition, seller and save action. Show an honest availability badge. A sold card loses its purchase action. Do not invent MSRP, discount percentages, scarcity counts or sustainability savings.

Product detail order:

1. Actual garment gallery with front, back, label and defect close-ups.
2. Title, price, condition and current availability.
3. Tag size plus measured dimensions; make clear whether chest is flat width or circumference.
4. Visible flaws and any alterations, with linked photos.
5. Seller identity, verified-purchase reviews and dispatch expectation.
6. Pincode-based delivery information and full shipping cost before payment.
7. Return and dispute policy summary.
8. Save and Add to Bag or Buy Now; later, an optional Try On action.
9. Similar available items and more from this store.

Store declared brand separately from authentication status. A photographed label does not prove authenticity. Initially exclude categories requiring authentication capabilities you do not have. Condition grades need plain definitions plus item-specific descriptions; a grade alone is insufficient.

## 6. Authentication and onboarding

Allow anonymous browsing, searching and viewing seller pages. Keep local guest saves, then merge by listing ID after authentication without duplicates. Require authentication at checkout, following stores, queue entry and server-synced saves.

For an India pilot, phone OTP is a reasonable primary method if cost and abuse controls are affordable. Email sign-in can be an alternative; start with one well-supported provider. Social login is optional. Never link accounts solely because display names match. Credential linking requires proof of control, and recovery must not bypass that proof.

Keep style and size onboarding optional and brief. Do not require body photos, gender or address to browse. Store shopping preferences separately from identity. Ask for notification permission after the user chooses a reminder, and request camera access only at upload time.

Implement OTP expiry and attempt limits, resend cooldown, per-account and network rate limits, session revocation, secure token storage, and logout from all devices. Seller payout changes and admin actions need stronger authentication and audit trails. Never rely on a front-end role toggle for authorization.

Authentication acceptance: opening a product share link, signing in and returning must preserve the original product and intended action. Expired sessions must not silently drop a cart. Duplicate accounts and unavailable old phone numbers need a defined support recovery path.

## 7. Search and discovery

Search structured catalog data before adding generative features. Support title, brand, category, style, color and seller name; normalize synonyms such as tee and T-shirt. Provide separate product and store results. Make filters shareable through web URLs and preserve scroll/filter state when returning from a product.

Filters: category, garment tag size, normalized size, measured waist/chest/length where present, price, condition, brand, color, style, material when known, seller and availability. Unknown measurements must not be fabricated. Explicitly let users include items with missing measurements if useful.

Sort options: relevance, newest, price low to high and high to low. Avoid claiming accurate popularity before sufficient data exists. Default product discovery to available inventory; offer an explicit sold archive in storefronts for inspiration.

No-result recovery: identify the active restrictive filters, let the user remove one, suggest spelling corrections and nearby styles, then offer a saved search. Never silently relax size or budget constraints.

Ranking proposal: retrieve relevant available items, enforce explicit constraints, then rerank using relevance, catalog completeness, freshness, fulfillment reliability and limited seller diversity. Start with transparent rules. Introduce embeddings only when a labeled query set demonstrates improvements over that baseline.

For smaller sellers, reserve an experimental portion of eligible recommendation slots—initially test 10–20%, not a fixed promise—for new or underexposed stores. Maintain relevance and quality thresholds, cap repeated exposure from one seller, and compare conversion and exposure concentration. Small size does not itself imply low prices or high quality.

Evaluate about 100 representative queries with relevance judgments, including exact brands, style phrases, misspellings, size constraints and queries with no valid results. Track NDCG@10, zero-result rate and conversion; use consented real catalog data or clearly marked synthetic fixtures.

## 8. Wishlist and retention

MVP saved items are one collection. Later add named boards such as College Fits or Winter. Preserve sold items for reference and offer available alternatives. Use “find similar” rather than “back in stock” for unique garments unless the same physical item actually returns.

Store follows notify buyers of new listings or drops. Saved searches store a query and filters, then alert only for new eligible listings. Batch alerts and expose channel preferences, quiet hours and unsubscribe controls. Transactional order updates should remain distinguishable from marketing messages.

## 9. Bag, checkout and inventory ownership

Adding to Bag does not reserve inventory. State that clearly. A reservation begins at checkout or a drop claim, after current price and eligibility are rechecked by the server. Proposed starting hold: five minutes, adjustable after testing. Use the same invariant for Buy Now and Bag checkout.

For multiple items from one seller, reserve the requested set atomically or show which items are unavailable and ask the buyer to confirm a reduced order. Never silently remove an item and charge a different basket. Capture immutable item, condition, policy, price and shipping snapshots on the order.

Suggested inventory states: DRAFT, SCHEDULED, AVAILABLE, RESERVED, PAYMENT_PENDING, SOLD, WITHDRAWN. Return inspection determines whether a sold item becomes available again; a refund alone must not relist it.

Suggested order lifecycle: awaiting payment, confirmed, packing, shipped, delivered, closed, with separate cancellation, dispute and return branches. Keep payment, fulfillment and refund states separate: “payment successful” does not mean “delivered.”

Engineering invariants:

- One garment cannot belong to two confirmed purchases.
- Each active reservation has an owner, server expiry and generation/token; stale clients cannot release a newer reservation.
- PostgreSQL owns durable allocation. Use an atomic conditional update or a short row-locking transaction, plus appropriate unique constraints. Redis is not the sole protection against overselling.
- Never keep a database transaction open while a buyer pays. Persist the hold, commit, then interact with the provider.
- Process payment callbacks idempotently; verify signatures, order identity, amount and currency. The browser success redirect is not authoritative.
- A provider request timeout is uncertain, not necessarily failed. Reconcile before offering another charge attempt.
- Expired holds with a payment in flight enter a bounded reconciliation path. If a late successful payment arrives after safe reallocation, never assign the garment twice; initiate and track a refund or manual exception according to provider capabilities.
- Retry jobs safely. Reconcile paid-but-unconfirmed, refund-pending and externally sold exceptions in an admin queue.

PostgreSQL documents row locking and concurrent updates [1]. Stripe documents webhook retries and duplicate-event handling [2]; these principles inform the design, but the final implementation must follow the selected payment provider's own contract.

## 10. Drops and fair access

Use two separate concepts: admission to a busy drop and reservation of a specific item. Admission is permission to shop, not ownership of a garment. For ordinary low-traffic inventory, avoid adding a waiting room.

MVP drops: scheduled publishing, preview pages, reminders, server-controlled release time and atomic item claims. This already solves much of the DM allocation problem. Add a full waiting room when contention or measured demand warrants it; demonstrate it under synthetic load for the portfolio.

Proposed later admission policy: buyers arriving before launch enter a disclosed randomized pre-opening cohort; buyers arriving after launch join FIFO. If pure FIFO is chosen instead, make that rule explicit. Do not mix policies invisibly or sell priority during the pilot.

Flow: preview → sign in and set reminder → waiting room → admitted session → choose available item → obtain short item hold → pay → confirmed order. Failure to claim one item should allow continued browsing while admission remains valid.

Rules: one active queue identity per account per drop; signed short-lived admission token; server time is authoritative; refresh/reconnect restores position; no position reset for app backgrounding within a disclosed grace window; bounded concurrent claims; rate limits and suspicious-activity checks. Do not promise exact wait estimates without a defensible model.

Handle paused or cancelled drops, unavailable stock, missed admission, payment failure, depleted inventory and notifications arriving late. Show “item reserved by another buyer” accurately; do not call it sold until confirmed. A released reservation can trigger a waitlist opportunity, but receiving an alert does not itself reserve the item.

Admin can pause admissions without corrupting in-flight payments. Define a recovery policy and audit each intervention.

## 11. Seller experience

| Screen | Required capabilities |
|---|---|
| Seller application | Store name, contact, social URL, niche, pickup area and consent |
| Ownership and review | Manual proof of store control for pilot, review status, clear reasons for changes |
| Store setup | Logo, banner, story, shipping and approved policy selections |
| Overview | Orders needing action, listing health, upcoming drops and basic earnings |
| Listing editor | Photos, title, category, brand claim, tag size, measurements, condition, flaws, price |
| Inventory | Draft, scheduled, live, reserved, sold, withdrawn; bulk select and external-sale action |
| Drop builder | Select eligible items, preview, schedule, freeze rules and publish |
| Orders | Packing, dispatch, tracking, cancellation request and support context |
| Earnings | Gross sales, fees, refunds, payable balance and settlement state |
| Analytics | Listing views, search exposure, saves, conversion, sell-through and fulfillment |
| Settings | Pickup details, team access later, notification preferences and account security |

Seller onboarding flow: application → verify store control → operations review → create store → upload five draft items → fix missing fields → preview storefront → approve publishing. Payment-provider onboarding is a separate gate before live payouts. Identity verification must not imply garment authentication.

Listing editor should autosave, compress images, preserve original defect evidence and support drafts on weak connections. AI may suggest title, category and style tags; sellers must confirm them. Never have AI assert fabric, authenticity, condition or defect absence without reliable evidence.

No automatic Instagram scraping dependency for launch. Accept seller-owned uploads and a CSV template; consider consented integrations only after checking platform permissions and actual API support. Sellers should be able to mark an external sale immediately. During featured drops, require designated inventory to be exclusive for the event window.

## 12. Trust, fulfillment and support

Trust is part of the core product: actual-item images, mandatory defect disclosure, meaningful measurements, order-linked reviews, tracked dispatch and clear issue resolution. A seller badge should say exactly what was checked.

Before live sales, define policies for undisclosed defects, counterfeit allegations, wrong item, non-delivery, buyer cancellation, fit dissatisfaction, return shipping, seller non-response and refund timing. Validate applicable legal and payment-provider requirements separately; this blueprint does not claim a compliant policy has been established.

Pilot with one shipping workflow: approved seller-provided tracking or one logistics integration. Track dispatch deadline and escalation. Manual operations are acceptable if transparent and recorded; invented delivery estimates are not.

Issue flow: buyer opens order → selects reason → uploads evidence → receives case reference and response expectation → seller responds → admin decides under the published policy → return if required → refund tracked to completion. Keep payout and dispute records reconcilable; do not describe money handling as escrow without a suitable provider arrangement.

Admin changes to refunds, account roles, item ownership, queue intervention and payout details require scoped access and audit logs. Never expose buyer photos or full addresses in general analytics or logs.

## 13. AI features with measurable value

Stage one: catalog-assistance suggestions and similar-item recommendations. Stage two: semantic or image-based discovery and outfit combinations from available listings. Stage three: virtual try-on behind a feature flag.

Distinguish an outfit board, which combines actual garment images, from virtual try-on, which generates an approximation of someone wearing an item. A visual preview is not a fit prediction or proof of garment condition. Keep the original garment photos one tap away.

Google documents a virtual try-on API accepting a person image and product image [3]. Treat this as a candidate to evaluate, not a promise of cost, regional access, perfect fidelity or commercial suitability for every use.

Try-on flow: choose garment → explain consent and retention → use a stock model or upload your own authorized photo → validate input → show asynchronous progress → display a clearly labeled AI preview → save privately or delete. Never auto-publish. Do not require a body photo to shop.

Track generation success, latency, cost per accepted result, garment fidelity and user usefulness. Check color, logos, silhouette, pattern and whether defects disappear. Test only categories supported well enough by the selected model. The item may sell during generation; previewing does not reserve it. Apply per-user quotas and a global spending limit.

Choose an explicit short photo-retention policy before launch, disclose provider processing, and support deletion of originals and derivatives. Do not reuse personal photos for model training without separate, meaningful permission.

## 14. Architecture and data model

Recommended implementation: responsive Next.js web for buyers, sellers and admin; React Native with Expo for the later mobile app; a shared typed API; PostgreSQL; object storage/CDN for garment media; Redis for rate limits, queue acceleration and ephemeral cache; a durable worker for notifications, indexing and reconciliation. Next.js and Expo documentation support their respective web and mobile roles [4][5]. Exact package versions should be selected and locked when implementation begins.

Use a modular monolith. Choose a backend language you can debug confidently—TypeScript is a practical single-language option. A small Python service is justified later if a specific ML workflow requires it. Do not add microservices, Kafka or Kubernetes solely for a resume.

Modules: identity; sellers; catalog; discovery; wishlist; cart; inventory; drops; orders; payments; fulfillment; notifications; moderation; analytics. Keep boundaries explicit even while deploying together.

Core entities: User, AuthIdentity, Seller, SellerMembership, Address, Listing, ListingMedia, Measurement, ConditionDisclosure, InventoryAllocation, Reservation, WishlistItem, SellerFollow, SavedSearch, Drop, DropItem, QueueEntry, Admission, Cart, Order, OrderItemSnapshot, PaymentAttempt, Refund, Shipment, Dispute, Review, NotificationPreference, AuditEvent and OutboxEvent.

Orders and payments have different identifiers. A payment attempt can fail without deleting its order context. Store money in integer minor units and persist currency. Store timestamps in UTC and render local times. Protect seller-owned records by owner membership in the API and database access layer.

Representative API actions: browse/search listings; read storefront; save listing; create checkout reservation; create payment attempt; receive verified webhook; read order; apply as seller; edit own draft; schedule drop; join queue; refresh admission; upload issue evidence. Public listing reads and private order reads need different cache and authorization rules.

Use a transactional outbox for committed domain changes that trigger notifications or indexing. Consumers deduplicate events. If search indexing lags, the product page and checkout still read authoritative inventory. WebSocket or server-sent updates improve availability feedback; polling is a fallback. A real-time UI is not a substitute for atomic checkout.

## 15. Analytics and definitions

North star proposal: weekly delivered orders that remain undisputed after a defined observation window. Report provisional recent cohorts separately from matured cohorts. For earlier traction, also show weekly paying buyers and active selling stores.

| Metric | Definition or rule |
|---|---|
| Booked GMV | Merchandise value of successfully paid orders; state treatment of discounts; exclude shipping and tax |
| Net realized GMV | Booked merchandise value less merchandise refunds and cancellations; use consistent cohorts |
| Seller activation | Approved sellers publishing at least five eligible listings within seven days divided by approved sellers in a matured cohort |
| Search conversion | Sessions with a product-search interaction and a paid order within a declared attribution window divided by search sessions |
| Sell-through | Eligible listings sold within 30 days of publication divided by eligible published listings in a matured cohort |
| Repeat purchase | Buyers purchasing again within 30 days divided by first-time buyers with a complete 30-day observation window |
| Oversell rate | Confirmed allocation conflicts divided by confirmed orders; target zero |
| Queue abandonment | Eligible entrants who voluntarily leave or expire before admission divided by eligible entrants; exclude cancelled/depleted drops and report them separately |
| Seller cancellation | Seller-caused cancellations divided by paid orders |
| Exposure concentration | Share of eligible product impressions received by top-decile sellers, with cohort definition fixed |
| Independent discovery | Paid orders attributed to internal discovery rather than seller referral links; disclose attribution rule |
| Buyer trust | Undisclosed-defect dispute rate, delivery issues and refund completion time |

Events: search_submitted, filter_applied, listing_viewed, listing_saved, seller_followed, checkout_started, reservation_created, reservation_expired, payment_confirmed, order_shipped, order_delivered, dispute_opened, drop_joined, drop_admitted and tryon_completed.

Include event ID, timestamp, session/account pseudonymous ID where appropriate, listing/seller/drop references and experiment assignment. Derive confirmed sales from server events. Never send phone numbers, delivery addresses, payment credentials or personal photos to product analytics.

## 16. MoSCoW and release scope

| Priority | Scope |
|---|---|
| Must for real pilot | Guest browse; auth; seller approval; actual-item catalog; measurements and flaws; search and filters; saved items; store pages; one-seller checkout; atomic inventory; payment reconciliation; shipping visibility; support and admin; event instrumentation |
| Should next | Store follows; saved searches; scheduled drops; reminder controls; verified-purchase reviews; seller analytics; external-sale workflow improvements |
| Could after evidence | Full waiting room; semantic/image search; AI catalog suggestions; outfit boards; virtual try-on; richer collections |
| Will not in first release | Auctions; bargaining chat; unlimited categories; nationwide fulfillment promises; combined multi-seller payments; subscriptions; paid queue priority; automatic authenticity claims |

The resume showcase can contain a tested queue simulation and try-on experiment ahead of commercial rollout, provided they are clearly labeled demo/beta. Customer-facing scope should follow actual need.

## 17. Delivery roadmap and gates

Indicative 12–16 week solo schedule at roughly 15–20 focused hours per week for the web pilot and selected showcase features. This is an estimate, not a deadline promise; production native apps may require another 4–6 weeks or more. Adjust after the first implementation slice.

| Period | Deliverable | Exit gate |
|---|---|---|
| Weeks 1–2 | Buyer research, narrow niche, clickable screens, catalog schema | Observed buyer and seller tasks reveal no unresolved core flow |
| Weeks 3–4 | Auth, seller drafts, image upload, storefronts | Approved seller publishes five complete listings |
| Weeks 5–6 | Buyer search, filters, detail, saved items and bag | Buyer finds an eligible item and reaches review without assistance |
| Weeks 7–8 | Reservations, sandbox payments, orders and admin | Concurrency and payment failure cases preserve allocation invariants |
| Weeks 9–10 | Fulfillment/support, scheduled drops, analytics, consented pilot catalog | Every pilot order has traceable state and support ownership |
| Weeks 11–12 | Load-tested queue demonstration and relevance evaluation | Reproducible report with hardware, workload and limitations |
| Weeks 13–16 | Polish, selected AI experiment, pilot iterations and portfolio evidence | Measured usefulness and documented tradeoffs; cut features if needed |
| Later | Expo app using established APIs | Deep links, session restoration, notifications and payment return paths verified |

Build a thin vertical slice before expanding: one seller publishes one item; one buyer finds, reserves and pays for it; seller ships; buyer can raise an issue. This exposes integration problems much sooner than completing every screen independently.

## 18. Verification and launch gates

High-value tests:

- 100 concurrent reservation attempts for one item produce one active winning allocation.
- Duplicate and out-of-order webhooks do not duplicate orders, fees, inventory transitions or refunds.
- Payment completes after an apparent timeout or hold expiry; reconciliation preserves ownership and funds accounting.
- A stale expiry worker cannot release a newer reservation.
- Two devices signed into one account cannot bypass queue or claim limits.
- Unauthorized sellers cannot read or modify another seller's private records.
- A seller marks an item externally sold while checkout starts; the durable transition chooses one valid outcome and surfaces the conflict.
- Multi-item checkout has defined all-or-confirm-reduced behavior.
- Reconnection restores a queue session; stale admissions cannot purchase after expiry.
- Search can be stale without allowing purchase of unavailable inventory.
- Image deletion removes intended private originals and generated derivatives under the published policy.

Quality targets should be labeled targets until measured: product-page p75 LCP under 2.5 seconds on representative mobile conditions; normal search p95 under 500 ms excluding media; zero oversells in the defined workload. Publish actual measurements and methodology, not just targets.

Accessibility: keyboard navigation, readable contrast, proper labels, screen-reader stock updates, adequate touch targets and no status conveyed solely through color. Error screens must preserve entered form data and offer a recoverable next step.

## 19. Pilot and economics

Proposed pilot: 5–10 willing sellers, 100–200 genuine listings, a focused buyer cohort and one supervised drop. These are planning targets, not current traction. Avoid fake seeded orders and use permissioned media. Keep demo data visibly separate from real catalog inventory.

Recruit through existing research relationships with permission, offer assisted listing setup, and use seller share links and a compact lookbook to acquire initial buyers. Track whether purchases move beyond the seller's existing followers. Observe the first transactions directly with participant consent.

Start with a simple disclosed commission hypothesis and test willingness to pay. Do not publish a permanent fee before modeling support and payment costs. Track per-order contribution as commission and service revenue minus payment costs, shipping subsidy, expected refund/fraud loss, support effort and attributable AI cost. GMV is not revenue or profit.

Do not sell preferential placement during the initial discovery fairness experiment. If promoted listings are introduced later, label them and keep organic measurements separate.

Pilot continuation gate: buyers complete and receive orders; sellers keep stock accurate and accept the workflow; support cases are resolvable; enough contribution remains to justify the operating model. If listings take too long to create, fix seller tooling before buying traffic.

## 20. Resume and portfolio evidence

The strongest project story combines user discovery, a complete transaction, a difficult systems invariant and measured product learning. Preserve a concise research synthesis, screen flows, architecture decisions, API documentation, seeded demo, reproducible concurrency test, search evaluation and anonymized pilot results.

Demo sequence: seller lists a garment with a disclosed flaw; buyer finds it through filters; two buyers contend for it; one gets the hold; payment is reconciled; loser sees an honest state; seller dispatches; admin can inspect the audit trail. Add try-on only after this sequence is reliable.

Resume claims must distinguish researched, designed, implemented, tested and launched. Example after implementation: “Built a seller-fulfilled thrift marketplace with atomic single-item reservations, idempotent payment processing and scheduled drops; validated allocation correctness under [measured workload].” Replace brackets with measured evidence. If no real sales have happened, report usability and engineering results rather than invented GMV or conversion uplift.

## Sources checked

These sources ground narrow implementation references; the product scope, roadmap, metrics and UX above are original proposals requiring validation.

1. PostgreSQL explicit locking: https://www.postgresql.org/docs/current/explicit-locking.html
2. Stripe webhook handling: https://docs.stripe.com/webhooks
3. Google Cloud virtual try-on: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/image/generate-virtual-try-on-images
4. Next.js documentation: https://nextjs.org/docs
5. Expo documentation: https://docs.expo.dev/

