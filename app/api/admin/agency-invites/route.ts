import { NextRequest, NextResponse } from "next/server";
import {
  AgencyAccessError,
  requireStaffAccessForApi,
} from "@/lib/auth/access";
import {
  generateActivationCode,
  hashActivationCode,
} from "@/lib/server/activation-code";
import { getCommerceServerConfig } from "@/lib/server/config";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const DAY_MS = 86_400_000;

export async function POST(request: NextRequest) {
  try {
    const staff = await requireStaffAccessForApi([
      "finance",
      "system_admin",
    ]);
    const body = (await request.json()) as Record<string, unknown>;
    const agencyId =
      typeof body.agencyId === "string" ? body.agencyId.trim() : "";
    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";
    const role =
      body.role === "agency_admin" ? "agency_admin" : "agency_buyer";
    const expiresInDays = Number(body.expiresInDays ?? 7);

    if (!agencyId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Select an agency and enter a valid email address.");
    }

    if (
      !Number.isInteger(expiresInDays) ||
      expiresInDays < 1 ||
      expiresInDays > 30
    ) {
      throw new Error("Invitation validity must be between 1 and 30 days.");
    }

    const admin = createSupabaseAdminClient();
    const { data: agency } = await admin
      .from("agency_accounts")
      .select(
        "id,display_name,status,authorized_email_domains,effective_date,expires_at",
      )
      .eq("id", agencyId)
      .maybeSingle();

    const today = new Date().toISOString().slice(0, 10);

    if (
      !agency ||
      agency.status !== "active" ||
      String(agency.effective_date) > today ||
      (agency.expires_at && String(agency.expires_at) < today)
    ) {
      throw new Error("The selected agency account is not currently active.");
    }

    const domains = Array.isArray(agency.authorized_email_domains)
      ? agency.authorized_email_domains.map((value) =>
          String(value).toLowerCase(),
        )
      : [];
    const emailDomain = email.split("@")[1] ?? "";

    if (domains.length > 0 && !domains.includes(emailDomain)) {
      throw new Error(
        "The email address is outside the agency's authorized domains.",
      );
    }

    const activationCode = generateActivationCode();
    const inviteId = crypto.randomUUID();
    const expiresAt = new Date(
      Date.now() + expiresInDays * DAY_MS,
    ).toISOString();

    const { error: insertError } = await admin.from("agency_invites").insert({
      id: inviteId,
      agency_id: agencyId,
      email,
      role,
      can_purchase: body.canPurchase !== false,
      invite_code_hash: hashActivationCode(activationCode),
      status: "pending",
      invited_by_user_id: staff.identity.userId,
      expires_at: expiresAt,
    });

    if (insertError) {
      throw new Error(insertError.message);
    }

    const config = getCommerceServerConfig();
    const redirectTo = `${config.appBaseUrl}/auth/callback?next=/auth/activate`;
    const { data: invited, error: inviteError } =
      await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: {
          agency_invite_id: inviteId,
          agency_id: agencyId,
          agency_name: agency.display_name,
        },
      });

    if (inviteError || !invited.user) {
      await admin
        .from("agency_invites")
        .update({ status: "revoked" })
        .eq("id", inviteId);

      throw new Error(
        inviteError?.message ?? "Supabase did not create the invited user.",
      );
    }

    await admin
      .from("agency_invites")
      .update({
        auth_user_id: invited.user.id,
        auth_invited_at: new Date().toISOString(),
      })
      .eq("id", inviteId);

    await admin.from("agency_account_history").insert({
      agency_id: agencyId,
      actor_user_id: staff.identity.userId,
      event_key: "agency.user_invited",
      metadata: {
        inviteId,
        email,
        role,
        canPurchase: body.canPurchase !== false,
        expiresAt,
      },
    });

    return NextResponse.json(
      {
        invite: {
          id: inviteId,
          email,
          agencyName: agency.display_name,
          role,
          expiresAt,
        },
        activationCode,
        warning:
          "This activation code is displayed only in this response. Share it through a separate secure channel.",
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AgencyAccessError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The agency invitation could not be created.",
        code: "AGENCY_INVITE_FAILED",
      },
      { status: 400 },
    );
  }
}
