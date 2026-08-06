"use server";

import { redirect } from "next/navigation";
import { hashActivationCode } from "@/lib/server/activation-code";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function activationError(message: string): never {
  redirect(`/auth/activate?error=${encodeURIComponent(message)}`);
}

export async function activateAgencyAccount(formData: FormData) {
  const inviteId = String(formData.get("inviteId") ?? "").trim();
  const activationCode = String(formData.get("activationCode") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const telephone = String(formData.get("telephone") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!inviteId || !activationCode || !username || !fullName || !password) {
    activationError("Complete every required activation field.");
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,39}$/.test(username)) {
    activationError(
      "Username must contain 3–40 letters, numbers, periods, underscores, or hyphens.",
    );
  }

  if (password.length < 12) {
    activationError("Password must contain at least 12 characters.");
  }

  if (password !== confirmPassword) {
    activationError("The password confirmation does not match.");
  }

  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as { sub?: string; email?: string } | undefined;

  if (claimsError || !claims?.sub) {
    redirect("/auth/login?error=" + encodeURIComponent("Sign in through the invitation link first."));
  }

  const admin = createSupabaseAdminClient();
  const { data: existingUsername } = await admin
    .from("user_profiles")
    .select("user_id")
    .eq("username", username)
    .neq("user_id", claims.sub)
    .maybeSingle();

  if (existingUsername) {
    activationError("That username is already in use.");
  }

  const { error: passwordError } = await supabase.auth.updateUser({
    password,
    data: {
      username,
      full_name: fullName,
    },
  });

  if (passwordError) {
    activationError(passwordError.message);
  }

  const { data, error } = await supabase.rpc("activate_agency_invite", {
    p_invite_id: inviteId,
    p_username: username,
    p_full_name: fullName,
    p_telephone: telephone,
    p_invite_code_hash: hashActivationCode(activationCode),
  });

  if (error) {
    activationError(error.message);
  }

  const activated = Array.isArray(data) ? data[0] : data;

  if (!activated?.agency_id) {
    activationError("The agency account could not be activated.");
  }

  await admin.auth.admin.updateUserById(claims.sub, {
    app_metadata: {
      agency_id: activated.agency_id,
      agency_role: activated.agency_role,
    },
  });

  redirect("/auth/mfa/enroll?next=/portal");
}
