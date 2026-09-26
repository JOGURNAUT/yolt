Design the core screens for **YOLT**, a mobile-first thrift marketplace for India. Independent Instagram thrift stores and individuals sell one-of-one secondhand clothes, sneakers, bags and accessories on it.

## What YOLT is, and how it should feel

Today Indian thrift shopping happens in Instagram DMs. A store posts a drop, buyers race to comment "BOOK", and whoever comes first pays a personal UPI QR code. Buyers can't filter by size, can't tell which pages are scams, and have no returns. Sellers drown in DMs and chase buyers who never pay.

YOLT replaces that with a normal, genuinely helpful shop:
- Browse like a fashion app, and filter by real measurements.
- See every flaw photographed.
- Pay safely through YOLT, and track the order.

Every item is a single physical piece: once it's sold, it's gone.

**Positioning:** *"Thrift without the DMs: every piece measured, every flaw shown, your money protected."* India is price-sensitive, but YOLT competes on **trust and fit, not on being cheapest**. What stops people buying from Instagram isn't the price tag. It's the fear of losing ₹800 to a scam page, or getting the wrong size. The design should make that safety visible and calm, never salesy.

**Audience:** Indian Gen Z and young millennials (18–28) in metros, mostly on mid-range Android phones. They almost always arrive by tapping a link on Instagram, so pages open inside **Instagram's own in-app browser**.

**Tone:** warm, honest, a little playful. A curated thrift store, not a discount bazaar. **Never** show fake urgency, invented discounts, "only 2 left" counters, or anything suggesting YOLT authenticated an item.

## Platform and layout

- **Mobile web first**, at 390 px. It must feel fast and native inside Instagram's in-app browser. Show key screens at 1280 px desktop as well.
- It's a **progressive web app**: include a gentle "Add YOLT to your home screen" card, shown after a first order or a "Remind me" tap, never on arrival.
- **Mobile bottom nav:** Home · Explore · Drops · Saved · Profile. Header: search, bag, sign-in / account.
- **Desktop:** a top bar with search, categories, Drops, Stores, Saved, Bag, Account. Product grids get a filter sidebar.
- Light and dark mode. WCAG AA contrast. Status is never shown by colour alone; always pair it with text. Touch targets at least 44 px.

## Visual direction

- Propose an **original** identity for YOLT: wordmark, palette, type scale. Show two contrasting directions on one board, then use the stronger one.
- Photography is the hero. Photos are real phone shots by sellers, with imperfect light and plain backgrounds. The UI should flatter them (consistent 4:5 crops, neutral surfaces), not compete with them.
- Must not resemble Myntra, Instagram, Meesho or any other brand. Familiar patterns (product grid, bottom nav, bag icon) are fine.

## Buyer screens (in priority order)

### 1. Store page (the page Instagram stores link to from their bio)
- **Header:** logo, store name, @instagram handle, short bio, star rating with review count, follower count, and a **Follow** button. Add an **"Identity verified"** badge whose tooltip says "PAN and bank checked. Items are not authenticated by YOLT." Also show "Ships in 2 days · Shipping ₹79, free above ₹1,999".
- **Upcoming drop banner** (if any): name, date and time, "Remind me".
- **Filter pills at the top of the grid:** **In stock · Sold out · Coming soon**, each with a count (e.g. "In stock 38 · Sold out 142 · Coming soon 12"). Default is In stock.
- **Product grid**, 2 columns on mobile:
  - Sold-out cards stay visible, muted, with a "Sold out" label.
  - Coming-soon cards show the drop time.
  - Reserved cards show "Reserved": someone is paying right now, and the piece may come back.
- **Reviews at the bottom.** First a rating breakdown, then review cards. Each card shows the buyer's first name, stars, the text, optional buyer photos, and a thumbnail of the exact item they bought (title, size, price), plus an optional seller reply.

### 2. Product page, in this order
1. **Photo gallery:** front, back, label, and flaw close-ups (flaw photos are tagged "Flaw").
2. **Title, price in ₹,** and the condition grade with a one-line meaning (e.g. "Good: gently used, any wear is listed below with photos").
3. **Tag size and measurements** in a small table, in cm with inches in brackets. The table must say whether chest/waist was measured **flat** or **all the way around**, plus a hint: "Double flat measurements to compare with a tape around you."
4. **Flaws section,** always present: either the listed flaws, or "Seller confirmed: no flaws".
5. **Brand** "(declared by seller)". For sneakers and bags, add a note: "Seller-declared, not authenticated by YOLT".
6. **Seller card:** name, rating, "Usually ships in 2 days", a link to the store.
7. **Pincode check:** "Check delivery". Enter a pincode to see "Delivers to 411001 in 3–5 days", or "We can't deliver to this pincode yet".
8. **Returns line:** "Size returns within 48 h (you pay return shipping). Always returnable if not as described." Or, if the item doesn't allow size returns: "Returns only if not as described."
9. **Sticky bottom bar:** Save (heart) · Add to bag · **Buy now · ₹1,299**.
10. **More from this store,** and similar items.

Design these states as separate frames:
- **Available.**
- **Reserved:** no buy button, and "Reserved by another buyer. It may come back in a few minutes if they don't pay."
- **Sold out:** photos and details stay, a "Sold out" banner, "See what's in stock at Second Loop".
- **Coming soon:** countdown and "Remind me".

### 3. Sign in (phone and WhatsApp code; no passwords, no email)
A bottom sheet or page shown only when an action needs an account (buying, following, drop reminders):
- **Step 1:** a "+91" prefix and a mobile number field; button "Send code on WhatsApp".
- **Step 2:** "Code sent on WhatsApp to +91 98765 43210 · Change number", then a 6-digit code field, "Sign in", "Resend in 24s", and "Send by SMS instead".

Include the error states: wrong code ("2 tries left"), expired code, too many tries. After sign-in, the user returns to exactly where they were.

### 4. Home
Search · a live and upcoming drops strip · a "Fresh finds" grid · "In your sizes" (only once preferences are set) · "Stores to discover" (cards with logo, name and 3 item thumbnails) · Recently viewed. No big promo banners in the first screen.

### 5. Search results and filters
- A results grid with the same **In stock / Sold out / Coming soon** pills, plus a count and sort (relevance, newest, price).
- **Filter sheet:** category, tag size, measurement ranges (chest, waist, length), price, condition, brand, store, and a checkbox "Include items without measurements".
- **Empty state:** show which filters are too narrow, with a one-tap chip to remove each.

### 6. Bag and checkout (prepaid only; **there is no platform or convenience fee, never add one**)
- **Bag,** grouped by store (each store checks out separately), with a small honest note: "Items in your bag aren't reserved. Unique pieces can sell." Show a **bundling nudge** when close to a store's free-shipping threshold: "Add one more piece from Second Loop and save ₹79 shipping". Show a "Free shipping on your first YOLT order" badge when it applies.
- **Step 1, reserved:** "Reserved for you for 4:59", with a live countdown. If an item sold in the meantime: "2 of 3 items are still available. Continue with 2?"
- **Step 2, delivery address:**
  - Saved address cards (name, address, pincode, phone) with one marked default, plus "Add new address".
  - The **add-address form:** full name, mobile, flat/house and street, area, landmark (optional), pincode (city and state fill in from the pincode where possible), city, state dropdown.
  - Delivery result for the chosen pincode: "Delivers in 3–5 days", or "We can't deliver here yet".
- **Step 3, review:** item thumbnails, subtotal, shipping (or "Free"), **total**, the returns line, then "Pay ₹1,378".
- **Payment:** UPI apps as generic buttons (no real app logos), cards, netbanking.
- **Payment status screens:**
  - processing ("Checking your payment. Don't pay again.")
  - success ("Paid. Ships by Sat 4 Oct.")
  - failed (retry while the reservation lasts)
  - reservation expired
  - "Payment arrived too late, full refund started"

### 7. Order detail and returns
- **Order detail:** order reference, item snapshot, a timeline (Paid → Packed → Shipped → Delivered) with a courier tracking link, "Ships by 29 Sep", and Help.
- **Return request sheet:**
  - Reasons: not as described, damaged, wrong item, didn't arrive, size doesn't fit (only if the item allows size returns).
  - Photo upload.
  - A clear "what happens next", including who pays return shipping.

### 8. Drop page
- **Before it opens:** cover, store, date and time in IST, rules in plain words ("First to claim gets 5 minutes to pay. Max 2 items per person."), a preview grid, "Remind me".
- **Live state:** cards flip between Available, Reserved and Sold out in real time, each with a "Claim" button, plus a toast for "Someone just reserved this. Try another piece."

## Seller screens (mobile web; sellers photograph and list from their phones)

### 9. Listings
- A header with the store name, **"Copy store link"** and **"New listing"**. The share-link tooltip reads: "Buyers who come through your link are yours: no commission on their orders."
- **Status tabs with counts:** Live · Drafts · Reserved · Coming soon · Sold · Withdrawn.
- **Rows:** thumbnail, title, size · price, and actions (Edit · **Sold elsewhere** · Withdraw). "Sold elsewhere" is for pieces sold on Instagram or in person, with a confirm dialog.

### 10. Listing editor
Two columns on desktop, stacked on mobile. An autosave indicator in the header ("Saved" / "Editing…" / "Not saved").
- **Photos:** guided dashed slots for "Add front", "Add back", "Add label / size tag", and "Add flaw close-up" (the flaw slot appears when flaws are described). Uploaded photos show their type label, a "Cover" badge on the first, and "Cover" / "Remove" actions. Below: "Add another: [Detail ▾] Choose photo".
- **Basics:** title, category dropdown, brand (optional), size on the tag.
- **Measurements:** fields that change by category (tops: chest, length, shoulder, sleeve; jeans: waist, hip, length, inseam), each with a "cm" suffix, and a radio "Flat, across one side / All the way around".
- **Condition:** four selectable cards (New with tags, Like new, Good, Fair), each with its one-line meaning.
- **Flaws:** a text area, plus a checkbox "No flaws: I checked the whole item" (the two are mutually exclusive).
- **Price:** "₹" input. A toggle "Allow size returns", with an explanation. Description (optional).
- **Sticky side panel "Before you publish":** a checklist of what's missing ("Add a back photo", "Measure the length", "Say whether it was measured flat or around"), which turns into "Ready to publish". Then a **Publish** button (disabled until ready). For live listings, **Save changes** instead.
- **Show states:** empty new draft, half-filled draft, ready to publish, editing a live listing (with the error "This item is live, so it must stay complete"), and the locked state ("A buyer is paying for this item, so it can't be changed right now").

### 11. Payouts (simple)
- Balance: pending (in the return window) · available · paid.
- Each order is labelled **"Your link"** (always ₹0 commission) or **"Found on YOLT"** (₹0 during the pilot), so sellers see which sales YOLT brought them.

## Sample content (don't use lorem ipsum)
- **Store:** "Second Loop" @secondloop.thrift, Pune (a made-up store). "Hand-picked vintage & streetwear. Washed, steamed, shipped in 2 days." ★ 4.8 (212 reviews), 18.4k followers.
- **Items:**
  - Vintage Levi's 501 jeans · Tag W32 L32 · Waist 41 cm flat, length 104 cm · Good · "Small bleach spot near left back pocket (photo 5)" · ₹1,299
  - Oversized Carhartt workwear jacket, brown · Tag L · Chest 64 cm flat · Like new · No flaws · ₹2,450
  - Y2K graphic baby tee · Tag S · Chest 42 cm flat · Good · No flaws · ₹549
  - Nike Air Force 1 '07 · UK 8 · Fair · "Creasing on toe box" · seller-declared, proof of purchase uploaded · ₹3,200
  - Mini shoulder bag, beige faux leather · Like new · ₹799
- **Shipping:** ₹79, free above ₹1,999. Delivery "3–5 days to 411001".
- **Buyer:** Ananya, +91 98765 43210, "Flat 12, Sunrise Apartments, Koregaon Park, Pune 411001, Maharashtra".
- **Review:** "Ananya ★★★★★: Exactly as described, even the tiny spot was shown. Packed so well!", with a thumbnail of the Levi's.
- **Drop:** "Winter Vintage Drop", Sat 4 Oct, 7:00 PM IST, 24 pieces.

## Deliverables
1. Brand direction board (two options, then the chosen one).
2. **Component sheet:**
   - Product card in every state: available, reserved, sold out, coming soon.
   - Controls: status pills, buttons, filter chips, the OTP input.
   - Content blocks: the measurement table, review card, store card, address card, the pincode check.
   - Feedback: the countdown timer, toasts, bottom sheets.
3. All screens above at 390 px, with states as separate frames.
4. Desktop (1280 px) versions of the store page, product page, search results and the listing editor.

Keep copy short and honest. No fake scarcity, no fake discounts, no fees at checkout, and nothing that implies YOLT authenticated an item.
