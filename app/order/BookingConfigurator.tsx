"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { adCombinations } from "@/data/ad-combinations";
import { addContractCartItem } from "@/lib/cart";
import { calculateCampaignPrice, pricingBasisLabel } from "@/lib/pricing";
import styles from "./order.module.css";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function BookingConfigurator() {
  const [sku, setSku] = useState(adCombinations[0]?.sku ?? "");
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selected = useMemo(
    () => adCombinations.find((combination) => combination.sku === sku),
    [sku],
  );

  const pricing = useMemo(() => {
    if (!selected || !startDate || !endDate) {
      return undefined;
    }

    try {
      return calculateCampaignPrice(
        selected.monthlyRateCents,
        startDate,
        endDate,
      );
    } catch {
      return undefined;
    }
  }, [endDate, selected, startDate]);

  function addToContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!selected || !pricing) {
      setError("Select a valid combination and date range.");
      return;
    }

    const result = addContractCartItem({ sku, startDate, endDate });

    if (!result.added) {
      setError("That exact combination and date range is already in the contract.");
      return;
    }

    setMessage("Added to contract cart.");
  }

  return (
    <section className={styles.configurator}>
      <form className={styles.form} onSubmit={addToContract}>
        <label className={styles.field}>
          <span>Advertising combination</span>
          <select value={sku} onChange={(event) => setSku(event.target.value)}>
            {adCombinations.map((combination) => (
              <option key={combination.sku} value={combination.sku}>
                {combination.durationSeconds}s {combination.formatLabel} · {combination.screenLabel} · {currency.format(combination.monthlyRateCents / 100)} / month
              </option>
            ))}
          </select>
        </label>

        <div className={styles.fieldGridTwo}>
          <label className={styles.field}>
            <span>Start date</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              required
            />
          </label>

          <label className={styles.field}>
            <span>End date</span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              required
            />
          </label>
        </div>

        {pricing ? (
          <dl className={styles.summary}>
            <div>
              <dt>Pricing basis</dt>
              <dd>{pricingBasisLabel(pricing)}</dd>
            </div>
            <div>
              <dt>Calendar days</dt>
              <dd>{pricing.calendarDays}</dd>
            </div>
            <div>
              <dt>Operating days</dt>
              <dd>{pricing.operatingDays}</dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>{currency.format(pricing.totalCents / 100)}</dd>
            </div>
          </dl>
        ) : (
          <p className={styles.error}>Enter a valid date range with operating days.</p>
        )}

        {message ? <p className={styles.success}>{message}</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.actions}>
          <button className={styles.primaryButton} type="submit">
            Add to contract
          </button>
          <Link className={styles.secondaryButton} href="/cart">
            View contract
          </Link>
        </div>
      </form>
    </section>
  );
}
