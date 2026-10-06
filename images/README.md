# Demo photos

Drop product photos here to see the site with real pictures instead of grey placeholders.
Nothing in this folder except this file is committed (see `.gitignore`), so use any photos you
like, including ones you don't have the rights to publish.

```sh
pnpm db:up && pnpm db:seed        # the demo store "Second Loop" and its pieces
pnpm demo:photos --dry            # show which photo goes on which piece, change nothing
pnpm demo:photos                  # put them on the pieces (replaces their current photos)
```

## Naming

Name a photo after the piece. Every word in the file name has to appear in the piece's title
(or category): `jeans.jpg`, `levis-501.jpg`, `carhartt-jacket.jpg`, `baby-tee.png`, `air-force.jpg`.

| Piece (demo store) | Example names |
|---|---|
| Vintage Levi's 501 jeans | `jeans`, `levis`, `501` |
| Oversized Carhartt workwear jacket, brown | `carhartt`, `workwear-jacket` |
| Y2K graphic baby tee | `baby-tee`, `y2k` |
| Nike Air Force 1 '07 | `nike`, `air-force`, `sneakers` |
| Mini shoulder bag, beige faux leather | `shoulder-bag`, `bag` |
| Striped rugby polo, navy and cream | `rugby-polo`, `polo` |
| Corduroy wide-leg trousers, olive | `corduroy`, `trousers` |
| Wool cable-knit sweater, cream | `sweater`, `cable-knit` |

Run `pnpm demo:photos --dry` to see every piece and what's left over.

More than one photo of a piece: add a suffix. `jeans-back.jpg`, `jeans-label.jpg`, `jeans-detail.jpg`,
or numbers (`jeans-2.jpg`). Without suffixes the order is front, back, label, detail; the front
photo is the cover.

## Not worth naming?

`pnpm demo:photos --sequential --per 2` ignores names and hands the photos out in order, two per
piece (first the front, then the back), in the order the pieces were created.

## What happens to them

Same pipeline as a seller's upload: location data stripped, re-encoded to WebP at most
1600 x 2000, stored in the local media bucket. Photos should be at least 400 x 400. A clean white
or light grey background suits the 4:5 cards best. The command only works against a local database.
