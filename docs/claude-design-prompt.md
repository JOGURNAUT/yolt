Design the core screens for **YOLT**, a mobile-first thrift marketplace for India. Independent Instagram thrift stores and individuals sell one-of-one secondhand clothes, sneakers, bags and accessories on it.

## What YOLT is

Today Indian thrift shopping happens in Instagram DMs. A store posts a drop, buyers race to comment "BOOK", and whoever comes first gets a few hours to pay a personal UPI QR code. Buyers can't filter by size, don't know which pages are scams, and have no returns. Sellers drown in DMs and chase ghosting buyers.

YOLT replaces that with a normal, genuinely helpful shop. Users browse like on a fashion app, filter by real measurements, see honest photos of flaws, pay safely through the platform, and track the order. Every item is a single physical piece: stock is 1, and once sold it's gone.

**Audience:** Indian Gen Z and young millennials (18–28), mostly on mid-range Android phones, arriving from Instagram links. Budget-conscious, style-driven, wary of scams.

**Tone:** warm, honest, a little playful. It should feel like a curated thrift store, not a discount bazaar. No fake urgency, no invented discounts or "only 2 left" counters.

## Visual direction

- Propose an original visual identity for YOLT: logo wordmark, colour palette, type scale. Show two contrasting directions on one board before the screens, then use the stronger one.
- Photography is the hero. Garment photos are real, taken by sellers on phones: imperfect lighting and plain backgrounds. The UI must make them look good (consistent 4:5 crops, neutral surfaces), not compete with them.
- Must not resemble Myntra, Instagram or any existing brand's layout or colours. Familiar patterns (product grid, bottom nav, bag icon) are fine.
- Support light and dark mode. Meet WCAG AA contrast. Status must never be conveyed by colour alone; always pair it with a text label.
- Touch targets at least 44 px. Design for a 390 px wide phone first, then show key screens at 1280 px desktop.

## Navigation

- **Mobile bottom nav (5):** Home · Explore · Drops · Feed · Profile.
- **Header:** search, bag, notifications.
- **Desktop:** top bar with search, categories, Drops, Stores, Saved, Bag, Profile. Product grids get a filter sidebar.

## Screens to design (in priority order)

### 1. Store page

This is the most important screen: it's what an Instagram thrift page links to from its bio.

- Header: logo, store name, @instagram handle, short bio, star rating with review count, follower count, Follow button, an "Identity verified" badge. The badge wording must not imply the items are authenticated.
- Upcoming drop banner (if any): drop name, date and time, "Remind me".
- **Filter pills at the top of the grid: In stock · Sold out · Coming soon**, each with a count ("In stock 38 · Sold out 142 · Coming soon 12"). Default is In stock.
- Product grid (2 columns on mobile).
  - Sold-out cards stay visible, with a clear "Sold out" label and slightly muted.
  - Coming-soon cards show the drop time.
  - Reserved cards show "Reserved": someone else is paying right now, and it may come back.
- Scroll further for **Reviews** at the bottom: rating breakdown, then review cards. Each card shows the buyer's first name, star rating, text, optional buyer photos, and a small thumbnail of the exact item they bought (title, size, price), plus an optional seller reply.

### 2. Product page

In this order:
1. Photo gallery: front, back, label, flaw close-ups. Flaw photos are marked.
2. Title, price in ₹, condition grade plus a plain-language description.
3. Tag size plus actual measurements in a small table, with an inches/cm toggle. It must say whether chest is measured flat or around. Add a link: "How to compare with your own clothes".
4. **Flaws section:** always present. Either the listed flaws with photo links, or "Seller confirmed: no flaws".
5. Brand, labelled as "declared by seller". For sneakers and luxury items add a note: "Seller-declared, not authenticated by YOLT", with a proof-of-purchase badge if uploaded.
6. Seller card: name, rating, "usually ships in 2 days", link to store.
7. Delivery: pincode check, exact shipping cost, estimated delivery.
8. Return summary, e.g. "Size returns within 48 h" or "Returns only if not as described".
9. Sticky bottom bar: Save (heart) · Add to bag · **Buy now**.
10. More from this store, and similar items.

Show these states of the page as separate frames:
- Available.
- Reserved by another buyer: no buy button, and "May be available again in a few minutes — save to get notified".
- Sold out: photos and details stay, "Sold out" banner, "Find similar".
- Coming soon (in a drop): countdown and "Remind me".

### 3. Home

Search bar · live and upcoming drops strip · "Fresh finds" grid · "In your sizes" (only once preferences are set) · "Stores to discover" (store cards with logo, name, 3 item thumbnails) · Recently viewed. No big promotional banners in the first screen.

### 4. Search results and filters

- Results grid, with the same In stock / Sold out / Coming soon pills and a result count.
- Sort: relevance, newest, price.
- Filter bottom sheet (mobile): category, tag size, measurements (chest, waist, length ranges), price, condition, brand, store. Include "Include items without measurements".
- Empty state: shows which filters are too narrow, with one-tap chips to remove each one.

### 5. Bag and checkout

- **Bag,** grouped by store (each store is checked out separately). Include a small honest note: "Items in your bag aren't reserved — unique pieces can sell."
- **Checkout, step 1:** the items are now held for you, with a visible **5:00 countdown** ("Reserved for you for 5:00"). If an item sold meanwhile, show "2 of 3 items are still available — continue with 2?".
- **Address:** pincode check.
- **Order review:** item thumbnails, shipping, total in ₹, return policy line, "Pay ₹1,948".
- **Payment:** UPI apps (GPay, PhonePe, Paytm icons as generic UPI app buttons), cards, netbanking. Prepaid only.
- **Payment status screens:** processing ("Checking your payment — don't pay again"), success, failed (retry while the hold lasts), and hold expired.

### 6. Order detail

Order reference, item snapshot, timeline (Paid → Packed → Shipped → Delivered) with a courier tracking link, "Ships by 29 Sep", and a Help button. Also design the return request sheet:
- Reasons: not as described, damaged, wrong item, didn't arrive, size doesn't fit (only if the item allows it).
- Photo upload, and what happens next.

### 7. Drop page

Drop cover, store, date and time, rules in plain words ("First to claim gets 5 minutes to pay. Max 2 items per person"), preview grid, and "Remind me".

Also design the live state:
- Items flip between Available, Reserved and Sold out in real time.
- Each card has a "Claim" button.
- A toast for "Someone just reserved this — try another piece".

### 8. Login sheet

A bottom sheet that appears when an action needs an account: phone number, then OTP via WhatsApp (SMS fallback), plus Google. After login, the user returns to exactly where they were.

### 9. Seller: new listing (mobile)

A step-by-step form with autosave:
1. Photos, with prompts for front, back, label and flaws.
2. Category, brand, tag size.
3. Measurements, with fields that change by category and a flat/around toggle.
4. Condition grade.
5. Flaws, with a required "No flaws" checkbox alternative.
6. Price.
7. Toggles: size returns allowed, allow offers.
8. Publish, or add to a drop.

Include the "missing fields" state that blocks publishing and lists what's missing.

### 10. Seller: listings and orders

- **Listings:** status tabs (Draft · Coming soon · Live · Reserved · Sold · Withdrawn), with a one-tap "Mark sold elsewhere" for items sold on Instagram.
- **Orders:** cards with a dispatch-by countdown and a "Book pickup" button.

## Sample content to use (don't use lorem ipsum)

- **Store:** "Second Loop" @secondloop.thrift, Pune (a made-up store). "Hand-picked vintage & streetwear. Washed, steamed, shipped in 2 days." ★ 4.8 (212 reviews), 18.4k followers.
- **Items:**
  - Vintage Levi's 501 jeans · Tag W32 L32 · Waist 41 cm flat, length 104 cm · Good · "Small bleach spot near left back pocket (photo 5)" · ₹1,299
  - Oversized Carhartt workwear jacket, brown · Tag L · Chest 64 cm flat · Like new · ₹2,450
  - Y2K graphic baby tee · Tag S · Chest 42 cm flat · Good · No flaws · ₹549
  - Nike Air Force 1 '07 · UK 8 · Fair · Seller-declared, proof of purchase uploaded · ₹3,200
  - Mini shoulder bag, beige faux leather · Like new · ₹799
- **Shipping:** ₹79, or free above ₹1,999. Delivery "Estimated 3–5 days to 411001".
- **Review:** "Ananya ★★★★★ — Exactly as described, even the tiny spot was shown. Packed so well!" plus a thumbnail of the Levi's.
- **Drop:** "Winter Vintage Drop", Sat 4 Oct, 7:00 PM IST, 24 pieces.

## Deliverables

1. Brand direction board (two options, then the chosen one).
2. Component sheet: product card in all states (available, reserved, sold out, coming soon), status pills, buttons, filter chips, measurement table, review card, store card, countdown timer, toasts, bottom sheets.
3. The screens above at 390 px, with states as separate frames.
4. Desktop versions at 1280 px of the store page, product page and search results.

Keep copy honest and short. Never show fake scarcity, fake discounts, or anything that implies YOLT authenticated an item.
