# YOLT user flows

The buyer, seller and admin flows for YOLT, with the state machines behind them. Builds on `Thrift_Platform_Blueprint (1).md` and the choices in `decisions.md`. Screen IDs (B01…) refer to the blueprint's screen inventory.

## 1. Principles

1. **One physical item, one listing.** Stock is 1 (occasionally 2 identical pieces). Any item can sell at any moment. Once sold it moves to **Sold out**: still visible, never buyable again (unless a return is inspected and relisted).
2. **Only the server hands out items.** Every path to buying — Buy Now, bag checkout, accepted offer, drop claim — ends in the same step: **create a hold**. Nothing else reserves an item.
3. **Prepaid, through the platform.** No personal UPI, no COD.
4. **Honest states.** "Reserved by another buyer" is not "sold". "Added to bag" is not reserved.
5. **Keep deals on-platform.** No free chat. Phone numbers, UPI IDs and "DM me" are masked in comments and posts.
6. **Solo-buildable.** Every feature is tagged P0, P1 or P2. Build P0 end to end before touching P1.

## 2. Phases

| Phase | Goal | Scope |
|---|---|---|
| **P0 — pilot** | One seller lists, one buyer finds, pays, receives, can return | Guest browse; OTP login; seller application + KYC; store setup; listing editor; inventory; home, search, filters; product page (PDP); save and follow; bag and prepaid checkout with holds; orders with Shiprocket; not-as-described returns; verified reviews on store; FCFS scheduled drops; admin basics; PWA install and web push |
| **P1 — engagement** | Buyers come back without the seller's Instagram | Structured offers; size returns; following feed; seller photo posts with tagged listings; buyer fit pics (verified); likes and saves on posts; waiting room; Instagram post import; saved searches |
| **P2 — scale** | Video, native app | Reels (video); comments; For You feed ranking; Expo app; authentication partner for sneakers/luxury |
| **Later — not planned** | Only if sellers ask for them | Raffles (free and paid), live auctions |

## 3. Roles and surfaces

- **Guest:** browse, search, view stores and posts, save locally.
- **Buyer:** everything that needs identity: checkout, follow, offers, drops, reviews, fit pics.
- **Seller:** a buyer account with an approved seller profile. Two tracks: **Store** (Instagram thrift page) and **Closet** (individual). One login, workspace switch in the profile menu.
- **Admin:** separate permission, never self-selectable.

**Buyer navigation (mobile web / PWA):** Home · Explore · Drops · Feed · Profile. Header: search, bag, notifications. Saved items live in Profile until usage says otherwise.

**Seller workspace:** Overview · Listings · Drops · Offers (P1) · Orders · Returns · Posts (P1) · Payouts · Store settings.

---

## 4. Buyer flows

### B-F1 Discover (P0)

```
Open link or app → Home (no login needed)
  → Search / Explore category / tap store / tap drop banner
  → Results grid with filters (size, measurements, price, condition, brand, category, seller)
  → Product page
```

- **Home order:** search · live and upcoming drops strip · Fresh finds · In your sizes (only if preferences set) · Stores to discover (small-store slots, see blueprint §7) · Recently viewed.
- Filters and sort are kept in the URL, so shared links reopen the same view. Going back from a product page restores scroll position.
- Search results and category grids use the same pills as store pages: **In stock** (default) · **Sold out** · **Coming soon**. Sold out gives inspiration and trust; buyers see what a store has sold before.
- Zero results: show which filters are restrictive, one-tap remove each; offer "Save this search" (P1).

### B-F2 Product page states (P0)

| Listing state | What the buyer sees | Primary action |
|---|---|---|
| AVAILABLE | Full page | Buy now · Add to bag · Save · Make offer (P1, if seller enabled) |
| SCHEDULED (in a drop) | Preview, countdown, drop rules | Remind me |
| RESERVED | "Reserved by another buyer — may become available again in a few minutes" | Save (notify if released) |
| PAYMENT_PENDING | Same as RESERVED | Save |
| SOLD | Page stays as it was (photos, measurements, flaws) with a "Sold out" badge; appears under the store's Sold out pill; similar available items | Find similar · Visit store |
| WITHDRAWN | "No longer listed" + similar items | Find similar |

Sold-out pages stay live, so share links from Instagram and search engines keep working. They never show a buy button.

**Page contents, top to bottom:** photos (front, back, label, every flaw) · title, price, condition grade + plain-language description · tag size + measured dimensions (flat vs around stated) · flaws with linked photos · brand as *declared by seller*; for sneakers/luxury a "Seller-declared, not authenticated by YOLT" note and proof-of-purchase badge if uploaded · seller card (rating, dispatch time, "verified PAN" badge wording: "Identity verified", never "Authentic") · delivery estimate by pincode + exact shipping cost · return summary (size returns allowed or not for this item) · more from this store · similar items.

### B-F3 Save and follow (P0)

- Guest taps Save → saved locally → on login, merged by listing ID without duplicates.
- Follow store → requires login; triggers: new listings digest, drop announcements.
- Saved item gets RESERVED → no alert. Released back to AVAILABLE → alert "An item you saved is available again". Sold → removed from alerts, kept in Saved with "Sold out" state and "Find similar".

### B-F4 Login (P0)

```
Action needing identity (checkout, follow, offer, drop entry, review)
  → Bottom sheet: phone number → WhatsApp OTP (SMS fallback after 30 s) or Google
  → Back to the exact action that triggered it
```

- New accounts: optional 3-tap preference sheet (sizes, styles). Skippable.
- OTP limits: 5 minute expiry, 3 wrong attempts, resend cooldown, per-number and per-IP rate limits.

### B-F5 Checkout (P0)

```
Bag (grouped by seller) or Buy now
  → Choose one seller group → Checkout
  → Server re-checks price and availability, creates HOLD (5 min) on each item
      ├ all held → continue
      └ some unavailable → "2 of 3 items are still available. Continue with 2?" (never silently drop items)
  → Address + pincode serviceability (Shiprocket)
  → Order review: item snapshots, shipping, total, return policy, hold timer visible
  → Pay (Cashfree: UPI intent / QR, cards, netbanking)
  → Payment status screen
      ├ confirmed by webhook → Order confirmed → seller notified
      ├ failed → retry while hold is valid
      └ unknown / timed out → "Checking your payment" (reconcile before allowing a second charge)
```

- Bag holds nothing and says so: "Items in your bag aren't reserved. Unique pieces can sell."
- One seller per payment in P0. Bag with several sellers checks out one group at a time.
- Hold expires → items return to AVAILABLE; if a late successful payment arrives after the item went to someone else → automatic refund + apology + admin exception record.
- Zero platform fee (D13). Shipping is charged as set by the seller per store (flat fee or free above an amount).

### B-F6 Structured offers (P1)

```
PDP → Make offer → enter amount (seller's hidden floor, e.g. offers under 70% of price auto-declined)
  → Offer sent (expires in 24 h). One active offer per buyer per listing.
Seller: Accept / Decline / Counter (one counter round)
  → Accepted: buyer gets a HOLD at the offer price, 2 h to pay (notification + WhatsApp)
  → Buyer pays via checkout flow B-F5
```

- If anyone buys at list price first, all pending offers auto-decline with the reason.
- Offers are disabled on drop items.
- Rate limits: max N active offers per buyer; repeated lowballs are auto-declined silently to the seller.

### B-F7 Drops (P0: FCFS; P1: waiting room)

Common to all drops:

```
Drop announced (store followers notified) → Drop page: preview items, start time, rules shown plainly
  → "Remind me" (asks for push permission here, not earlier)
  → Drop opens at server time
```

**a. FCFS with hold (P0)**

```
Drop opens → items become claimable → tap Claim → HOLD (5 min) → checkout → paid → SOLD
```

- Live availability via server-sent events; a failed claim ("someone just reserved this") keeps the buyer in the drop to try other items.
- Limit: max 2 active holds per account per drop (seller can set 1).

**b. Waiting room + FCFS (P1)** — seller or admin turns it on for high-demand drops

```
Join before opening (logged in) → randomized order among everyone who joined before start
Join after opening → FIFO behind them
  → Admitted in batches → admission valid for 10 min → claim as in (a)
```

- One queue entry per account per drop. Refresh or reconnect keeps position. The rule text is shown before joining.

Raffles and auctions are out of scope for now (see "Later" in section 2). If they return, they plug into the same hold step, so nothing here needs redesigning.

### B-F8 Orders and tracking (P0)

```
Profile → Orders → Order detail: timeline (Paid → Packed → Shipped → Delivered), tracking, item snapshot, invoice, Help
```

- Updates by WhatsApp and push. Dispatch deadline shown ("Seller ships by 29 Sep").
- Seller misses dispatch deadline + 48 h grace → buyer may cancel for a full refund in one tap.

### B-F9 Returns (P0: not-as-described; P1: size)

```
Order (delivered) → Help → Return or report a problem
  → Reason
      ├ Not as described / damage not disclosed / wrong item → photos required → seller responds in 48 h → accept or admin decides
      ├ Didn't arrive → tracking checked → admin case
      └ Size doesn't fit (P1, only if item was marked "size returns allowed") → must be within 48 h of delivery, unworn, tags/YOLT seal intact
  → Approved → reverse pickup booked through Shiprocket
  → Seller receives, inspects within 48 h → refund released
      └ Seller disputes condition → photos from both → admin decides
  → Refund to original payment method; item back to AVAILABLE only after the seller confirms inspection
```

- Who pays return shipping: not-as-described → seller; size return → buyer (deducted from refund). Platform may cover it in the pilot to test conversion.
- Size returns can be switched off per listing (e.g. altered or fragile vintage); the PDP says so before purchase.
- High-value sneakers/luxury: seller attaches a numbered YOLT tamper tag before shipping and photographs it; returns without the same intact tag are refused. (P2 — needs physical tags.)

### B-F10 Reviews on the store page (P0)

```
Delivered + return window closed (or 7 days) → prompt: rate item accuracy, packing, dispatch speed + optional text + optional photos
  → Review appears on the store page with a snapshot of the item bought (thumbnail, title, size, price)
```

- Only verified purchases. One review per order item. Seller can reply once. Reviews stay even after the listing is sold (they belong to the store, not the listing).
- Store page is one scrolling page, like a thrift page's own site: header (logo, bio, rating, followers, "Identity verified") → upcoming drop banner if any → **filter pills at the top of the grid: In stock · Sold out · Coming soon** (default In stock; pills also show counts, e.g. "Sold out 142") → product grid for the selected pill → **Reviews** at the bottom (rating breakdown, then reviews with the item bought, buyer photos, seller reply). Posts (P1) get their own pill later.
  - **In stock** = AVAILABLE and RESERVED (reserved items show a "Reserved" badge).
  - **Sold out** = SOLD, newest first.
  - **Coming soon** = SCHEDULED items in an upcoming drop, with drop time and "Remind me".
  - The selected pill is kept in the URL (`?status=sold`) so it can be shared and survives going back.

### B-F11 Social feed and fit pics (P1; reels and comments P2)

```
Feed tab → Following (stores you follow, chronological) | For You (P2)
  → Seller post: photos (P1) / reel (P2), caption, up to 10 tagged listings → tap a tag → product page
  → Buyer fit pic: from a delivered order → "Post a fit" → photos + caption → auto-tagged with the purchased item (shows "Sold out", links to similar)
  → Like · Save · Share (link opens web) · Comments (P2)
```

- Fit pics only from verified purchases; they also appear on the store page.
- Comments (P2): phone numbers, UPI IDs, emails and "DM me" patterns masked; "BOOK" or "price?" comments get an automatic reply with the Claim / Buy button.
- Report and block on every post and comment. New closet sellers' posts go through review queue until they have 3 completed sales.

---

## 5. Seller flows

### S-F1 Apply and verify (P0)

```
Profile → Sell on YOLT → choose track
  ├ Store: store name, Instagram handle, niche, pickup city, typical weekly volume
  │   → Instagram ownership check: put a one-time code in bio (or DM it from the handle) → verified
  └ Closet: name, city, what you're selling
  → KYC: PAN (name match) → bank account (penny-drop) → pickup address
  → Cashfree vendor account created → admin review (Store: 1 business day target; Closet: auto-approve after KYC, with stricter moderation on first listings)
  → Approved → Store setup
```

- Status visible at every step with the reason for any rejection.
- GST: ask for GSTIN (optional). Whether sellers without GSTIN can ship out of state depends on legal check L2; build a per-seller "intra-state only" flag now so the rule can be enforced later without a rewrite.

### S-F2 Store setup (P0)

Logo, banner, bio, shipping fee rule, dispatch time (1–3 days), default return settings (size returns on or off), pickup address → preview store → publish.

### S-F3 Create a listing (P0; Instagram import P1)

```
Listings → New
  → Photos (camera or gallery; minimum front, back, label; flaws prompted)
  → Category → brand (declared) → tag size → measurements (fields depend on category; inches/cm; flat or around)
  → Condition grade + description of flaws (required field, "No flaws" must be ticked explicitly)
  → Price → allow offers? (P1) → size returns allowed? → sneakers/luxury: proof-of-purchase upload (optional, shown as badge)
  → Save draft (autosave throughout) → Publish now / Add to drop
```

- Publishing checks completeness (photos, size, measurements, condition) and blocks with a clear list of what's missing.
- **Instagram import (P1):** connect Instagram (official API, needs Meta App Review) → pick posts → each becomes a draft with photos and caption → seller completes size, measurements, condition. Suggested title/category from the caption are marked "Suggested — please check".

### S-F4 Inventory and staying in sync (P0)

```
Listings → filter by Draft · Scheduled · Live · Reserved · Sold · Withdrawn
  → Sold elsewhere (Instagram, in person) → "Mark sold elsewhere" (one tap, bulk select)
```

- If the item is currently RESERVED or PAYMENT_PENDING when the seller marks it sold elsewhere: the action waits; the seller sees "A buyer is paying for this now — you'll be asked to confirm" and the conflict is resolved by admin rules (default: the platform buyer wins if payment completes; the seller gets a strike for double-selling).
- Items in an upcoming drop are locked (exclusive for the drop window).

### S-F5 Create a drop (P0 FCFS; others by phase)

```
Drops → New drop → name, cover, start time
  → Waiting room on or off (P1; for drops you expect to be busy)
  → Select eligible listings (complete, not reserved)
  → Max holds per buyer (1 or 2)
  → Preview as buyer → Schedule
  → Followers notified at announcement and 15 min before start
```

- After scheduling, items are frozen (price and photos locked). Seller can cancel the whole drop before start; after start only admin can pause.

### S-F6 Offers inbox (P1)

List of offers by listing: amount, buyer's rating, time left → Accept · Counter · Decline. Settings: minimum offer %, auto-decline below floor.

### S-F7 Fulfil an order (P0)

```
New order notification (WhatsApp + push) → Orders → Pack
  → Book pickup (Shiprocket label generated from the seller's pickup address; weight/size preset by category)
  → Print or show label → courier picks up → tracking updates arrive by webhook
```

- Dispatch deadline countdown on the order. Missed deadline → reminders → buyer may cancel.
- Seller-initiated cancellation (item damaged, lost) → full refund, reason recorded, counts toward seller cancellation rate.

### S-F8 Handle returns (P0)

Return request → respond within 48 h (accept, or reject with reason and photos) → receive parcel → inspect within 48 h → Confirm OK (refund released, item relisted as AVAILABLE or kept withdrawn) / Dispute (admin).

### S-F9 Payouts (P0)

```
Payouts → balance: pending (in return window) · available · paid
  → Automatic settlement through Cashfree Easy Split after the return window closes
```

- Zero commission at launch; the statement still shows "Platform fee: ₹0" and TCS deducted if L1 applies, so later pricing isn't a surprise.

### S-F10 Posts (P1; reels P2)

Posts → New post → photos (or reel) → caption → tag up to 10 of own live listings → publish or schedule. Insights per post: views, taps on tags, sales from post.

---

## 6. Admin flows (P0 unless noted)

- **Seller review queue:** applications, Instagram check result, KYC status → approve, reject with reason, request changes.
- **Listing moderation:** reported listings, first listings from closet sellers, sneakers/luxury over a price threshold → approve, ask for more photos, remove.
- **Orders and exceptions:** paid-but-unconfirmed, late payment after hold expiry, sold-elsewhere conflicts, missed dispatch.
- **Returns and disputes:** evidence from both sides, decision under published policy, refund tracking.
- **Drops:** live monitor (claims, holds, queue size), pause admissions, cancel drop.
- **Social moderation (P1):** reported posts, fit pics, comments; ban and strike management.
- **Payout reconciliation:** provider settlement reports against orders and refunds.
- Every admin action writes an audit record (who, what, before, after, reason).

---

## 7. State machines

### Listing

```
DRAFT → AVAILABLE ⇄ RESERVED → PAYMENT_PENDING → SOLD (shown as "Sold out", stays visible)
DRAFT → SCHEDULED (in drop) → AVAILABLE (drop opens) / WITHDRAWN (drop cancelled)
AVAILABLE → WITHDRAWN (seller) | SOLD_ELSEWHERE (seller marked)
SOLD → AVAILABLE (only after return inspected OK and seller chooses to relist)
```

### Hold (reservation)

```
ACTIVE (owner, source = checkout|offer|drop_claim, expires_at, version)
  → CONVERTED (payment confirmed) | EXPIRED (timer) | RELEASED (buyer cancelled)
```

One ACTIVE hold per listing, enforced in Postgres (partial unique index on `listing_id WHERE status = 'ACTIVE'`). Expiry jobs compare `version` so a stale job cannot release a newer hold.

### Order

```
AWAITING_PAYMENT → CONFIRMED → PACKED → SHIPPED → DELIVERED → CLOSED (return window over)
Branches: CANCELLED_BY_BUYER (before dispatch deadline miss) · CANCELLED_BY_SELLER · RETURN_REQUESTED → RETURN_IN_TRANSIT → RETURN_RECEIVED → REFUNDED / RETURN_REJECTED → DISPUTE
```

Payment, shipment and refund each keep their own status; the order status is derived from them.

### Offer

```
PENDING → ACCEPTED (creates hold) | COUNTERED → ACCEPTED / DECLINED | DECLINED | EXPIRED | AUTO_DECLINED (item sold / below floor)
```

### Drop

```
DRAFT → SCHEDULED → LIVE → ENDED
SCHEDULED → CANCELLED ; LIVE → PAUSED → LIVE
```

---

## 8. Notifications

| Event | Channel | Phase |
|---|---|---|
| OTP | WhatsApp, SMS fallback | P0 |
| Order confirmed, shipped, delivered, refund | WhatsApp + push | P0 |
| Seller: new order, dispatch deadline, return request | WhatsApp + push | P0 |
| Drop reminder (opted in), drop live | Push | P0 |
| Saved item available again | Push | P0 |
| Offer received, accepted, countered, expiring | Push (+ WhatsApp for accepted) | P1 |
| New posts or listings from followed stores | Daily digest push | P1 |

Transactional messages never carry marketing. Marketing respects quiet hours and opt-out.

---

## 9. Open questions

1. **Questions on listings:** allow public Q&A on a product page ("Is the chest flat or around?"), answered by the seller and visible to all? It keeps chat out while answering sizing doubts. Suggested: yes, P1.
2. **Hold lengths:** 5 min for checkout and drop claims, 2 h for accepted offers. Test with sellers.
3. **Launch geography:** depends on legal check L2 (see `decisions.md`).
4. **Shipping fee:** seller-set, or one platform-wide flat rate for simplicity in the pilot?
5. **Minimum listing quality for closet sellers:** same photo and measurement rules as stores, or lighter?
