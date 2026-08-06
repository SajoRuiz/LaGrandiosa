import Link from "next/link";
import { loginAction } from "./actions";
import styles from "../auth.module.css";

type LoginSearchParams = Promise<{
  error?: string | string[];
  next?: string | string[];
}>;

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: LoginSearchParams;
}) {
  const params = await searchParams;
  const error = firstValue(params.error);
  const next = firstValue(params.next) || "/portal";

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
        <Link className={styles.backLink} href="/">
          Back to website
        </Link>
      </header>

      <section className={styles.shell}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>PRIVATE AGENCY ACCESS</p>
          <h1>Sign in to purchase.</h1>
          <p>
            La Grandiosa purchasing is available only to approved agency
            accounts. Enter your username or verified email, password, and
            authenticator code when prompted.
          </p>
        </div>

        <section className={styles.card}>
          <p className={styles.eyebrow}>ACCOUNT LOGIN</p>
          {error ? <p className={styles.error}>{error}</p> : null}

          <form className={styles.form} action={loginAction}>
            <input name="next" type="hidden" value={next} />

            <label className={styles.field}>
              <span>Username or email</span>
              <input
                name="identifier"
                type="text"
                autoComplete="username"
                required
                maxLength={254}
              />
            </label>

            <label className={styles.field}>
              <span>Password</span>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={12}
                maxLength={128}
              />
            </label>

            <button className={styles.button} type="submit">
              Continue securely
            </button>
          </form>

          <p className={styles.helper}>
            Accounts are invite-only. Contact ventas@lagrandiosapr.com if your
            agency needs access or account recovery assistance.
          </p>
        </section>
      </section>
    </main>
  );
}
