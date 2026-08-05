import type { Metadata } from "next";
import Link from "next/link";
import ClientInformationForm from "./ClientInformationForm";
import styles from "./client.module.css";

export const metadata: Metadata = {
  title: "Client Information | La Grandiosa",
  description:
    "Provide the mandatory client information for a La Grandiosa advertising contract.",
};

export default function ClientInformationPage() {
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
          The following contact and billing information is required before the
          contract and payment stage.
        </p>
      </section>

      <ClientInformationForm />
    </main>
  );
}
