import Link from "next/link";
import styles from "../auth.module.css";

type AccessDeniedSearchParams = Promise<{
  reason?: string | string[];
}>;

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function AccessDeniedPage({
  searchParams,
}: {
  searchParams: AccessDeniedSearchParams;
}) {
  const params = await searchParams;
  const reason = firstValue(params.reason);

  const message =
    reason === "purchasing-disabled"
      ? "Your account is active, but purchasing permission is currently disabled."
      : reason === "account-inactive"
        ? "This account is not currently active."
        : reason === "invite-missing"
          ? "The agency invitation is missing, expired, or no longer active."
          : "This account does not have permission to open the requested page.";

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
          <p className={styles.eyebrow}>ACCESS RESTRICTED</p>
          <h1>Account authorization required.</h1>
          <p>{message}</p>
        </div>

        <section className={styles.card}>
          <p className={styles.notice}>
            Contact processing@lagrandiosapr.com for internal account review,
            or ventas@lagrandiosapr.com for agency assistance.
          </p>

          <div className={styles.actions}>
            <Link className={styles.button} href="/auth/login">
              Return to login
            </Link>
            <Link className={styles.secondaryButton} href="/">
              Return to website
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}
