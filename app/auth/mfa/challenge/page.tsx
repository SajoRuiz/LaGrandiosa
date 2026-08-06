import Link from "next/link";
import { redirect } from "next/navigation";
import { sanitizeNextPath } from "@/lib/auth/paths";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import MfaChallengeClient from "./MfaChallengeClient";
import styles from "../../auth.module.css";

type ChallengeSearchParams = Promise<{
  next?: string | string[];
}>;

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function MfaChallengePage({
  searchParams,
}: {
  searchParams: ChallengeSearchParams;
}) {
  const params = await searchParams;
  const nextPath = sanitizeNextPath(firstValue(params.next), "/portal");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as { sub?: string } | undefined;

  if (!claims?.sub) {
    redirect(`/auth/login?next=${encodeURIComponent(nextPath)}`);
  }

  const { data: aal } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (aal?.currentLevel === "aal2") {
    redirect(nextPath);
  }

  if (aal?.nextLevel !== "aal2") {
    redirect(`/auth/mfa/enroll?next=${encodeURIComponent(nextPath)}`);
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
          <p className={styles.eyebrow}>SECOND-FACTOR VERIFICATION</p>
          <h1>Confirm it is really you.</h1>
          <p>
            This verification is required before the agency portal, negotiated
            terms, credit information, and purchase routes can be opened.
          </p>
        </div>

        <MfaChallengeClient nextPath={nextPath} />
      </section>
    </main>
  );
}
