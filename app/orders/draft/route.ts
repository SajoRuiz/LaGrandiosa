import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import {
  CommerceConfigurationError,
  getCommerceServerConfig,
} from "../../../lib/server/config";
import { parseDraftCheckoutRequest } from "../../../lib/server/checkout-input";
import { buildDraftOrder } from "../../../lib/server/order-draft";

export const runtime = "nodejs";

interface CreateOrderResult {
  order_id: string;
  order_number: string;
}

export async function POST(request: NextRequest) {
  try {
    const input = parseDraftCheckoutRequest(await request.json());
    const built = buildDraftOrder(input.client, input.cartItems);
    const config = getCommerceServerConfig();
    const supabase = createSupabaseAdminClient();

    const notifications: Array<Record<string, unknown>> = [
      {
        channel: "email",
        template_key: "customer_client_information_received",
        recipient: input.client.email,
        sender_email: config.transactionalFromEmail,
        reply_to_email: config.salesReplyToEmail,
        dedupe_key: `customer-client-info-${input.client.email}-${Date.now()}`,
        payload: {
          clientName: input.client.fullName,
          itemCount: built.lines.length,
          totalCents: built.totals.totalCents,
          currency: "USD",
          nextStep: "contract_and_payment",
        },
      },
      {
        channel: "email",
        template_key: "internal_new_order_received",
        recipient: config.internalProcessingEmail,
        sender_email: config.transactionalFromEmail,
        reply_to_email: config.salesReplyToEmail,
        dedupe_key: `internal-new-order-${input.client.email}-${Date.now()}`,
        payload: {
          clientName: input.client.fullName,
          clientEmail: input.client.email,
          clientTelephone: input.client.telephone,
          companyName: input.client.companyName,
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
        dedupe_key: `customer-order-sms-${input.client.telephone}-${Date.now()}`,
        payload: {
          clientName: input.client.fullName,
          nextStep: "contract_and_payment",
        },
      });
    }

    const { data, error } = await supabase.rpc("create_order_draft", {
      p_client: built.clientPayload,
      p_order: built.orderPayload,
      p_items: built.itemPayloads,
      p_notifications: notifications,
    });

    if (error) {
      console.error("Supabase create_order_draft failed", error);
      return NextResponse.json(
        {
          error:
            "The order could not be saved. Confirm that the Stage 3A database migration has been applied.",
          code: "ORDER_SAVE_FAILED",
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
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Draft checkout failed", error);

    if (error instanceof CommerceConfigurationError) {
      return NextResponse.json(
        {
          error:
            "Commerce storage is not configured yet. Add the Supabase environment variables before submitting an order.",
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
