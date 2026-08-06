import Link from "next/link";
import { redirect } from "next/navigation";
import { sanitizeNextPath } from "@/lib/auth/paths";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import MfaEnrollClient from "./MfaEnrollClient";
import styles from "../../auth.module.css";

type MfaEnrollSearchParams = Promise<{
  next?: string | string[];
}>;

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function MfaEnrollPage({
  searchParams,
}: {
  searchParams: MfaEnrollSearchParams;
}) {
  const params = await searchParams;
  const nextPath = sanitizeNextPath(firstValue(params.next), "/portal");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as { sub?: string } | undefined;

  if (!claims?.sub) {
    redirect(`/auth/login?next=${encodeURIComponent(nextPath)}`);
  }

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("user_profiles")
    .select("status")
    .eq("user_id", claims.sub)
    .maybeSingle();

  if (!profile) {
    redirect("/auth/activate");
  }

  if (profile.status !== "active") {
    redirect("/auth/access-denied");
  }

  const { data: aal } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (aal?.currentLevel === "aal2") {
    redirect(nextPath);
  }

  if (aal?.nextLevel === "aal2") {
    redirect(`/auth/mfa/challenge?next=${encodeURIComponent(nextPath)}`);
  }

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
          <p className={styles.eyebrow}>REQUIRED SECURITY STEP</p>
          <h1>Enroll your security key.</h1>
          <p>
            Password access alone is not sufficient for purchasing. Complete
            this one-time authenticator enrollment to protect your agency’s
            pricing, credit, purchase orders, and campaign records.
          </p>
        </div>

        <MfaEnrollClient nextPath={nextPath} />
      </section>
    </main>
  );
}
