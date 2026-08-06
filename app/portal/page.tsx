import Link from "next/link";
import { requireAgencyPurchaseAccess } from "@/lib/auth/access";
import styles from "./portal.module.css";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function percentage(basisPoints: number): string {
  return `${(basisPoints / 100).toFixed(
    basisPoints % 100 === 0 ? 0 : 2,
  )}%`;
}

export default async function AgencyPortalPage() {
  const access = await requireAgencyPurchaseAccess("/portal");

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

        <div className={styles.headerActions}>
          <Link href="/cart">Contract cart</Link>
          <form action="/auth/signout" method="post">
            <button className={styles.signout} type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>SECURE AGENCY PORTAL</p>
        <h1>Welcome, {access.profile.full_name}.</h1>
        <p>
          Your authenticated session is connected to {access.agency.display_name}.
          Purchasing requires this account, an active agency membership, and
          current authenticator verification.
        </p>
      </section>

      <section className={styles.grid}>
        <article className={`${styles.card} ${styles.cardFeatured}`}>
          <p className={styles.eyebrow}>PURCHASE</p>
          <h2>Build a new campaign contract.</h2>
          <p className={styles.note}>
            Select campaign dates, add multiple advertising combinations, and
            continue into the protected purchase-order workflow.
          </p>
          <Link className={styles.primaryButton} href="/order">
            Place order
          </Link>
        </article>

        <article className={styles.card}>
          <p className={styles.eyebrow}>AGENCY ACCOUNT</p>
          <h2>{access.agency.display_name}</h2>
          <dl className={styles.details}>
            <div>
              <dt>Account number</dt>
              <dd>{access.agency.account_number}</dd>
            </div>
            <div>
              <dt>Negotiated discount</dt>
              <dd>{percentage(access.agency.discount_basis_points)}</dd>
            </div>
            <div>
              <dt>Approved credit limit</dt>
              <dd>
                {currency.format(
                  access.agency.approved_credit_limit_cents / 100,
                )}
              </dd>
            </div>
            <div>
              <dt>Payment terms</dt>
              <dd>Net {access.agency.payment_terms_days}</dd>
            </div>
            <div>
              <dt>PO required</dt>
              <dd>{access.agency.po_required ? "Yes" : "No"}</dd>
            </div>
          </dl>
          <p className={styles.note}>
            Discount application, available-credit calculations, PO upload,
            and invoicing are activated in the next release.
          </p>
        </article>

        <article className={styles.card}>
          <p className={styles.eyebrow}>SECURITY</p>
          <h2>Account protection active.</h2>
          <dl className={styles.details}>
            <div>
              <dt>Username</dt>
              <dd>{access.profile.username}</dd>
            </div>
            <div>
              <dt>Agency role</dt>
              <dd>{access.membership.role.replaceAll("_", " ")}</dd>
            </div>
            <div>
              <dt>Authenticator</dt>
              <dd>Verified</dd>
            </div>
            <div>
              <dt>Purchasing</dt>
              <dd>{access.membership.can_purchase ? "Enabled" : "Disabled"}</dd>
            </div>
          </dl>
          <Link className={styles.secondaryButton} href="/">
            View public website
          </Link>
        </article>
      </section>
    </main>
  );
}
