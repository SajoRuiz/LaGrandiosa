import Link from "next/link";
import { requireStaffAccess } from "@/lib/auth/access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import AgencyAdminClient from "./AgencyAdminClient";
import styles from "./admin.module.css";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export default async function AgencyAdministrationPage() {
  const staff = await requireStaffAccess("/admin/agencies", [
    "finance",
    "system_admin",
  ]);
  const admin = createSupabaseAdminClient();
  const { data: agencies } = await admin
    .from("agency_accounts")
    .select(
      "id,account_number,display_name,status,discount_basis_points,approved_credit_limit_cents,payment_terms_days",
    )
    .order("created_at", { ascending: false });

  const agencyOptions = (agencies ?? []).map((agency) => ({
    id: String(agency.id),
    account_number: String(agency.account_number),
    display_name: String(agency.display_name),
  }));

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
        <span className={styles.headerMeta}>
          {staff.profile.full_name} · {staff.staff.role.replaceAll("_", " ")}
        </span>
      </header>

      <section className={styles.intro}>
        <p className={styles.eyebrow}>INTERNAL ACCOUNT ADMINISTRATION</p>
        <h1>Agency access and negotiated terms.</h1>
        <p>
          Create approved agency accounts, assign negotiated discounts and
          credit limits, then send invite-only user access with a separate
          one-time activation code.
        </p>
      </section>

      <section className={styles.workspace}>
        <AgencyAdminClient agencies={agencyOptions} />

        <section className={`${styles.panel} ${styles.agencyList}`}>
          <p className={styles.eyebrow}>CURRENT AGENCIES</p>
          <h2>Account register</h2>

          {(agencies ?? []).length === 0 ? (
            <p>No agency accounts have been created.</p>
          ) : (
            (agencies ?? []).map((agency) => (
              <article className={styles.agencyRow} key={agency.id}>
                <div>
                  <strong>{agency.display_name}</strong>
                  <span>{agency.account_number}</span>
                </div>
                <span>{agency.status}</span>
                <span>
                  {(Number(agency.discount_basis_points) / 100).toFixed(2)}%
                </span>
                <span>
                  {currency.format(
                    Number(agency.approved_credit_limit_cents) / 100,
                  )}
                </span>
                <span>Net {agency.payment_terms_days}</span>
              </article>
            ))
          )}
        </section>
      </section>
    </main>
  );
}
