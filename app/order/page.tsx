import type { Metadata } from "next";
import Link from "next/link";
import { requireAgencyPurchaseAccess } from "@/lib/auth/access";
import BookingConfigurator from "./BookingConfigurator";
import styles from "./order.module.css";

export const metadata: Metadata = {
  title: "Place Order | La Grandiosa",
  description:
    "Select full-day campaign dates and add La Grandiosa advertising combinations to one contract.",
};

export default async function OrderPage() {
  const access = await requireAgencyPurchaseAccess("/order");

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
          <Link className={styles.backLink} href="/portal">
            {access.agency.account_number}
          </Link>
          <Link className={styles.cartLink} href="/cart">
            View contract
          </Link>
        </div>
      </header>

      <section className={styles.intro}>
        <p className={styles.eyebrow}>PLACE YOUR ORDER</p>
        <h1>Build your campaign.</h1>
        <p>
          Signed in for {access.agency.display_name}. Every purchase includes
          the complete daily operating window: 12 hours on regular open days,
          14 hours on configured extended holidays, and no delivery on closed
          holidays. Add multiple combinations to one contract.
        </p>
      </section>

      <BookingConfigurator />
    </main>
  );
}
