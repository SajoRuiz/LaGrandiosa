import { NextRequest, NextResponse } from "next/server";
import {
  AgencyAccessError,
  requireStaffAccessForApi,
} from "@/lib/auth/access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function readText(
  value: unknown,
  name: string,
  maxLength: number,
  required = true,
): string {
  const text = typeof value === "string" ? value.trim() : "";

  if (required && !text) {
    throw new Error(`${name} is required.`);
  }

  if (text.length > maxLength) {
    throw new Error(`${name} is too long.`);
  }

  return text;
}

function readInteger(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
): number {
  const numberValue = Number(value);

  if (
    !Number.isInteger(numberValue) ||
    numberValue < minimum ||
    numberValue > maximum
  ) {
    throw new Error(`${name} is invalid.`);
  }

  return numberValue;
}

export async function POST(request: NextRequest) {
  try {
    const staff = await requireStaffAccessForApi([
      "finance",
      "system_admin",
    ]);
    const body = (await request.json()) as Record<string, unknown>;

    const legalName = readText(body.legalName, "Legal name", 180);
    const displayName = readText(body.displayName, "Display name", 180);
    const discountBasisPoints = readInteger(
      body.discountBasisPoints,
      "Discount",
      0,
      10000,
    );
    const approvedCreditLimitCents = readInteger(
      body.approvedCreditLimitCents,
      "Approved credit limit",
      0,
      10_000_000_000,
    );
    const paymentTermsDays = readInteger(
      body.paymentTermsDays,
      "Payment terms",
      0,
      365,
    );
    const discountPolicy = readText(
      body.discountPolicy,
      "Discount policy",
      40,
    );

    if (
      !["stack", "best_of", "agency_replaces_campaign"].includes(
        discountPolicy,
      )
    ) {
      throw new Error("Discount policy is invalid.");
    }

    const domains = Array.isArray(body.authorizedEmailDomains)
      ? body.authorizedEmailDomains
          .map((value) =>
            typeof value === "string"
              ? value.trim().toLowerCase().replace(/^@/, "")
              : "",
          )
          .filter(Boolean)
          .slice(0, 20)
      : [];

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("agency_accounts")
      .insert({
        legal_name: legalName,
        display_name: displayName,
        status: "active",
        discount_basis_points: discountBasisPoints,
        approved_credit_limit_cents: approvedCreditLimitCents,
        payment_terms_days: paymentTermsDays,
        discount_policy: discountPolicy,
        po_required: body.poRequired !== false,
        authorized_email_domains: domains,
        created_by_user_id: staff.identity.userId,
      })
      .select(
        "id,account_number,legal_name,display_name,status,discount_basis_points,approved_credit_limit_cents,payment_terms_days,discount_policy,po_required,authorized_email_domains",
      )
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message, code: "AGENCY_CREATE_FAILED" },
        { status: 400 },
      );
    }

    await admin.from("agency_account_history").insert({
      agency_id: data.id,
      actor_user_id: staff.identity.userId,
      event_key: "agency.account_created",
      metadata: {
        accountNumber: data.account_number,
        discountBasisPoints,
        approvedCreditLimitCents,
        paymentTermsDays,
      },
    });

    return NextResponse.json({ agency: data }, { status: 201 });
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
            : "The agency account could not be created.",
        code: "INVALID_AGENCY_REQUEST",
      },
      { status: 400 },
    );
  }
}
