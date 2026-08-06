# Start Here — Stage 3B-A

1. Create a Git checkpoint.
2. Copy the contents of this patch into the existing LaGrandiosa project root.
3. Run `npm install @supabase/ssr`.
4. Apply `supabase/migrations/202608050001_stage_3b_a_agency_auth.sql` in the Supabase SQL Editor.
5. Configure invite-only email/password access, redirect URLs, and TOTP MFA as described in `STAGE-3B-A-SETUP.md`.
6. Bootstrap the first internal administrator using `BOOTSTRAP-STAGE-3B-A-ADMIN.md`.
7. Run `bash VERIFY-STAGE-3B-A.sh`, then `npm run build`.
8. Test the complete flow with `STAGE-3B-A-TEST-MATRIX.md`.

Do not nest this patch under `app`, `lib`, or another subfolder. Merge its root-level contents into the project root.
