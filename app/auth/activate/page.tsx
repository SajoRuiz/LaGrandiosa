import Link from "next/link";
import { redirect } from "next/navigation";
import { activateAgencyAccount } from "./actions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "../auth.module.css";

type ActivateSearchParams = Promise<{
  error?: string | string[];
}>;

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function ActivatePage({
  searchParams,
}: {
  searchParams: ActivateSearchParams;
}) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as { sub?: string; email?: string } | undefined;

  if (!claims?.sub) {
    redirect("/auth/login?error=" + encodeURIComponent("Open the invitation link before activating the account."));
  }

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("user_profiles")
    .select("status")
    .eq("user_id", claims.sub)
    .maybeSingle();

  if (profile?.status === "active") {
    redirect("/auth/mfa/enroll?next=/portal");
  }

  const { data: invite } = await admin
    .from("agency_invites")
    .select("id,agency_id,email,role,expires_at,status")
    .eq("auth_user_id", claims.sub)
    .eq("status", "pending")
    .maybeSingle();

  if (!invite) {
    redirect("/auth/access-denied?reason=invite-missing");
  }

  const { data: agency } = await admin
    .from("agency_accounts")
    .select("display_name,account_number")
    .eq("id", invite.agency_id)
    .maybeSingle();

  const params = await searchParams;
  const error = firstValue(params.error);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" aria-label="Return to La Grandiosa home">
          <img
            className={styles.logo}
            src="/la-grandiosa-logo.png"
            alt="La Grandiosa"
          />
        </Link>
      </header>

      <section className={styles.shell}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>AGENCY ACCOUNT ACTIVATION</p>
          <h1>Create your secure account.</h1>
          <p>
            Your invitation is linked to {agency?.display_name ?? "an approved agency"}.
            Enter the separate activation code supplied by La Grandiosa, create
            your username and password, then enroll an authenticator key.
          </p>
        </div>

        <section className={styles.card}>
          <p className={styles.eyebrow}>
            {agency?.account_number ?? "APPROVED AGENCY"}
          </p>

          {error ? <p className={styles.error}>{error}</p> : null}

          <form className={styles.form} action={activateAgencyAccount}>
            <input name="inviteId" type="hidden" value={invite.id} />

            <label className={styles.field}>
              <span>Agency activation code</span>
              <input
                name="activationCode"
                type="text"
                autoCapitalize="characters"
                autoComplete="one-time-code"
                required
                maxLength={40}
              />
            </label>

            <label className={styles.field}>
              <span>Username</span>
              <input
                name="username"
                type="text"
                autoComplete="username"
                required
                minLength={3}
                maxLength={40}
                pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,39}"
              />
            </label>

            <div className={styles.fieldGridTwo}>
              <label className={styles.field}>
                <span>Full name</span>
                <input
                  name="fullName"
                  type="text"
                  autoComplete="name"
                  required
                  maxLength={160}
                />
              </label>

              <label className={styles.field}>
                <span>Telephone</span>
                <input
                  name="telephone"
                  type="tel"
                  autoComplete="tel"
                  maxLength={40}
                />
              </label>
            </div>

            <label className={styles.field}>
              <span>Create password</span>
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
              />
            </label>

            <label className={styles.field}>
              <span>Confirm password</span>
              <input
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
              />
            </label>

            <button className={styles.button} type="submit">
              Activate and set up security key
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}
