import { NextRequest, NextResponse } from "next/server";
import {
  AgencyAccessError,
  requireAgencyPurchaseAccessForApi,
} from "@/lib/auth/access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  CommerceConfigurationError,
  getCommerceServerConfig,
} from "@/lib/server/config";
import { parseDraftCheckoutRequest } from "@/lib/server/checkout-input";
import { buildDraftOrder } from "@/lib/server/order-draft";

export const runtime = "nodejs";

interface CreateOrderResult {
  order_id: string;
  order_number: string;
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireAgencyPurchaseAccessForApi();
    const input = parseDraftCheckoutRequest(await request.json());
    const built = buildDraftOrder(input.client, input.cartItems);
    const config = getCommerceServerConfig();
    const supabase = createSupabaseAdminClient();
    const timestamp = Date.now();

    const notifications: Array<Record<string, unknown>> = [
      {
        channel: "email",
        template_key: "customer_client_information_received",
        recipient: input.client.email,
        sender_email: config.transactionalFromEmail,
        reply_to_email: config.salesReplyToEmail,
        dedupe_key: `customer-client-info-${access.identity.userId}-${timestamp}`,
        payload: {
          clientName: input.client.fullName,
          purchaserName: access.profile.full_name,
          agencyName: access.agency.display_name,
          agencyAccountNumber: access.agency.account_number,
          itemCount: built.lines.length,
          totalCents: built.totals.totalCents,
          currency: "USD",
          nextStep: "purchase_order_and_credit_review",
        },
      },
      {
        channel: "email",
        template_key: "internal_new_agency_order_received",
        recipient: config.internalProcessingEmail,
        sender_email: config.transactionalFromEmail,
        reply_to_email: config.salesReplyToEmail,
        dedupe_key: `internal-agency-order-${access.identity.userId}-${timestamp}`,
        payload: {
          clientName: input.client.fullName,
          clientEmail: input.client.email,
          clientTelephone: input.client.telephone,
          companyName: input.client.companyName,
          agencyName: access.agency.display_name,
          agencyAccountNumber: access.agency.account_number,
          purchaserName: access.profile.full_name,
          purchaserUsername: access.profile.username,
          itemCount: built.lines.length,
          totalCents: built.totals.totalCents,
          currency: "USD",
        },
      },
    ];

    if (input.client.smsTransactionalConsent) {
      notifications.push({
        channel: "sms",
        template_key: "customer_order_received_sms",
        recipient: input.client.telephone,
        sender_email: "",
        reply_to_email: "",
        dedupe_key: `customer-order-sms-${access.identity.userId}-${timestamp}`,
        payload: {
          clientName: input.client.fullName,
          agencyName: access.agency.display_name,
          nextStep: "purchase_order_and_credit_review",
        },
      });
    }

    const orderPayload = {
      ...built.orderPayload,
      agency_id: access.agency.id,
      ordered_by_user_id: access.identity.userId,
      source: "agency_portal",
      pricing_snapshot: {
        ...(built.orderPayload.pricing_snapshot as Record<string, unknown>),
        agencyAccount: {
          id: access.agency.id,
          accountNumber: access.agency.account_number,
          displayName: access.agency.display_name,
          discountBasisPoints: access.agency.discount_basis_points,
          approvedCreditLimitCents:
            access.agency.approved_credit_limit_cents,
          paymentTermsDays: access.agency.payment_terms_days,
          discountPolicy: access.agency.discount_policy,
          poRequired: access.agency.po_required,
        },
        authenticatedPurchaser: {
          userId: access.identity.userId,
          username: access.profile.username,
          fullName: access.profile.full_name,
          role: access.membership.role,
        },
      },
    };

    const { data, error } = await supabase.rpc(
      "create_agency_order_draft",
      {
        p_client: built.clientPayload,
        p_order: orderPayload,
        p_items: built.itemPayloads,
        p_notifications: notifications,
      },
    );

    if (error) {
      console.error("Supabase create_agency_order_draft failed", error);
      return NextResponse.json(
        {
          error:
            "The authenticated agency order could not be saved. Confirm that the Stage 3B-A migration has been applied.",
          code: "AGENCY_ORDER_SAVE_FAILED",
        },
        { status: 500 },
      );
    }

    const result = (Array.isArray(data) ? data[0] : data) as
      | CreateOrderResult
      | undefined;

    if (!result?.order_id || !result.order_number) {
      return NextResponse.json(
        {
          error: "The order was saved without a valid confirmation response.",
          code: "INVALID_ORDER_RESPONSE",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        orderId: result.order_id,
        orderNumber: result.order_number,
        status: "client_information_received",
        agencyAccountNumber: access.agency.account_number,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Agency draft checkout failed", error);

    if (error instanceof AgencyAccessError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }

    if (error instanceof CommerceConfigurationError) {
      return NextResponse.json(
        {
          error:
            "Commerce storage is not configured. Add the Supabase environment variables before submitting an order.",
          code: "COMMERCE_NOT_CONFIGURED",
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The checkout request is invalid.",
        code: "INVALID_CHECKOUT_REQUEST",
      },
      { status: 400 },
    );
  }
}
