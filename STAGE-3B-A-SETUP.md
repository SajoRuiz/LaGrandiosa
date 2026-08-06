# La Grandiosa Commerce — Stage 3B-A Setup

Stage 3B-A adds invite-only agency accounts, username/email plus password login,
mandatory TOTP authenticator verification, internal agency administration, and
protected purchasing routes.

## 1. Install the code

Copy the patch contents directly into the root of the existing LaGrandiosa
project. Merge folders with the existing `app`, `lib`, and `supabase` folders.
Do not place the patch folder itself inside the project.

## 2. Install the Supabase SSR package

From the project root:

```bash
npm install @supabase/ssr
```

The project should already contain `@supabase/supabase-js` from Stage 3A.

## 3. Keep the existing environment variables

The existing `.env.local` remains valid:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_SECRET_KEY

APP_BASE_URL=http://localhost:3000

INTERNAL_PROCESSING_EMAIL=processing@lagrandiosapr.com
SALES_REPLY_TO_EMAIL=ventas@lagrandiosapr.com
TRANSACTIONAL_FROM_EMAIL=orders@lagrandiosapr.com
```

For Vercel Production, set:

```env
APP_BASE_URL=https://www.lagrandiosapr.com
```

Never commit `.env.local` or expose the service-role/server secret key.

## 4. Apply the Stage 3B-A migration

In Supabase:

```text
SQL Editor → New query
```

Paste and run:

```text
supabase/migrations/202608050001_stage_3b_a_agency_auth.sql
```

The migration adds:

```text
user_profiles
agency_accounts
agency_members
staff_members
agency_invites
agency_account_history
```

It also adds agency ownership to `orders`, creates invite/MFA helper functions,
adds RLS policies, and creates the authenticated agency-order RPC.

## 5. Configure Supabase Authentication

In the Supabase Dashboard:

### Email/password

```text
Authentication → Providers → Email
```

Keep email/password enabled.

### Disable public signup

```text
Authentication → General Configuration
Allow new users to sign up → OFF
```

Only administrator invitations should create customer accounts.

### TOTP MFA

```text
Authentication → Multi-Factor Authentication
```

Enable App Authenticator / TOTP enrollment, challenge, and verification.

### URL configuration

Set the production Site URL to:

```text
https://www.lagrandiosapr.com
```

Add these Redirect URLs:

```text
http://localhost:3000/**
https://www.lagrandiosapr.com/**
https://lagrandiosapr.com/**
```

Add Vercel Preview URLs later when needed.

## 6. Bootstrap the first internal system administrator

See `BOOTSTRAP-STAGE-3B-A-ADMIN.md`.

## 7. Restart locally

```bash
rm -rf .next
npm run dev
```

Open:

```text
http://localhost:3000/api/health/commerce
```

Expected:

```json
{
  "ok": true,
  "stage": "3B-A",
  "database": "ready",
  "authentication": "invite-only email/password + TOTP MFA"
}
```

## 8. Use the internal account page

After the initial internal administrator logs in and completes MFA:

```text
http://localhost:3000/admin/agencies
```

Create an agency account, then create an agency-user invitation. The page
shows the activation code only once. Send the Supabase invitation email and the
activation code through separate channels.

## 9. Test the agency-user flow

```text
Invitation email
→ /auth/callback
→ /auth/activate
→ Create username and password
→ /auth/mfa/enroll
→ /portal
→ /order
```

## 10. Protected routes

These routes now require an active agency account, purchasing permission, and
an AAL2 authenticator session:

```text
/portal
/order
/cart
/checkout/client
/checkout/received
POST /api/orders/draft
```

Stage 3B-A stores the negotiated discount, credit limit, payment terms, and
discount policy. Actual agency-price application, credit exposure, PO upload,
and invoicing are Stage 3B-B / Stage 3B-C.

## Installation safeguard

Before copying the patch, create a Git checkpoint or branch. The patch mirrors
project-root paths. Copy the *contents* of the package into the existing
LaGrandiosa root; do not nest the package folder under `app` or `lib`.

After copying, confirm these exact paths exist:

```text
proxy.ts
app/auth/login/page.tsx
app/auth/mfa/enroll/page.tsx
app/portal/page.tsx
app/admin/agencies/page.tsx
app/api/admin/agencies/route.ts
app/api/admin/agency-invites/route.ts
lib/auth/access.ts
lib/supabase/server.ts
supabase/migrations/202608050001_stage_3b_a_agency_auth.sql
```
