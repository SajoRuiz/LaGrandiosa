"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { readContractCart } from "@/lib/cart";
import styles from "./client.module.css";

interface DraftOrderResponse {
  orderNumber?: string;
  error?: string;
}

export default function ClientInformationForm() {
  const router = useRouter();
  const [cartCount, setCartCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setCartCount(readContractCart().length);
  }, []);

  async function submitClientInformation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const cartItems = readContractCart();

    if (cartItems.length === 0) {
      setError("Your contract cart is empty. Add at least one combination first.");
      return;
    }

    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);

    try {
      const response = await fetch("/api/orders/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client: {
            fullName: data.get("fullName"),
            email: data.get("email"),
            telephone: data.get("telephone"),
            addressLine1: data.get("addressLine1"),
            addressLine2: data.get("addressLine2"),
            city: data.get("city"),
            region: data.get("region"),
            postalCode: data.get("postalCode"),
            country: data.get("country"),
            companyName: data.get("companyName"),
            agencyName: data.get("agencyName"),
            campaignName: data.get("campaignName"),
            purchaseOrderNumber: data.get("purchaseOrderNumber"),
            smsTransactionalConsent: data.get("smsTransactionalConsent") === "on",
          },
          cartItems,
        }),
      });

      const result = (await response.json()) as DraftOrderResponse;

      if (!response.ok || !result.orderNumber) {
        throw new Error(result.error ?? "The order could not be submitted.");
      }

      window.localStorage.removeItem("la-grandiosa-contract-cart-v2");
      router.push(`/checkout/received?order=${encodeURIComponent(result.orderNumber)}`);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "The order could not be submitted.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submitClientInformation}>
      <p className={styles.cartNotice}>
        Contract items ready for submission: <strong>{cartCount}</strong>
      </p>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.fieldGridTwo}>
        <label className={styles.field}>
          <span>Full name</span>
          <input name="fullName" autoComplete="name" required maxLength={180} />
        </label>
        <label className={styles.field}>
          <span>Email</span>
          <input name="email" type="email" autoComplete="email" required maxLength={254} />
        </label>
        <label className={styles.field}>
          <span>Telephone</span>
          <input name="telephone" type="tel" autoComplete="tel" required maxLength={40} />
        </label>
        <label className={styles.field}>
          <span>Company name</span>
          <input name="companyName" maxLength={180} />
        </label>
        <label className={styles.field}>
          <span>Agency name</span>
          <input name="agencyName" maxLength={180} />
        </label>
        <label className={styles.field}>
          <span>Campaign name</span>
          <input name="campaignName" maxLength={180} />
        </label>
      </div>

      <label className={styles.field}>
        <span>Address line 1</span>
        <input name="addressLine1" autoComplete="address-line1" required maxLength={180} />
      </label>
      <label className={styles.field}>
        <span>Address line 2</span>
        <input name="addressLine2" autoComplete="address-line2" maxLength={180} />
      </label>

      <div className={styles.fieldGridThree}>
        <label className={styles.field}>
          <span>City</span>
          <input name="city" autoComplete="address-level2" required maxLength={120} />
        </label>
        <label className={styles.field}>
          <span>State / region</span>
          <input name="region" autoComplete="address-level1" required maxLength={120} />
        </label>
        <label className={styles.field}>
          <span>Postal code</span>
          <input name="postalCode" autoComplete="postal-code" required maxLength={40} />
        </label>
      </div>

      <div className={styles.fieldGridTwo}>
        <label className={styles.field}>
          <span>Country</span>
          <input name="country" autoComplete="country-name" defaultValue="Puerto Rico" required maxLength={80} />
        </label>
        <label className={styles.field}>
          <span>Purchase order number</span>
          <input name="purchaseOrderNumber" maxLength={120} />
        </label>
      </div>

      <label className={styles.checkbox}>
        <input name="smsTransactionalConsent" type="checkbox" />
        Send transactional order status updates by SMS.
      </label>

      <button className={styles.primaryButton} type="submit" disabled={busy}>
        {busy ? "Submitting…" : "Submit client information"}
      </button>
    </form>
  );
}
