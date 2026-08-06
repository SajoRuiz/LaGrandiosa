import type { Metadata } from "next";
import Link from "next/link";
import { requireAgencyPurchaseAccess } from "@/lib/auth/access";
import ClientInformationForm from "./ClientInformationForm";
import styles from "./client.module.css";

export const metadata: Metadata = {
  title: "Client Information | La Grandiosa",
  description:
    "Provide the mandatory client information for a La Grandiosa advertising contract.",
};

export default async function ClientInformationPage() {
  const access = await requireAgencyPurchaseAccess("/checkout/client");

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

        <Link className={styles.backLink} href="/cart">
          Back to contract
        </Link>
      </header>

      <section className={styles.intro}>
        <p className={styles.eyebrow}>CLIENT INFORMATION</p>
        <h1>Tell us who is placing the order.</h1>
        <p>
          This order will be connected to {access.agency.display_name} and the
          authenticated purchaser {access.profile.full_name}. Enter the contact
          and billing information that should appear in the contract snapshot.
        </p>
      </section>

      <ClientInformationForm />
    </main>
  );
}
