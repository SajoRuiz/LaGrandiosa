import {
  getAdCombinationBySku,
  type AdCombination,
} from "../../data/ad-combinations";
import type { ContractCartItem } from "../cart";
import {
  calculateCampaignPrice,
  type CampaignPriceBreakdown,
} from "../pricing";
import { estimatePlaysForServiceHours } from "../service-calendar";
import type { ClientInformationInput } from "./checkout-input";

export interface DraftOrderLine {
  cartItem: ContractCartItem;
  combination: AdCombination;
  pricing: CampaignPriceBreakdown;
  estimatedPlays: number;
}

export interface DraftOrderTotals {
  grossMediaSubtotalCents: number;
  closedHolidayDeductionCents: number;
  adjustedMediaSubtotalCents: number;
  dateSelectionPremiumCents: number;
  multiMonthDiscountCents: number;
  taxCents: number;
  totalCents: number;
}

export interface BuiltDraftOrder {
  lines: DraftOrderLine[];
  totals: DraftOrderTotals;
  clientPayload: Record<string, unknown>;
  orderPayload: Record<string, unknown>;
  itemPayloads: Array<Record<string, unknown>>;
}

function resolveLine(item: ContractCartItem): DraftOrderLine {
  const combination = getAdCombinationBySku(item.sku);

  if (!combination) {
    throw new Error(`Unknown advertising combination: ${item.sku}`);
  }

  const pricing = calculateCampaignPrice(
    combination.monthlyRateCents,
    item.startDate,
    item.endDate,
  );

  return {
    cartItem: item,
    combination,
    pricing,
    estimatedPlays: estimatePlaysForServiceHours(
      combination.playsPer12HourDay,
      pricing.totalServiceHours,
    ),
  };
}

function calculateTotals(lines: DraftOrderLine[]): DraftOrderTotals {
  return lines.reduce<DraftOrderTotals>(
    (totals, line) => ({
      grossMediaSubtotalCents:
        totals.grossMediaSubtotalCents +
        line.pricing.grossMediaSubtotalCents,
      closedHolidayDeductionCents:
        totals.closedHolidayDeductionCents +
        line.pricing.closedHolidayDeductionCents,
      adjustedMediaSubtotalCents:
        totals.adjustedMediaSubtotalCents +
        line.pricing.mediaSubtotalCents,
      dateSelectionPremiumCents:
        totals.dateSelectionPremiumCents +
        line.pricing.dateSelectionPremiumCents,
      multiMonthDiscountCents:
        totals.multiMonthDiscountCents +
        line.pricing.multiMonthDiscountCents,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents + line.pricing.totalCents,
    }),
    {
      grossMediaSubtotalCents: 0,
      closedHolidayDeductionCents: 0,
      adjustedMediaSubtotalCents: 0,
      dateSelectionPremiumCents: 0,
      multiMonthDiscountCents: 0,
      taxCents: 0,
      totalCents: 0,
    },
  );
}

export function buildDraftOrder(
  client: ClientInformationInput,
  cartItems: ContractCartItem[],
): BuiltDraftOrder {
  const lines = cartItems.map(resolveLine);
  const totals = calculateTotals(lines);

  const clientPayload = {
    full_name: client.fullName,
    email: client.email,
    telephone: client.telephone,
    address_line_1: client.addressLine1,
    address_line_2: client.addressLine2,
    city: client.city,
    region: client.region,
    postal_code: client.postalCode,
    country: client.country,
    company_name: client.companyName,
    agency_name: client.agencyName,
    campaign_name: client.campaignName,
    purchase_order_number: client.purchaseOrderNumber,
    sms_transactional_consent: client.smsTransactionalConsent,
  };

  const orderPayload = {
    currency: "USD",
    gross_media_subtotal_cents: totals.grossMediaSubtotalCents,
    closed_holiday_deduction_cents:
      totals.closedHolidayDeductionCents,
    adjusted_media_subtotal_cents:
      totals.adjustedMediaSubtotalCents,
    date_selection_premium_cents:
      totals.dateSelectionPremiumCents,
    multi_month_discount_cents:
      totals.multiMonthDiscountCents,
    tax_cents: totals.taxCents,
    total_cents: totals.totalCents,
    source: "web_checkout",
    pricing_snapshot: {
      pricingVersion: "stage-2b-v4",
      generatedAt: new Date().toISOString(),
      itemCount: lines.length,
      totals,
    },
  };

  const itemPayloads = lines.map((line, index) => ({
    cart_item_id: line.cartItem.id,
    sort_order: index,
    sku: line.combination.sku,
    start_date: line.cartItem.startDate,
    end_date: line.cartItem.endDate,
    combination_snapshot: line.combination,
    pricing_snapshot: {
      ...line.pricing,
      estimatedPlays: line.estimatedPlays,
    },
    total_cents: line.pricing.totalCents,
  }));

  return {
    lines,
    totals,
    clientPayload,
    orderPayload,
    itemPayloads,
  };
}
