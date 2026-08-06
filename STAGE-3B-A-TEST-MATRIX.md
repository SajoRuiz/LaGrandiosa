# Stage 3B-A Test Matrix

## Database and health

- Run the Stage 3B-A SQL migration.
- `/api/health/commerce` returns `stage: 3B-A` and `database: ready`.

## Public signup

- Public signup is disabled in Supabase.
- A visitor cannot create an account without an invitation.

## Internal administrator

- Bootstrap one `system_admin` user.
- Login requires email/username and password.
- A user without TOTP is redirected to `/auth/mfa/enroll`.
- A user with TOTP but an AAL1 session is redirected to `/auth/mfa/challenge`.
- An AAL2 system administrator can open `/admin/agencies`.
- An agency user cannot open `/admin/agencies`.

## Agency account

- Create an agency with a negotiated discount, credit limit, Net terms,
  discount policy, PO requirement, and approved email domain.
- Confirm the account appears in `agency_accounts`.
- Confirm `agency_account_history` contains `agency.account_created`.

## Invitation and activation

- Create an invitation for an approved domain.
- The page displays a one-time activation code.
- Supabase sends the invitation email.
- An email outside the approved domains is rejected.
- The invitation link opens `/auth/activate`.
- A wrong activation code is rejected.
- An expired or revoked invitation is rejected.
- A duplicate username is rejected.
- Successful activation creates:
  - `user_profiles`
  - `agency_members`
  - accepted `agency_invites`
  - `agency.user_activated` account history

## MFA

- Authenticator QR and manual secret appear.
- Wrong TOTP code is rejected.
- Successful enrollment upgrades the session to AAL2.
- `user_profiles.mfa_enrolled_at` is populated.
- Subsequent logins require the current authenticator code.

## Protected purchasing

- Signed-out `/order`, `/cart`, and `/checkout/client` redirect to login.
- An AAL1 session redirects to MFA challenge/enrollment.
- Suspended agency membership is denied.
- `can_purchase = false` is denied.
- An active agency buyer at AAL2 can create an order.
- New orders contain `agency_id` and `ordered_by_user_id`.
- The order audit record identifies the authenticated purchaser.

## Security

- `.env.local` is ignored by Git.
- Service-role/server secret is never present in browser code.
- Activation codes are stored only as SHA-256 hashes.
- Activation code is shared separately from the invitation email.
