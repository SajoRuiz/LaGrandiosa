import Link from "next/link";
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
        <h1>Your order record has been created.</h1>

        {orderNumber ? (
          <p className={styles.orderNumber}>
            Order number: <strong>{orderNumber}</strong>
          </p>
        ) : null}

        <p>
          Your client information and contract selections are now stored in the
          secure order system. The contract-acceptance and payment choices—
          credit card, ACH, and Client Code—are the next production stage.
        </p>

        <aside className={styles.notice}>
          The notification outbox now contains the customer receipt and the
          internal processing alert for processing@lagrandiosapr.com. Actual
          delivery through email and SMS will be activated in Stage 3B.
        </aside>

        <div className={styles.actions}>
          <Link className={styles.primaryButton} href="/">
            Return to website
          </Link>
          <Link className={styles.secondaryButton} href="/order">
            Start another order
          </Link>
        </div>
      </section>
    </main>
  );
}
