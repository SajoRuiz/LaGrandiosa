"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import styles from "../../auth.module.css";

export default function MfaChallengeClient({
  nextPath,
}: {
  nextPath: string;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { data: factors, error: factorsError } =
        await supabase.auth.mfa.listFactors();

      if (factorsError) {
        throw factorsError;
      }

      const factor = factors.totp.find(
        (item) => item.status === "verified",
      );

      if (!factor) {
        router.replace(
          `/auth/mfa/enroll?next=${encodeURIComponent(nextPath)}`,
        );
        return;
      }

      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId: factor.id });

      if (challengeError) {
        throw challengeError;
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: factor.id,
        challengeId: challenge.id,
        code: code.trim(),
      });

      if (verifyError) {
        throw verifyError;
      }

      const response = await fetch("/api/auth/mfa/complete", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("The authenticator verification could not be recorded.");
      }

      router.replace(nextPath);
      router.refresh();
    } catch (challengeError) {
      setError(
        challengeError instanceof Error
          ? challengeError.message
          : "The authenticator code could not be verified.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.card}>
      <p className={styles.eyebrow}>SECURITY AUTHENTICATION</p>
      <h1>Enter your security code.</h1>
      <p>
        Open the authenticator app connected to your La Grandiosa account and
        enter its current time-based code.
      </p>

      {error ? <p className={styles.error}>{error}</p> : null}

      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.field}>
          <span>Authenticator code</span>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            minLength={6}
            maxLength={8}
            required
            autoFocus
          />
        </label>

        <button className={styles.button} type="submit" disabled={busy}>
          {busy ? "Verifying…" : "Verify and continue"}
        </button>
      </form>
    </section>
  );
}
