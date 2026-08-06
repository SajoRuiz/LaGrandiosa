# Stage 3B-A Package Changes

## New dependency

```bash
npm install @supabase/ssr
```

## New root file

```text
proxy.ts
```

## New Supabase SSR utilities

```text
lib/supabase/client.ts
lib/supabase/server.ts
lib/supabase/proxy.ts
```

## New authentication/access utilities

```text
lib/auth/access.ts
lib/auth/paths.ts
lib/server/activation-code.ts
```

## New customer-auth pages

```text
app/auth/login/
app/auth/callback/
app/auth/activate/
app/auth/mfa/enroll/
app/auth/mfa/challenge/
app/auth/access-denied/
app/auth/signout/
```

## New protected portal and internal administration

```text
app/portal/
app/admin/agencies/
app/api/admin/agencies/
app/api/admin/agency-invites/
app/api/auth/mfa/complete/
```

## Modified protected purchase files

```text
app/order/page.tsx
app/cart/page.tsx
app/checkout/client/page.tsx
app/checkout/received/page.tsx
app/api/orders/draft/route.ts
app/api/health/commerce/route.ts
```

## New migration

```text
supabase/migrations/202608050001_stage_3b_a_agency_auth.sql
```

## Additional security controls

```text
Strict AAL2 enforcement for protected pages and APIs
Agency effective/expiration date enforcement
Agency-scoped client-contact records
Invite callback support for PKCE code and invite token hash
```
