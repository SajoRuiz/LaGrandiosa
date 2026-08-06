# Bootstrap the First La Grandiosa System Administrator

This is a one-time setup for the first internal administrator.

## 1. Create the Auth user

In Supabase:

```text
Authentication → Users → Add user → Create new user
```

Enter the internal administrator's real email and a temporary strong password.
Enable email confirmation/auto-confirm for this manually created internal user.
Do not use a shared agency account.

## 2. Assign the internal staff role

Open:

```text
SQL Editor → New query
```

Run this after replacing the example values:

```sql
select public.bootstrap_staff_member(
  'YOUR_INTERNAL_ADMIN_EMAIL',
  'YOUR_ADMIN_USERNAME',
  'YOUR FULL NAME',
  'system_admin'::public.staff_role
);
```

The username must contain 3–40 letters, numbers, periods, underscores, or
hyphens.

## 3. Sign in and enroll MFA

Open:

```text
http://localhost:3000/auth/login?next=/admin/agencies
```

Sign in with the internal email or username and temporary password. The app
requires authenticator enrollment before the internal agency page opens.

## 4. Create agency accounts and invites

Open:

```text
http://localhost:3000/admin/agencies
```

The internal administrator can:

- Create agency accounts
- Store negotiated discount rates
- Store approved credit limits
- Store payment terms and discount policy
- Restrict invitations to approved email domains
- Invite agency buyers or agency administrators
- Generate one-time activation codes

## Important

The activation code does not contain the discount or credit limit. It is a
high-entropy one-time code that links the invited user to the server-side
agency account where those negotiated values are stored.

