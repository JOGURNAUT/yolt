# YOLT — Claude Design brief v2 (complete product)

Paste everything below the line into the Claude Design chat that owns the canvas **"YOLT — Product designs"**.

---

You are designing the complete product UI for **YOLT**, an Indian thrift marketplace that is a real startup about to launch. The web app is already built and working in Next.js. Engineering will rebuild every page **exactly** from your boards, so your boards are the source of truth. Precision beats volume.

Work in **batches**. Do **Batch 1** now. After each batch, stop and reply with:
- what you made;
- any decision you need from me.

When I say **"next"**, do the next batch. When I say **"fix: …"**, revise the boards before moving on. Before each batch, re-read the sections "Rules", "Design contract" and "Decisions".

Revise the existing canvas. Do **not** start a new one. Fix existing boards where they conflict with this brief (the list is under Batch 0), and add the rest.

## 1. The product in one paragraph

Indian thrift today happens in Instagram DMs:
- A store posts a drop and buyers race to comment "BOOK".
- Whoever is first pays a personal UPI QR.
- There are no size filters, scam pages are common and there's no protection.

YOLT is the shop those stores deserve:
- One-of-one secondhand pieces from independent Instagram thrift stores and closet sellers.
- Every piece is measured and every flaw is photographed.
- Payment is prepaid through YOLT, and the buyer's money is protected.
- Drops work like ticket sales: they open on the server's clock, the first to claim gets 5 minutes to pay, and there's a per-buyer limit.

**Main inspiration: Crepdog Crew (crepdogcrew.com).** Take its feel: bold caps headings, confident black-and-white layouts, a dense product grid, curated edits and subtle product hover animations (each card swaps to a second photo on hover). YOLT should feel like Crepdog Crew's younger, thrift sibling.

**But Crepdog Crew sells new streetwear, and YOLT is thrift.** Translate it, don't copy it:
- **One of one:** every piece is unique, so there are no size selectors, no "select size" step and no restock alerts. One piece, one size, one buy button.
- **No MRP:** no strike-through prices, no "Sale", no "% off", no "Up to 50% off" banners. A thrift price is just the price.
- **Honesty is the content:** measurements, condition and photographed flaws are the stars of the product page.
- **Sold out stays visible:** that's a store's track record, not dead stock.
- **Many small stores, not brands:** the store, not the brand, is the main entity. Brands are "declared by seller".
- **Authenticity:** Crepdog Crew sells "authentic" goods. YOLT doesn't authenticate, so never say "authentic" or "verified authentic". "Identity verified" refers to the seller only.
- **No COD or EMI.** Prepaid only, with the buyer's money protected.

Secondary references:
- **Culture Circle:** only for shopping by price bucket ("Under ₹999") and its youth-first tone.
- **Depop / Vinted / Grailed:** resale patterns.
- **BookMyShow:** timed drops.
- **Instagram:** stores and follows.

The look is **street and cute at the same time. This platform is for the youth.**

Positioning line: **"Thrift without the DMs: every piece measured, every flaw shown, your money protected."** We compete on trust and fit, not on being cheapest.

**Audience:**
- Gen Z and young millennials, 18–28, in Indian metros.
- Mostly on mid-range Android phones.
- Most arrive by tapping a link in an Instagram bio or story, so pages open inside **Instagram's in-app browser**.
- Sellers are 1–3 person thrift pages working from their phones.

## 2. Rules (apply to every board)

1. **Honest UI.**
   - Never show fake urgency, "only 2 left", invented discounts or sale banners.
   - Never show invented platform stats ("10,000+ happy buyers"); we're pre-launch.
   - Never imply YOLT authenticated an item. Brands are "declared by seller".
   - Social proof comes only from real data: verified reviews, a store's sold count, real sold items.
2. **No fees.** Buyers never pay a platform or convenience fee. Show it nowhere.
3. **No size returns.** The protection line, everywhere it appears, is word for word: *"No size returns: check the measurements. Full refund if it isn't as described, arrives damaged, or never arrives."* Never write "Fit returns: [seller policy]".
4. **Phone-only sign-in.**
   - Mobile number, then a 6-digit code sent on WhatsApp, with SMS as a fallback.
   - No email and no passwords. Google sign-in comes later, so don't show it.
5. **Status is never colour alone.** Every state also has a text label.
6. **Accessibility:** WCAG AA contrast, touch targets of at least 44 px, real `<button>`, `<a>` and `<input>` with `<label>`.
7. **Copy:** short, warm, honest, a little playful. Indian English, ₹ with Indian digit grouping (₹1,29,900), times in IST ("Sat 11 Oct, 7:00 PM").
8. **Don't invent features.** Scope is in section 5. Anything later is marked in a corner tag on the board: **P1** (next) or **P2** (later). Remove these from the current boards: AI "suggested style tags", "Import CSV", "Analytics", "Continue with email", the notifications bell (comes back with push notifications), and the "Delivering to 403726" header bar.
9. **Photography is the hero.**
   - Seller photos are real phone shots with imperfect light. Use consistent **4:5** crops and neutral surfaces.
   - Use labelled photo placeholders (a tinted 4:5 box with a small "Photo: front" caption) or your garment line icons. Never stock models.

## 3. Design contract (how engineering reads your boards)

Engineering maps your boards straight to code. Follow these conventions exactly.

**Board titles:** `<ID> <Screen> — <route> · <state>`. For example: `B3.2 Store page — /s/[handle] · Sold out tab`. The routes are listed in section 5. Keep them exactly.

**Canvas pages, in this order (rename and regroup the current pages):**
- 00 Foundations
- 01 Landing & home
- 02 Store & product
- 03 Search & explore
- 04 Sign-in, bag & checkout
- 05 Orders, protection & reviews
- 06 Drops
- 07 Seller: catalog & store
- 08 Seller: orders & money
- 09 Admin
- 10 System & PWA
- 11 Desktop

**Sizes:**
- Mobile boards are 390 wide.
- Desktop boards are 1280 wide, with a content max-width of **1200** and a 24 px gutter.
- Show the mobile bottom nav and header on every buyer screen that has them.

**Tokens** (Batch 1 defines the values; use these names verbatim, light **and** dark):

| Token | Use |
|---|---|
| `background` | page ground |
| `surface` | cards, sheets, inputs |
| `surface-2` | sunken / secondary panels, skeletons |
| `foreground` | primary text, primary button fill |
| `muted` | secondary text (must pass 4.5:1 on background and surface) |
| `line` | borders and dividers |
| `accent` | the subtle accent: stickers, sparkles, active pill, "Live now" stamp, link underline (small areas only; black `foreground` is the brand colour) |
| `accent-2` | optional second subtle accent |
| `on-accent` | text on accent |
| `success` / `on-success` | paid, delivered, available |
| `warning` / `on-warning` | reserved, pending |
| `danger` / `on-danger` | errors, sold-out labels if used, destructive actions |
| `info` | neutral notices |

**Type scale names:** `display-xl`, `display`, `h1`, `h2`, `h3`, `body-lg`, `body`, `small`, `caption`, `mono` (timers, order IDs). Give each one its font, size, line height, weight and tracking, at mobile and desktop sizes.

**Other tokens:**
- **Radius:** `sm` 8, `md` 12, `lg` 16, `xl` 24, `pill`. Adjust the values if your direction needs to, but keep the names.
- **Spacing:** a 4 px grid.
- **Shadow:** `raised` and `overlay` only.
- **Motion:** `fast` 120 ms and `base` 200 ms, one easing curve. Everything must respect reduced motion.
- **Fonts:** Google Fonts only (engineering uses next/font).
- **Icons:** Lucide, at 1.75 stroke. Write the Lucide icon name in a caption the first time each icon appears in the component sheet.

**Motion spec.** Subtle, quick and fun, like Crepdog Crew's product hovers. Show each one as a small before → after frame pair in the component sheet, with its duration and easing.
- **Desktop hover only.** Instagram's in-app browser and phones have no hover, so every hover has a tap or press equivalent, and nothing important hides behind hover.
- **`ProductCard` hover:**
  - The image crossfades from the **front** photo to the **back** photo (clothing always has one), 200 ms.
  - The image scales to 1.03, 300 ms.
  - The card lifts 2 px.
  - The hang-tag price swings gently (about −4° → 0°, 400 ms).
  - A slim **Add to bag** bar slides up from the bottom of the image.
  - Sold-out cards show **Find similar** instead.
  - Reserved cards show no add bar.
- **`ProductCard` press (mobile):** scale 0.98, and the save heart pops.
- **Save:** the heart pops (0.8 → 1.15 → 1) with a tiny 3-sparkle burst. Un-save has no burst.
- **Buttons:** primary buttons have a hard offset "sticker" shadow that collapses on press (translate 2 px). Press scale 0.97.
- **Style and category tiles:** the image zooms to 1.05 and the caps label gets an underline wipe.
- **`DropTicket`:** the "Live now" stamp wobbles once when it appears; `Countdown` digits flip; the opening moment flips the cards to Claim with a short stagger.
- **`AnnouncementTicker`:** a slow marquee that pauses on hover or touch.
- **Toasts and sheets:** slide and fade, 200 ms.
- **Reduced motion:** everything becomes instant or a plain crossfade. No marquee, no wobble, no swing.

**Components:** name them exactly as below, in the component sheet and in the handoff notes. Engineering builds one React component per name.

`Header`, `BottomNav`, `SearchBar`, `AnnouncementTicker`, `HeroCarousel` (with `HeroSlide`), `Button` (primary / secondary / ghost / danger; sm / md / lg; loading; disabled), `IconButton`, `StatusBadge` (Available, Reserved, Sold out, Coming soon, Removed), `StockPills` (In stock · Sold out · Coming soon, with counts), `FilterChip` (removable), `FilterSheet`, `SortMenu`, `ProductCard` (available, reserved, sold out, coming soon, removed, saved/unsaved), `ProductGrid`, `StoreCard`, `StoreHeader`, `VerifiedBadge` (tooltip: "PAN and bank checked. Items are not authenticated by YOLT."), `DropTicket` (upcoming, live, ended), `Countdown`, `MeasurementTable` (flat/around note, cm and in), `ConditionBlock`, `FlawList`, `PhotoGallery` (with Flaw tag), `SellerCard`, `PincodeCheck` (idle, checking, delivers, not serviceable, invalid), `ProtectionNote`, `PriceSummary`, `AddressCard`, `AddressForm`, `HoldTimer`, `PaymentStatus`, `OrderTimeline`, `ReviewCard`, `RatingBreakdown`, `Stars`, `ReviewForm`, `ClaimSheet`, `ClaimStatus`, `EmptyState`, `Toast`, `BottomSheet`, `Dialog`, `OtpInput`, `PhoneInput`, `Skeleton` (card, row, page), `InstallCard`, `PushPrompt`, `SellerNav` (desktop sidebar and mobile tabs), `ListingRow`, `PublishChecklist`, `PhotoSlots`, `DataTable` (admin), `AdminNav`.

**Handoff sticky:** at the end of each canvas page, add one sticky note that lists:
- each board's route;
- the components used;
- every state shown;
- any copy that's an exact string engineering must use.

## 4. Decisions you must follow (some current boards contradict them)

- **Drops:** buyers can't claim before the drop opens. When it opens, first to claim gets a 5-minute hold to pay, and the per-buyer limit is 1 or 2, set by the seller. There's no waiting room and no "your place in line" yet.
  - Board **D2 Waiting room** moves to page 06, tagged **P1**.
  - Fix **D3 Live drop** so it has no "your shopping time 8:41" timer. Its live states are Claim → "Claiming…" → checkout, plus these toasts: "Someone just reserved this. Try another piece." and "You can hold 2 pieces from this drop at a time. Pay for yours first."
- **Holds:** checkout reserves items for **5:00**. A bag doesn't reserve anything, and says so: "Items in your bag aren't reserved. Unique pieces can sell."
- **Store checkout:** one store per payment. A bag with items from several stores checks out one store at a time.
- **Shipping:** set per store as a flat fee, free above an amount. In the sample data that's ₹79, free above ₹1,999. The first-order free-shipping badge is **P1**.
- **Fees:** sellers pay ₹0 commission during the pilot. Seller-facing money screens label each order **"Your link"** (₹0 forever, because the buyer came through the seller's own link) or **"Found on YOLT"** (₹0 in the pilot). Never show a [COMMISSION] placeholder; show ₹0 with "Pilot: no commission".
- **Buyer protection:**
  - Report within **48 h of delivery**, or 10 days after shipping if the parcel never arrives.
  - Reasons: not as described · arrived damaged · wrong item · never arrived.
  - Photos are required except for "never arrived".
  - The seller accepts (full refund of item price plus shipping) or disputes, and then YOLT decides.
  - The buyer can withdraw while the report is open.
- **Late dispatch:** if the seller misses the dispatch deadline by 48 h, the buyer gets a one-tap "Cancel for a full refund".
- **Reviews:** verified purchases only. They're left from the order page after delivery and shown on the **store** page with the item bought. The seller can reply once.
- **Sold items** stay visible at their own URL under the Sold out pill. They never have a buy button.
- **Seller onboarding:** for the pilot, YOLT staff onboard stores from the admin area. `/sell` is a seller landing page with "Apply to sell" (a short form), not a self-serve signup.

## 5. Scope: every screen, by batch

The sample data matches the local app, so use it everywhere:
- **Store:** **Second Loop** @secondloop.thrift, Pune. "Hand-picked vintage & streetwear. Washed, steamed, shipped in 2 days." ★ 4.8 (212 reviews), 18.4k followers. Ships in 2 days. Shipping ₹79, free above ₹1,999.
- **Other stores:** Kinda Vintage (90s casualwear, Bengaluru), Old Thread Co. (tailoring and trousers, Mumbai), Loop Goods (reworked denim, Delhi).
- **Items:**
  - Vintage Levi's 501 jeans, W32 L32, waist 41 cm flat, length 104, Good, "Small bleach spot near left back pocket (photo 5)", ₹1,299.
  - Oversized Carhartt workwear jacket, brown, L, chest 64 flat, Like new, no flaws, ₹2,450.
  - Y2K graphic baby tee, S, chest 42 flat, Good, ₹549.
  - Nike Air Force 1 '07, UK 8, Fair, "Creasing on toe box, yellowing on sole edge", ₹3,200.
  - Mini shoulder bag, beige faux leather, Like new, ₹799.
  - Striped rugby polo, navy and cream, M, ₹899.
  - Corduroy wide-leg trousers, olive, W30, ₹999.
  - Wool cable-knit sweater, cream, L, ₹1,149.
  - 90s windbreaker, teal and purple, XL, ₹1,499.
  - Varsity bomber, red and white, M, ₹2,799.
- **Drop:** **Winter Vintage Drop** by Second Loop, Sat 11 Oct, 7:00 PM IST, 3 pieces, max 2 per person.
- **Buyer:** Ananya, +91 98765 43210, "Flat 12, Sunrise Apartments, Koregaon Park, Pune 411001, Maharashtra".
- **Review:** "Exactly as described, even the tiny spot was shown. Packed so well!" ★★★★★, on the Levi's.
- **Order:** YLT-7K2Q9M.

---

### Batch 0 — fix the existing boards first (do this as part of Batch 1)

Rename these to the new page structure and fix them:
- **01 Home (Main):** remove the notifications bell and the pincode bar. Replace "Monsoon layers" with real content (see Batch 2). Rename the stores to the sample stores.
- **02 Search:** add `StockPills` under the tabs. Change the "sold items hidden" copy to follow the pills.
- **03 Product:** remove "Fit returns: [SELLER RETURN POLICY]". Use the exact protection line. Change "Store ownership verified" to the `VerifiedBadge` wording. Show seller ★ rating instead of "No reviews yet" (the store has 212 reviews).
- **04 Bag:** keep the structure and use the exact bag-not-reserved line.
- **05 Order review:** remove the fit-returns line. Remove "Test mode" (dev only). Keep the 5:00 hold timer.
- **A2 Sign in:** remove "Continue with email". The button reads "Send code on WhatsApp", with an SMS fallback (Batch 5).
- **D1, D2, D3:** follow the Drops decision in section 4.
- **P2 Report a problem:** remove the fit-returns line. Add the 48 h window line.
- **S1 Overview:** remove the [COMMISSION] and [BALANCE] placeholders (see Fees). Change "Items lock for editing 24 hours before" to "Items are locked once the drop is scheduled".
- **S2 Listings:** remove "Import CSV" and "Analytics" from the nav.
- **S3 Listing editor:** remove the suggested style tags.
- **W1–W3:** align with the above.

### Batch 1 — Foundations (page 00)

1. **Brand direction: "Street × cute".** This replaces the current Fraunces and cream look. YOLT should look like Crepdog Crew's younger thrift sibling: an Indian youth streetwear startup, with a soft, cute, friendly layer, so it's never cold or intimidating. Two halves:
   - **Colour: black and white.**
     - The base is white ground and black ink. Use near-black and near-white, not grey mush.
     - Black is the primary button and the brand. Dark mode inverts it.
     - **Subtle accents only.** One or two accent colours, used small: a sticker, the sparkle on save, the "Live now" stamp, an active pill, a link underline, the shop-your-size tape. Never large fills or backgrounds.
     - The product photos supply most of the colour.
     - Status colours (`success`, `warning`, `danger`) are muted, always paired with a text label, and used only for status.
   - **Street:** a bold grotesk display set in caps (e.g. Archivo Black or Archivo Expanded, Bricolage Grotesque, Big Shoulders Display); hard black-and-white contrast; hard edges where they count; utility details (hang-tag price labels, measuring-tape rule lines, stamp-style badges).
   - **Cute:** a friendly rounded sans body (e.g. DM Sans, Plus Jakarta Sans, Nunito Sans); sticker-style badges (a white die-cut outline, slightly rotated); tiny doodle accents (stars, sparkles, squiggles, arrows) used sparingly; chunky rounded corners on cards and buttons; playful micro-interactions. The cute comes from shape and motion, not from colour.
   - **Never:** childish, a pastel wash, cartoon mascots, or emoji as UI.

   Show **two variants of this one direction** side by side. Both are black and white; they differ in type pairing and in which subtle accent they use (for example a soft lilac vs a lime, or a bubblegum vs a butter). Each gets a wordmark, palette (light and dark), type pairing, a product card in its hover state, a button set, a sticker badge set and a mini landing hero. Recommend one and say why. If I don't pick before "next", use your recommendation.
2. **Signature brand devices**, used consistently across the product:
   - **Thrift hang tag:** a price-tag shape with a punched hole and string, for price labels, drop tickets and empty states.
   - **Stickers:** die-cut badges for states and promises ("Every flaw shown", "Live now", "Sold out", "1 of 1").

   Propose better ones if you have them.
3. **Tokens board:** every token from section 3 as a table of name → light hex → dark hex → contrast ratio on its usual pair. Also the type scale, radius, spacing, shadows and motion.
4. **Component sheet:** every component in section 3, in every listed variant and state, light and dark.
5. **Iconography and imagery rules:** the Lucide set, photo-placeholder style, 4:5 crop rules, and how product photos sit on `surface`.

### Batch 2 — Landing page and home (page 01). Make this one stunning.

**B2.1 Landing (guest) — `/`**, mobile 390 and desktop 1280. This is the first thing a buyer or seller sees from an Instagram link, so it must look like a top-tier streetwear startup site. It must also stay useful, with no empty hype.

**First-screen budget (hard rule):** the opening screen must **not** be all hero. It shows a good ratio of hero and products: roughly **55% hero, 45% trending products**.
- **Mobile, 390 × 844 viewport:**
  - ticker ≤ 28 px;
  - header with search ≤ 112 px;
  - hero about 330–360 px tall;
  - then the "Trending now" heading and the **full images of the first two product cards** must be visible without scrolling.
- **Desktop, 1280 × 800 viewport:**
  - the hero is at most 440 px tall;
  - the Trending row's product images are visible above the fold.

On every landing board, draw a dashed line at the fold (844 on mobile, 800 on desktop) so this can be checked.

Sections top to bottom:
1. **`AnnouncementTicker`:** a slow marquee of **real** facts only: "Winter Vintage Drop · Sat 11 Oct, 7:00 PM IST", "Every flaw photographed", "Pay safely through YOLT. Never a personal UPI QR". It pauses on touch and stops for reduced motion.
2. **`Header`:**
   - Wordmark, bag with count, Sign in.
   - On mobile, a compact `SearchBar` ("Search jackets, denim, stores…") as a second row that stays sticky while scrolling.
   - On desktop, the search sits inline with Explore · Drops · Stores · Sell on YOLT.
3. **`HeroCarousel`**: a dedicated hero section with **5 slides**, in Crepdog Crew's campaign-banner style. Compact, within the first-screen budget.

   **Each slide** has:
   - a big photo or a collage of product photos;
   - a caps display headline;
   - one short line of text;
   - one CTA;
   - optionally a sticker (e.g. "LIVE NOW", "1 OF 1").

   **Slide content.** Every slide is backed by real data or a real promise, never a fake sale:
   1. **Brand slide:** "THRIFT WITHOUT THE DMs." with the sub "One-of-one pieces from India's best Instagram thrift stores. Measured, flaws shown, paid safely." Visual: a collage of 3–5 product photos (4:5) with hang-tag prices. CTA **Shop fresh finds**.
   2. **Drop slide** (from the next live or upcoming drop): "WINTER VINTAGE DROP" with "Sat 11 Oct · 7:00 PM IST · 3 pieces", a live `Countdown` and a ticket-stub motif. CTA **Remind me**, or **Claim now** once it's live. When there's no drop, the slide is left out.
   3. **Store spotlight slide** (a featured store): its cover photo, "SECOND LOOP · PUNE", the store's bio line, `VerifiedBadge` and ★ 4.8. CTA **Visit store**.
   4. **Edit slide** (a curated category or style, e.g. "WINTER LAYERS" or "Y2K"): 3–4 real pieces from that edit. CTA **Shop the edit**.
   5. **Fit slide:** "MEASURED, NOT GUESSED." with the tape-measure motif. CTA **Shop your size** (scrolls to that module).

   A **seller slide** ("RUN A THRIFT PAGE? STOP SELLING IN DMs." → **Bring your store**) is an optional 6th slide, or it replaces slide 4 when there's no edit.

   **Behaviour:**
   - Autoplay every 6 s, with a thin progress bar per slide (story-style segments at the top on mobile, dots plus arrows on desktop).
   - Swipe on mobile; arrow keys and visible prev/next buttons on desktop.
   - Pauses on hover, touch or focus, and has a visible **pause/play** button (an accessibility requirement).
   - **No autoplay with reduced motion.**
   - Slides crossfade or slide in 400 ms. The text animates in with a small stagger.
   - The first slide's image loads first (it's the largest content on the page); the others load lazily.

   **Sizes:**
   - **Mobile:** about 358 × 340, inset 16 px with `xl` corners, or edge to edge at 390 × 340 (your call).
   - **Desktop:** design two options and recommend one:
     - **(a) Full width:** 1200 × 440.
     - **(b) Bento, Crepdog Crew style:** the carousel takes about 8 of 12 columns at 440 tall, and a right rail stacks **2 Grail tiles** (big photo, title, hang-tag price, "1 OF 1" sticker).

   Show every slide as its own board, plus a mobile board showing the progress segments and the paused state.
4. **Trending now:** directly under the hero, inside the first screen.
   - A horizontal scroller of `ProductCard`s on mobile (about 1.6 cards visible, so it's clearly scrollable) and a 5-up row on desktop, with "See all".
   - **What "trending" means, said honestly** in a caption: "Most saved this week".
   - If there isn't enough save data yet, the same row shows the newest pieces under the title **"Just dropped"**.
   - Cards get a small "TRENDING" sticker only when they really are among the most saved.
5. **Grails:** "GRAILS · picked by YOLT".
   - Standout one-of-one finds, curated by YOLT staff in the admin area.
   - Bigger cards than the standard grid (2-up on mobile, 4-up on desktop, or one large and two small), each with a "1 OF 1" sticker, the store name and a hang-tag price.
   - When nothing is curated, hide the section. Never fake it with an automatic "grails" label.
   - On desktop bento (option b) the hero rail shows the first two Grails, and this section shows the rest.
6. **Drops strip:** `DropTicket` cards styled like ticket stubs (perforated edge, store, date and time in IST, piece count, Remind me / Preview). Live drops show a "Live now" stamp and "Claim now". When there are no drops, hide the strip; don't show an empty state.
7. **Shop your size:**
   - Pick a tag size, or enter chest or waist in cm, and see "Measured pieces that fit".
   - Quick size chips: S · M · L · XL · Waist 30 · UK 8.
   - Show it as a compact interactive card with a tape-measure motif.
   - It links to `/search?size=…` or `/search?chestMin=…`.
   - This is our differentiator, so make it feel special.
8. **Fresh finds:** `ProductGrid` of 8 (two columns on mobile, four on desktop) with "See all".
9. **Why YOLT:** three honest promises with an icon and one line each: **Measured, not guessed** · **Every flaw shown** · **Your money protected** (links to `/legal/buyer-protection`). No numbers.
10. **Shop by price** (Culture Circle style, made for a price-sensitive India): chunky hang-tag tiles **Under ₹499 · Under ₹999 · Under ₹1,999 · ₹2,000+**, linking to `/search?maxPrice=…`. Prices must be honest (no strike-through "was" prices; thrift has no MRP).
11. **Shop by style:** big image tiles with caps labels: Streetwear, Y2K, Workwear, Denim, Vintage sports, Kurtas & ethnic, Sneakers, Bags. They link to search.
12. **Stores to discover:** `StoreCard` (cover, avatar, name, city, niche, `VerifiedBadge`, ★ and review count, 3 item thumbnails, Follow). A horizontal scroller on mobile, a 3-up grid on desktop.
13. **Just found a home:** a strip of real recently sold pieces, muted, with "Sold out" badges and the store name. It's honest proof the marketplace is alive. Tapping a piece opens the sold product page.
14. **For sellers band:** dark, high-contrast. "Run a thrift page? Stop selling in DMs." Three points: no DM queue or screenshots · payments and tracking handled · **₹0 commission on buyers from your own link**. CTA **Bring your store** → `/sell`.
15. **Footer:** a big wordmark; links (Explore, Drops, Stores, Sell on YOLT, Buyer protection, Terms, Privacy, Grievance officer, Instagram); "Made in India".

Also design:
- **B2.2 Home (signed in) — `/`:** less marketing.
  - Greeting.
  - Drops strip.
  - "New from stores you follow" (empty state: "Follow stores to see their new pieces here" with suggested stores).
  - "In your sizes" (only when preferences are set, otherwise a one-tap "Set your sizes" card).
  - Fresh finds.
  - Recently viewed.
  - Stores to discover.
- **B2.3 Loading skeleton** of the landing page.
- **B2.4 Welcome + preferences** (existing A1 and A3), restyled and moved here. Preferences are optional and skippable.

### Batch 3 — Store and product (page 02)

**B3.1–B3.6 Store page — `/s/[handle]`.** Instagram bios link here, so this is the most important page for sellers.
- **`StoreHeader`:** cover/banner, logo, name, @instagram handle (it links out), city, bio, `VerifiedBadge`, ★ rating with review count, follower count, **Follow** / Following, **Share store**, and "Ships in 2 days · Shipping ₹79, free above ₹1,999".
- An upcoming-drop `DropTicket`, if there is one.
- `StockPills` at the top of the grid with counts: "In stock 38 · Sold out 142 · Coming soon 12". The pill is kept in the URL (`?status=sold`).
- The grid for the selected pill. In stock includes Reserved items with the badge.
- **Reviews** at the bottom:
  - A `RatingBreakdown` (overall, plus a "matched the listing" score).
  - `ReviewCard`s showing first name, stars, date, text, up to 3 buyer photos, the item bought (thumbnail, title, size, price), and the seller reply.
  - "Show more".
- **States, one board each:**
  - In stock tab;
  - Sold out tab (muted cards);
  - Coming soon tab (cards show the drop time);
  - empty pill ("Nothing coming soon yet. Follow to hear about the next drop.");
  - store with no reviews yet;
  - desktop 1280 (grid with a sticky store sidebar or a wide header; your call).

**B3.7–B3.12 Product page — `/p/[slug]`.** Keep the current order and polish it:
1. Gallery (front, back, label, flaw close-ups tagged "Flaw"; swipe on mobile, thumbnails on desktop; tap to zoom).
2. Title, price.
3. `ConditionBlock` (grade and its exact meaning, below).
4. Tag size and `MeasurementTable` (cm and in; "Measured flat, one side. Double chest, waist and hip to compare with a tape measure around you." or "Measured all the way around.").
5. `FlawList`, always present: the listed flaws with links to their photos, or "Seller confirmed: no flaws."
6. Brand, "(declared by seller)". For sneakers and bags, add "Seller-declared, not authenticated by YOLT."
7. `SellerCard`.
8. `PincodeCheck`.
9. Shipping cost.
10. `ProtectionNote`.
11. A sticky bottom bar: Save · Add to bag · **Buy now · ₹1,299**.
12. More from this store.
13. Similar pieces.

States, one board each:
- **Available.**
- **Reserved:** no buy button. "Reserved by another buyer. It may become available again in a few minutes if they don't complete payment." Save is still available.
- **Sold out:** a banner "Sold out. This piece found a home." Photos and details stay. **Find similar pieces** and **See what's in stock at Second Loop**.
- **Coming soon:** "Coming soon in Winter Vintage Drop, Sat 11 Oct, 7:00 PM", a `Countdown`, and **Go to the drop**.
- **Removed:** "No longer listed."
- **Desktop 1280.**

Condition meanings (exact):
- **New with tags:** Never worn, original tags attached.
- **Like new:** Worn a few times, no visible wear.
- **Good:** Gently used. Any wear is listed below with photos.
- **Fair:** Visible wear. Every flaw is listed below with photos.

### Batch 4 — Search, explore and drops list (page 03)

- **B4.1 Search results — `/search?q=`:**
  - Products and Stores tabs.
  - `StockPills`.
  - Active `FilterChip`s, each one-tap removable.
  - A result count and `SortMenu` (Relevance · Newest · Price low–high · Price high–low).
- **B4.2 `FilterSheet`:**
  - Category (14: T-shirts & tops, Shirts, Sweaters & knitwear, Jackets & coats, Dresses, Kurtas & ethnic, Jeans, Trousers, Shorts, Skirts, Sneakers, Other footwear, Bags, Accessories).
  - Tag size.
  - Measurement ranges (chest, waist, length in cm, with the note "We compare flat and all-round measurements for you").
  - Price range.
  - Condition.
  - Brand.
  - Store.
  - "Include items without measurements".
  - Sticky "Show 48 pieces" button and "Clear all".
- **B4.3 Zero results:** "No pieces match all your filters." Each restrictive filter appears as a removable chip, and close matches are suggested.
- **B4.4 Typo-tolerant results:** a "Showing results for 'carhart'" note.
- **B4.5 Explore — `/search` with no query:** category tiles, styles, sizes and stores. This is the bottom-nav Explore tab.
- **B4.6 Drops list — `/drops`:** Live now · Upcoming · Recently ended, as `DropTicket`s. Empty state.
- **B4.7 Desktop search 1280** with a left filter sidebar.

### Batch 5 — Sign-in, bag and checkout (page 04)

- **B5.1–B5.6 Sign in — `/login?next=`**, a page on desktop and a `BottomSheet` when triggered from an action.
  - Context line: "Sign in to buy this piece" / "…to follow Second Loop" / "…to get a reminder".
  - Step 1: `PhoneInput` with a +91 prefix, and **Send code on WhatsApp**.
  - Step 2: "Code sent on WhatsApp to +91 98765 43210 · Change", `OtpInput` (6 boxes, paste and autofill), **Sign in**, "Resend in 0:28" → "Resend code", and "Send by SMS instead".
  - Errors, one board each: wrong code ("That code didn't match. 2 tries left."), code expired ("That code expired. We've sent a new one." or a Resend button), too many tries ("Too many tries. Ask for a new code."), too many requests ("Too many codes requested. Try again in an hour."), invalid number.
  - After sign-in the buyer returns to exactly where they were.
- **B5.7 Bag — `/bag`:**
  - Grouped by store. Each group has its items, subtotal, shipping and **Check out from Second Loop**.
  - Items no longer available show "Sold to another buyer" or "Reserved right now", with Remove and Find similar.
  - The bag-not-reserved note.
  - Empty bag.
  - The bundling nudge (P1 tag): "Add one more piece from Second Loop and save ₹79 shipping".
- **B5.8–B5.16 Checkout — `/checkout/[orderId]`**, one page in steps, with a `HoldTimer` "Reserved for you · 4:59" pinned at the top.
  - **Partial availability:** "2 of 3 pieces are still available. Continue with 2?"
  - **Address:**
    - Saved `AddressCard`s (one is the default) and Add new.
    - `AddressForm` fields: full name, mobile, flat/house and street, area/locality, landmark (optional), pincode (city and state autofill), city, state dropdown.
    - Serviceability result: "Delivers to 411001 in 3–5 days", or "We can't deliver to this pincode yet."
  - **Review and pay:** item snapshots, `PriceSummary` (items, shipping or Free, **Total**), `ProtectionNote`, payment options (UPI apps as generic buttons, cards, netbanking), and **Pay ₹1,378**.
  - **`PaymentStatus` boards, one each:**
    - Processing: "Checking your payment. Don't pay again."
    - Success: "They're yours." plus the order reference and "Ships by Mon 13 Oct" (restyle the existing Confirmation board).
    - Failed: "Payment failed. You can try again." while the hold lasts.
    - Hold expired: "Your reservation ran out, so the piece went back on sale."
    - Left checkout: "You left checkout. The piece is back in stock."
    - Late payment refunded: "Your payment arrived after the reservation ended and the piece went to someone else. A full refund has started."
- **B5.17 Desktop checkout 1280:** two columns, with the summary on the right.

### Batch 6 — Orders, protection, reviews, saved and profile (page 05)

- **B6.1 Profile — `/account`** (new route; it's the bottom-nav Profile tab):
  - Name and phone.
  - Orders.
  - Addresses.
  - Saved.
  - Following.
  - **Sell on YOLT**, or **Switch to seller workspace** if the user is a seller.
  - Help.
  - Legal.
  - Sign out.
  - Sign out of all devices.
- **B6.2 Orders — `/orders`:** cards with the store, item thumbnails, status, date and total. Empty state.
- **B6.3–B6.9 Order detail — `/orders/[id]`:**
  - `OrderTimeline`: Paid → Packed → Shipped → Delivered.
  - The courier and AWB number with **Track**.
  - The item snapshot ("Listing as you bought it").
  - The address.
  - Price summary.
  - Help.

  States, one board each:
  - confirmed ("Second Loop ships by Mon 13 Oct");
  - shipped (with tracking events);
  - delivered (with "Report a problem · 47 h left" and the review form);
  - late dispatch ("Second Loop missed the dispatch deadline. **Cancel for a full refund**");
  - cancelled and refunded;
  - delivered with an open claim.
- **B6.10–B6.11 `ReviewForm`:** overall stars, "Matched the listing" stars, optional text and up to 3 photos, one per item. Plus the submitted state.
- **B6.12–B6.17 Report a problem `ClaimSheet`:**
  - Reason (4).
  - Description.
  - Photos (required except for "never arrived"; "Location data is removed from photos").
  - What happens next.
  - Submit.

  `ClaimStatus` states: Open ("Waiting for Second Loop to respond"), Seller accepted / Refunded, Escalated ("YOLT is reviewing both sides"), Rejected (with the reason), Withdrawn. The buyer can **Withdraw report** while it's open.
- **B6.18 Saved — `/saved`:**
  - Saved pieces with their states. Sold ones show "Sold out" and Find similar.
  - A "Following" tab with stores and Unfollow.
  - Guest state: "Saved on this device. Sign in to keep them everywhere."
- **B6.19 Addresses — `/account/addresses`.**

### Batch 7 — Drops (page 06)

**B7.1–B7.6 Drop page — `/d/[id]`:**
- **Before it opens:**
  - Cover, store, title, date and time in IST, and a big `Countdown` (on the server's clock).
  - Rules in plain words: "Opens at 7:00 PM IST. First to claim gets 5 minutes to pay. Max 2 pieces per person."
  - The preview grid, with every card showing "Coming soon".
  - **Remind me** → "Reminder set ✓".
  - Share.
- **Opening moment:** cards flip to **Claim** without a reload. Show the transition.
- **Live:**
  - "The drop is open. First to claim gets 5 minutes to pay."
  - Cards flip live between Claim, Claiming…, Reserved and Sold.
  - The two toasts from section 4.
- **Signed out:** Claim → sign-in sheet → back to the drop.
- **Ended:** "This drop has ended", sold pieces muted, and "Follow Second Loop for the next one".
- **Cancelled:** "Second Loop cancelled this drop."

Also on this page:
- **B7.7** Desktop 1280.
- **B7.8** Waiting room (P1 tag, the existing D2, restyled).

### Batch 8 — Seller: catalog and store (page 07)

Seller workspace, mobile 390 **and** desktop 1280. The nav is Overview · Listings · Drops · Orders · Reviews · Payouts · Store settings, plus **Switch to shopping**.

- **B8.1 Overview — `/seller`:**
  - Orders to ship, sorted by deadline, with overdue flagged.
  - Open buyer reports (respond within 48 h).
  - Drafts that are incomplete.
  - The next drop.
  - **Copy store link**, with the tooltip "Buyers who come through your link are yours: no commission on their orders."
  - **New listing**.
  - "Mark sold elsewhere" shortcut.
- **B8.2 Listings — `/seller/listings`:**
  - Tabs with counts: Live · Drafts · Reserved · Coming soon · Sold · Withdrawn.
  - `ListingRow`: thumbnail, title, size · price, status, and actions Edit · **Sold elsewhere** (with a confirm dialog) · Withdraw.
  - Empty state for a new seller: "List your first piece".
- **B8.3–B8.8 Listing editor — `/seller/listings/[id]`:**
  - **`PhotoSlots`:** guided slots for Front, Back, Label / size tag, and Flaw close-up (the flaw slot appears when flaws are described). Uploaded photos have a type label, a Cover badge, and Make cover / Remove. "Add another: [Detail ▾]". Uploading and failed states. Max 12. A note: "Location data is removed from your photos".
  - **Basics:** title, category, brand (optional), tag size.
  - **Measurements:** fields that change by category; "cm" suffix; a radio "Flat, across one side / All the way around".
  - **Condition:** 4 cards with their meanings.
  - **Flaws:** a text area, or "No flaws: I checked the whole item" (mutually exclusive).
  - **Price:** ₹.
  - Description.
  - **`PublishChecklist`:** sticky on desktop, a bottom drawer on mobile. These are the real messages: "Add a back photo.", "Add a photo of the label or size tag.", "Measure the length.", "Say whether chest/waist/hip were measured flat or all the way around.", "Describe any flaws, or tick "No flaws" to confirm there are none.", "Add a close-up photo of the flaw you described."
  - An autosave indicator: Saved / Saving… / Not saved.

  States, one board each:
  - new empty draft;
  - half-filled;
  - ready to publish;
  - editing a live listing ("This item is live, so it must stay complete");
  - locked ("A buyer is paying for this item, so it can't be changed right now");
  - in a scheduled drop ("This piece is in Winter Vintage Drop. Changes are locked until it opens.").
- **B8.9 Store settings — `/seller/store`:** logo, banner, bio, Instagram handle (verified), dispatch days (1–3), shipping fee, free above, pickup address, and **Preview store**.
- **B8.10 Sell on YOLT — `/sell`:**
  - The seller marketing page in the landing style: how it works in 3 steps, what you get, ₹0 commission on your own buyers, the honesty rules sellers agree to, and FAQ.
  - **Apply to sell** form: store name, Instagram handle, city, what you sell, rough pieces per month, phone.
  - Submitted state: "We'll message you on WhatsApp within 1 working day."

### Batch 9 — Seller: orders and money (page 08)

- **B9.1 Orders — `/seller/orders`:** tabs To ship · Shipped · Delivered · Cancelled · Reports; rows with the dispatch deadline countdown.
- **B9.2–B9.6 Order detail — `/seller/orders/[id]`:**
  - The buyer's delivery address (shown only after payment).
  - Items.
  - **Packed: book pickup** → courier and AWB → **Print label**.
  - The shipment timeline.
  - **Cancel order** (with a reason; "This counts toward your cancellation rate").

  The buyer-report panel: the buyer's reason, text and photos, then **Accept and refund** or **Dispute** (requires an explanation and optional photos), and the escalated state.
- **B9.7 Reviews — `/seller/reviews`:** the list, a reply box (one reply per review), and the replied state.
- **B9.8–B9.10 Drops:**
  - **Drops list — `/seller/drops`:** Draft · Scheduled · Live · Ended · Cancelled.
  - **New drop:** title (3–80 characters), start date and time (at least 10 minutes ahead, within 60 days), max per buyer (1 or 2).
  - **Drop builder — `/seller/drops/[id]`:** add pieces from your listings (each shows ready or what's missing), remove, **Schedule drop** (all-or-nothing, with an error if a piece was reserved or sold meanwhile), **Cancel drop**, **Copy drop link**, View drop page.
- **B9.11 Payouts — `/seller/payouts`:**
  - Balances: Pending (in the protection window) · Available · Paid out.
  - Statement rows, each with an order, date, amount, a **Your link** / **Found on YOLT** label, commission ₹0 ("Pilot: no commission"), and refund.
  - The bank account status (PAN and bank verified).

### Batch 10 — Admin, system and PWA (pages 09 and 10)

**Admin**, desktop-first and dense, using the same tokens. The nav is Overview · Sellers · Reports · Refunds · Homepage · Audit log. Every action asks for a reason and writes to the audit log. "Support" staff see everything read-only.

- **B10.1 Overview:** counts of paid orders awaiting dispatch, late dispatches, escalated reports, failed refunds, pending applications.
- **B10.2 Sellers:** applications and onboard store (create seller, KYC status, approve/reject with reason, suspend).
- **B10.3 Escalated reports:** evidence from both sides side by side → **Refund buyer** / **Reject report**, with a reason.
- **B10.4 Refunds:** failed and processing refunds, with **Retry**.
- **B10.5 Audit log:** who, what, before, after, reason.
- **B10.5b Homepage curation:** pick the featured store, the **Grails** (up to 12 live pieces, ordered) and the edit (a named set of up to 12 live pieces, or a category or style filter) shown in the hero, with a preview and a schedule (start and end date).
- **B10.6 Re-auth prompt:** "Sign in again to make admin changes" (after 12 h).

**System:**
- **B10.7** 404 ("This page wandered off").
- **B10.8** Error page with a retry.
- **B10.9** Offline ("You're offline. Saved pieces still work.").
- **B10.10** Legal page template — `/legal/*`: terms, privacy, buyer protection, grievance officer (name, email and response times).
- **B10.11** `InstallCard`: "Add YOLT to your home screen for drop reminders", shown after a first order or a Remind-me tap, never on arrival. Include the iOS instructions variant.
- **B10.12** `PushPrompt`: shown only after Remind me. It asks with the reason first, then the browser prompt.
- **B10.13** Toast catalogue: every toast used in the product.

### Batch 10b — Live virtual try-on (page 02, P1 tag)

"Try it on" puts the piece on the shopper through their camera, live, like Anywear. It's a planned feature, so design it fully and tag it P1.
- **Entry:** a **Try it on** button on the product page, next to Save, for clothing only, with a small "AI" sticker. The button hides for pieces that can't use it.
- **Consent sheet:** "See it on you, live. Your camera feed isn't recorded or stored." An 18+ checkbox, a link to the privacy policy, and **Turn on camera**.
- **Live view:** full screen on mobile.
  - The camera video with the piece on.
  - A permanent label: "AI preview. Check the measurements for fit."
  - A small piece card (photo, title, size, price).
  - Controls: switch camera · end · **Add to bag** · **Buy now**.
  - A 60 s session ring.
- **States, one board each:**
  - connecting ("Getting the fitting room ready…");
  - live;
  - session ended ("Want another look?", showing the daily tries left);
  - camera denied (how to allow it);
  - not supported in this browser (with "Open in Chrome" for Instagram's in-app browser);
  - busy or slow network;
  - signed out (the sign-in sheet first).
- **Desktop:** a webcam view in a centred modal with the piece details beside it.
- **Component:** `TryOnButton`, `TryOnConsent`, `TryOnView`.

### Batch 11 — Desktop pass and handoff (page 11)

- Desktop 1280 boards for any buyer screen in Batches 2–7 that doesn't have one yet: landing, home, store, product, search, drops list, drop page, bag, checkout, orders, order detail, saved, account.
- A final **Handoff index** board: every board ID → route → state, and every component → the boards that use it.
- Your list of open questions.

---

Start now with **Batch 0 + Batch 1**.
