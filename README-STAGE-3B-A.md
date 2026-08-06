# La Grandiosa Commerce — Stage 3B-A

## Release objective

Convert purchasing from a public prototype into an invite-only agency portal
protected by username/email, password, and TOTP authenticator verification.

## Included

- Supabase SSR cookie sessions
- Next.js 16 root Proxy session refresh
- Invite-only login and activation
- Username or email login
- Password creation
- Mandatory TOTP MFA enrollment and challenge
- AAL2 purchasing enforcement
- Agency accounts
- Negotiated discount and approved-credit storage
- Payment terms and discount-policy storage
- Agency buyers and agency administrators
- Internal finance/system-administrator roles
- One-time activation codes
- Protected portal, ordering, cart, checkout, and order API
- Agency ownership on new orders
- Internal agency-account creation and invite page

## Not yet included

- Applying negotiated discounts to campaign totals
- Credit exposure and available-credit calculation
- PO PDF upload
- Internal PO approval
- Invoice generation and PDF
- Live email or SMS sending
- Asset upload and approval

Those functions are Stage 3B-B, Stage 3B-C, and Stage 4.

Begin with `STAGE-3B-A-SETUP.md`.

## Security hardening included in this package

- Protected purchasing and staff routes require a verified AAL2 session.
- Agency effective and expiration dates are enforced in the application and database.
- Client contact records are scoped to the purchasing agency.
- Invite activation codes are high-entropy, one-time values stored only as SHA-256 hashes.
- The Supabase service-role/server secret remains confined to server-only modules.
