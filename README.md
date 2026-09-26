# YOLT

Thrift marketplace for India: one-of-one secondhand fashion from independent stores, with real measurements, honest flaws and safe prepaid checkout. Product docs live in [docs/](docs/): start with [user-flows.md](docs/user-flows.md) and [decisions.md](docs/decisions.md).

## Layout

| Path | What |
|---|---|
| `apps/web` | Next.js buyer site. Mounts the API at `/api`. |
| `packages/api` | Hono + Zod-OpenAPI HTTP API (`/api/openapi.json`). Shared with the future Expo app. |
| `packages/core` | Domain logic: holds, checkout, payments, expiry. The no-oversell rules live here. |
| `packages/db` | Drizzle schema, migrations, seed data. |

## Run locally

Needs Node 24, pnpm 12 and Docker.

```sh
cp .env.example .env                        # root: database URLs for scripts and tests
cp apps/web/.env.example apps/web/.env.local
pnpm install
pnpm db:up        # Postgres 17 on :5433 and RustFS (S3-compatible, stands in for R2) on :9000
pnpm media:setup  # once: creates the public-read yolt-media bucket
pnpm db:migrate
pnpm db:seed      # made-up store "Second Loop" + demo buyers
pnpm --filter @yolt/web dev
```

Open http://localhost:3000/s/secondloop. **Sign in** with any Indian mobile number: in development the code is shown on screen instead of being sent. To list an item, use **Dev: switch user** → **Second Loop (demo seller)**, then open http://localhost:3000/seller/listings. Use **Dev: switch user** in the header to sign in as a demo buyer, then buy something. The checkout uses a sandbox gateway that sends signed webhooks through the real webhook path.

## Tests

```sh
pnpm test         # runs against the yolt_test database (reset on every run)
```

Covers: 100 concurrent buyers for one garment → one hold; stale releases can't free a newer hold; duplicate and concurrent webhooks confirm once; late payments are refunded if the item went to someone else; amount mismatches don't confirm; sold-elsewhere vs checkout races; API auth and ownership checks.

## Not built yet

- MSG91 delivery for login codes. Production refuses to send codes until it's configured (set `AUTH_PEPPER` too).
- Cashfree payments. Production refuses payments until the adapter exists.
- Shiprocket (a dev shipping fake answers delivery checks locally; production refuses to guess), seller onboarding and KYC (the seed seller is pre-verified), drops builder, search (Typesense), drops opening job, returns, admin.
- Hold expiry: Vercel Cron calls `/api/cron/expire-holds` every minute (needs `CRON_SECRET`). Checkout also frees expired holds on the items it touches, so nothing gets stuck locally without cron.
