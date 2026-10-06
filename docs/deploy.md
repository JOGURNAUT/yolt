# Deploying YOLT (staging)

A step-by-step for putting YOLT on a real URL you can open on your phone. Staging uses **sandbox payments, the dev courier and on-screen login codes**, all behind a shared password, so you can demo the full flow before any merchant accounts exist. Production is the same setup with `APP_ENV=production` and the real providers once their adapters are built.

**Accounts needed (all have free tiers):** Supabase, Cloudflare (for R2), Vercel, plus the GitHub repo you already have.

## 1. Database: Supabase (Mumbai)

1. Create a project, region **ap-south-1 (Mumbai)**. Save the database password.
2. Project Settings → Database → Connection string. You need two URLs:
   - **Transaction pooler** (port **6543**): for the app on Vercel. The app detects port 6543 and turns off prepared statements, which the pooler doesn't support.
   - **Direct connection** (port 5432): for running migrations.
3. Run migrations from your machine, using the direct URL:
   ```sh
   DATABASE_URL="postgres://…:5432/postgres" pnpm db:migrate
   ```
   This also enables the `pg_trgm` extension used by search.

## 2. Photos: Cloudflare R2

1. R2 → Create bucket `yolt-media`.
2. Bucket → Settings → Public access → enable the **r2.dev** subdomain (or connect a custom domain later). Copy the public URL.
3. R2 → Manage API tokens → create a token with **Object Read & Write** on this bucket. Copy the Access Key ID, Secret Access Key and the S3 endpoint (`https://<account-id>.r2.cloudflarestorage.com`).

No CORS setup is needed: uploads go through the app server, which strips photo metadata before storing.

## 3. App: Vercel

1. Import the GitHub repo. Set **Root Directory** to `apps/web`; Vercel detects Next.js and the pnpm workspace. The repo pins pnpm 12 in `packageManager`; if the install step uses an older pnpm, add the environment variable `ENABLE_EXPERIMENTAL_COREPACK=1`.
2. Function region: **Mumbai (bom1)** (Project Settings → Functions), next to the database.
3. Environment variables (Project Settings → Environment Variables):

| Variable | Value |
|---|---|
| `APP_ENV` | `staging` |
| `STAGING_ACCESS_PASSWORD` | a long random password you share with testers |
| `DATABASE_URL` | Supabase **transaction pooler** URL (port 6543) |
| `AUTH_PEPPER` | `openssl rand -hex 32` |
| `CRON_SECRET` | `openssl rand -hex 32` |
| `SANDBOX_WEBHOOK_SECRET` | `openssl rand -hex 32` |
| `MEDIA_ENDPOINT` | R2 S3 endpoint |
| `MEDIA_BUCKET` | `yolt-media` |
| `MEDIA_ACCESS_KEY_ID` / `MEDIA_SECRET_ACCESS_KEY` | from the R2 token |
| `MEDIA_PUBLIC_BASE_URL` | the bucket's public URL |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | optional until you want web push: `npx web-push generate-vapid-keys` for the pair, and a `mailto:` contact for the subject. Without all three, push is off and `/api/health` lists them under `missingOptionalConfig`. |
| `LEGAL_ENTITY_NAME`, `LEGAL_ADDRESS`, `SUPPORT_EMAIL`, `GRIEVANCE_OFFICER_NAME`, `GRIEVANCE_EMAIL` | your company details (placeholders show until set) |

4. Deploy. Then open `https://<your-app>.vercel.app/api/health`. It should return `"ok": true`; if not, `missingConfig` lists the settings still missing (names only).

## 4. Scheduled jobs: GitHub Actions

Vercel's free plan only runs crons once a day, so reservation expiry, drops, push notifications and order closing run from `.github/workflows/cron.yml` every 5 minutes. Checkout also frees expired reservations by itself, so a delay here never blocks a sale.

In the GitHub repo → Settings → Secrets and variables → Actions:
- Variable `CRON_BASE_URL` = `https://<your-app>.vercel.app`
- Secret `CRON_SECRET` = the same value as on Vercel

The cron routes are exempt from the staging password and authenticate with this secret.

## 5. First admin and first store

```sh
DATABASE_URL="postgres://…:5432/postgres" pnpm admin:grant <your mobile> ADMIN --confirm
```

Open the site, enter the staging password, sign in with that number (the code shows on screen in staging), then **Admin → Sellers → Onboard** your first store and mark its KYC verified. The store owner signs in with their number and lists from **Your store**.

## Before production

- Build and configure the Cashfree, MSG91 and Shiprocket adapters (production refuses payments, login codes and courier bookings until then).
- Set `APP_ENV=production`, remove `STAGING_ACCESS_PASSWORD`, fill every legal setting; `/api/health` fails until they're present.
- Have a lawyer review the pages under `/legal` (they're marked as drafts outside production), and the open items in [decisions.md](decisions.md) (GST TCS, inter-state sellers, seller details display).
