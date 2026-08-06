"use server";

import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sanitizeNextPath, withNext } from "@/lib/auth/paths";

function loginError(nextPath: string): never {
  redirect(
    `/auth/login?error=${encodeURIComponent(
      "The username/email or password is incorrect.",
    )}&next=${encodeURIComponent(nextPath)}`,
  );
}

async function resolveEmail(identifier: string): Promise<string | null> {
  const normalized = identifier.trim().toLowerCase();

  if (normalized.includes("@")) {
    return normalized;
  }

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("user_profiles")
    .select("email,status")
    .eq("username", normalized)
    .maybeSingle();

  if (!data || data.status !== "active") {
    return null;
  }

  return String(data.email).toLowerCase();
}

export async function loginAction(formData: FormData) {
  const nextPath = sanitizeNextPath(
    String(formData.get("next") ?? "/portal"),
    "/portal",
  );
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!identifier || !password) {
    loginError(nextPath);
  }

  const email = await resolveEmail(identifier);

  if (!email) {
    loginError(nextPath);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    loginError(nextPath);
  }

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("user_profiles")
    .select("status")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (!profile) {
    const { data: invite } = await admin
      .from("agency_invites")
      .select("id,status")
      .eq("auth_user_id", data.user.id)
      .eq("status", "pending")
      .maybeSingle();

    if (invite) {
      redirect("/auth/activate");
    }

    await supabase.auth.signOut();
    redirect("/auth/access-denied?reason=profile-missing");
  }

  if (profile.status !== "active") {
    await supabase.auth.signOut();
    redirect("/auth/access-denied?reason=account-inactive");
  }

  const { data: aal } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (aal?.currentLevel === "aal2") {
    redirect(nextPath);
  }

  if (aal?.nextLevel === "aal2") {
    redirect(withNext("/auth/mfa/challenge", nextPath));
  }

  redirect(withNext("/auth/mfa/enroll", nextPath));
}
