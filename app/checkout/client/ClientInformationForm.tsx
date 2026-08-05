"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  clearContractCart,
  readContractCart,
  type ContractCartItem,
} from "../../../lib/cart";
import {
  getAdCombinationBySku,
  type AdCombination,
} from "../../../data/ad-combinations";
import {
  calculateCampaignPrice,
  type CampaignPriceBreakdown,
} from "../../../lib/pricing";
import styles from "./client.module.css";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

interface ResolvedLine {
  item: ContractCartItem;
  combination: AdCombination;
  pricing: CampaignPriceBreakdown;
}

interface DraftOrderResponse {
  orderId: string;
  orderNumber: string;
  status: string;
  error?: string;
}

export default function ClientInformationForm() {
  const router = useRouter();
  const [items, setItems] = useState<ContractCartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setItems(readContractCart());
    setHydrated(true);
  }, []);

  const lines = useMemo<ResolvedLine[]>(() => {
    return items.flatMap((item) => {
      const combination = getAdCombinationBySku(item.sku);

      if (!combination) {
        return [];
      }

      return [
        {
          item,
          combination,
          pricing: calculateCampaignPrice(
            combination.monthlyRateCents,
            item.startDate,
            item.endDate,
          ),
        },
      ];
    });
  }, [items]);

  const totalCents = useMemo(
    () =>
      lines.reduce(
        (total, line) => total + line.pricing.totalCents,
        0,
      ),
    [lines],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (items.length === 0) {
      setError("The contract cart is empty.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);

    const client = {
      fullName: String(formData.get("fullName") ?? ""),
      email: String(formData.get("email") ?? ""),
      telephone: String(formData.get("telephone") ?? ""),
      addressLine1: String(formData.get("addressLine1") ?? ""),
      addressLine2: String(formData.get("addressLine2") ?? ""),
      city: String(formData.get("city") ?? ""),
      region: String(formData.get("region") ?? ""),
      postalCode: String(formData.get("postalCode") ?? ""),
      country: String(formData.get("country") ?? ""),
      companyName: String(formData.get("companyName") ?? ""),
      agencyName: String(formData.get("agencyName") ?? ""),
      campaignName: String(formData.get("campaignName") ?? ""),
      purchaseOrderNumber: String(
        formData.get("purchaseOrderNumber") ?? "",
      ),
      smsTransactionalConsent:
        formData.get("smsTransactionalConsent") === "on",
    };

    setSubmitting(true);

    try {
      const response = await fetch("/api/orders/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client, cartItems: items }),
      });

      const result = (await response.json()) as DraftOrderResponse;

      if (!response.ok) {
        throw new Error(
          result.error || "The order information could not be saved.",
        );
      }

      clearContractCart();
      router.push(
        `/checkout/received?order=${encodeURIComponent(
          result.orderNumber,
        )}`,
      );
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "The order information could not be saved.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!hydrated) {
    return (
      <section className={styles.loading} aria-live="polite">
        Loading contract information…
      </section>
    );
  }

  if (lines.length === 0) {
    return (
      <section className={styles.empty}>
        <h2>Your contract is empty.</h2>
        <p>Add at least one advertising combination before continuing.</p>
        <Link className={styles.primaryButton} href="/order">
          Build a campaign
        </Link>
      </section>
    );
  }

  return (
    <form className={styles.checkout} onSubmit={handleSubmit}>
      <section className={styles.formPanel}>
        <div className={styles.sectionHeading}>
          <span>01</span>
          <div>
            <h2>Mandatory contact information</h2>
            <p>Fields marked “Required” must be completed.</p>
          </div>
        </div>

        <div className={styles.fieldGridTwo}>
          <label className={styles.field}>
            <span>Full name · Required</span>
            <input
              name="fullName"
              type="text"
              autoComplete="name"
              required
              maxLength={160}
            />
          </label>

          <label className={styles.field}>
            <span>Email · Required</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
            />
          </label>

          <label className={styles.field}>
            <span>Telephone · Required</span>
            <input
              name="telephone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              placeholder="+1 787 000 0000"
              required
              maxLength={40}
            />
          </label>

          <label className={styles.field}>
            <span>Company or legal entity</span>
            <input
              name="companyName"
              type="text"
              autoComplete="organization"
              maxLength={180}
            />
          </label>
        </div>

        <div className={styles.sectionHeadingSecondary}>
          <span>02</span>
          <div>
            <h2>Mandatory address</h2>
            <p>This address will appear in the contract snapshot.</p>
          </div>
        </div>

        <div className={styles.fieldGridTwo}>
          <label className={`${styles.field} ${styles.fieldFull}`}>
            <span>Address line 1 · Required</span>
            <input
              name="addressLine1"
              type="text"
              autoComplete="address-line1"
              required
              maxLength={200}
            />
          </label>

          <label className={`${styles.field} ${styles.fieldFull}`}>
            <span>Address line 2</span>
            <input
              name="addressLine2"
              type="text"
              autoComplete="address-line2"
              maxLength={200}
            />
          </label>

          <label className={styles.field}>
            <span>City · Required</span>
            <input
              name="city"
              type="text"
              autoComplete="address-level2"
              required
              maxLength={120}
            />
          </label>

          <label className={styles.field}>
            <span>State or territory · Required</span>
            <input
              name="region"
              type="text"
              autoComplete="address-level1"
              defaultValue="Puerto Rico"
              required
              maxLength={120}
            />
          </label>

          <label className={styles.field}>
            <span>Postal code · Required</span>
            <input
              name="postalCode"
              type="text"
              autoComplete="postal-code"
              required
              maxLength={24}
            />
          </label>

          <label className={styles.field}>
            <span>Country · Required</span>
            <input
              name="country"
              type="text"
              autoComplete="country-name"
              defaultValue="United States"
              required
              maxLength={120}
            />
          </label>
        </div>

        <div className={styles.sectionHeadingSecondary}>
          <span>03</span>
          <div>
            <h2>Optional contract references</h2>
            <p>These details can help the processing team identify the buy.</p>
          </div>
        </div>

        <div className={styles.fieldGridTwo}>
          <label className={styles.field}>
            <span>Agency name</span>
            <input name="agencyName" type="text" maxLength={180} />
          </label>

          <label className={styles.field}>
            <span>Campaign name</span>
            <input name="campaignName" type="text" maxLength={180} />
          </label>

          <label className={`${styles.field} ${styles.fieldFull}`}>
            <span>Purchase-order number</span>
            <input
              name="purchaseOrderNumber"
              type="text"
              maxLength={100}
            />
          </label>
        </div>

        <label className={styles.consent}>
          <input name="smsTransactionalConsent" type="checkbox" />
          <span>
            I agree to receive transactional SMS updates related to this
            order. This does not authorize promotional messages.
          </span>
        </label>

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        <button
          className={styles.submitButton}
          type="submit"
          disabled={submitting}
        >
          {submitting
            ? "Saving client information…"
            : "Save and continue"}
        </button>
      </section>

      <aside className={styles.summary}>
        <p className={styles.summaryLabel}>CONTRACT SUMMARY</p>
        <h2>
          {lines.length} combination{lines.length === 1 ? "" : "s"}
        </h2>

        <div className={styles.lineList}>
          {lines.map(({ item, combination, pricing }) => (
            <article className={styles.line} key={item.id}>
              <strong>
                {combination.durationSeconds}s {combination.formatLabel}
              </strong>
              <span>{combination.screenLabel}</span>
              <span>
                {item.startDate} → {item.endDate}
              </span>
              <b>{currency.format(pricing.totalCents / 100)}</b>
            </article>
          ))}
        </div>

        <div className={styles.grandTotal}>
          <span>Current contract total</span>
          <strong>{currency.format(totalCents / 100)}</strong>
        </div>

        <p className={styles.notice}>
          Saving this form creates a secure order record and queues the first
          customer and processing-team notifications. It does not charge a
          payment method. Contract acceptance and payment follow in Stage 3B.
        </p>
      </aside>
    </form>
  );
}
