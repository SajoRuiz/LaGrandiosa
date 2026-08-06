import Link from "next/link";
import { requireAgencyPurchaseAccess } from "@/lib/auth/access";
import styles from "./received.module.css";

type ReceivedSearchParams = Promise<{
  order?: string | string[];
}>;

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function ClientInformationReceivedPage({
  searchParams,
}: {
  searchParams: ReceivedSearchParams;
}) {
  const access = await requireAgencyPurchaseAccess("/checkout/received");
  const params = await searchParams;
  const orderNumber = firstValue(params.order);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/">
          <img
            className={styles.logo}
            src="/la-grandiosa-logo.png"
            alt="La Grandiosa"
          />
        </Link>
      </header>

      <section className={styles.card}>
        <p className={styles.eyebrow}>CLIENT INFORMATION RECEIVED</p>
        <h1>Your authenticated order record has been created.</h1>

        {orderNumber ? (
          <p className={styles.orderNumber}>
            Order number: <strong>{orderNumber}</strong>
          </p>
        ) : null}

        <p>
          The order is linked to {access.agency.display_name} and purchaser
          {" "}
          {access.profile.full_name}. The purchase-order, negotiated discount,
          credit validation, and invoicing workflow are the next release.
        </p>

        <aside className={styles.notice}>
          Notification records are queued for the customer and
          processing@lagrandiosapr.com. Actual email and SMS delivery is added
          after the PO and invoice workflow is approved.
        </aside>

        <div className={styles.actions}>
          <Link className={styles.primaryButton} href="/portal">
            Return to agency portal
          </Link>
          <Link className={styles.secondaryButton} href="/order">
            Start another order
          </Link>
        </div>
      </section>
    </main>
  );
}
