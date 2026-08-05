import type { ContractCartItem } from "../cart";

export interface ClientInformationInput {
  fullName: string;
  email: string;
  telephone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  companyName: string;
  agencyName: string;
  campaignName: string;
  purchaseOrderNumber: string;
  smsTransactionalConsent: boolean;
}

export interface DraftCheckoutRequest {
  client: ClientInformationInput;
  cartItems: ContractCartItem[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(
  record: Record<string, unknown>,
  key: string,
  options: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
  } = {},
): string {
  const value = record[key];
  const text = typeof value === "string" ? value.trim() : "";

  if (options.required && !text) {
    throw new Error(`${key} is required.`);
  }

  if (text && options.minLength && text.length < options.minLength) {
    throw new Error(`${key} is too short.`);
  }

  if (text.length > (options.maxLength ?? 300)) {
    throw new Error(`${key} is too long.`);
  }

  return text;
}

function parseClient(value: unknown): ClientInformationInput {
  if (!isRecord(value)) {
    throw new Error("Client information is required.");
  }

  const email = readString(value, "email", {
    required: true,
    maxLength: 254,
  }).toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }

  const telephone = readString(value, "telephone", {
    required: true,
    minLength: 7,
    maxLength: 40,
  });

  return {
    fullName: readString(value, "fullName", {
      required: true,
      minLength: 2,
      maxLength: 160,
    }),
    email,
    telephone,
    addressLine1: readString(value, "addressLine1", {
      required: true,
      minLength: 3,
      maxLength: 200,
    }),
    addressLine2: readString(value, "addressLine2", {
      maxLength: 200,
    }),
    city: readString(value, "city", {
      required: true,
      minLength: 2,
      maxLength: 120,
    }),
    region: readString(value, "region", {
      required: true,
      minLength: 2,
      maxLength: 120,
    }),
    postalCode: readString(value, "postalCode", {
      required: true,
      minLength: 3,
      maxLength: 24,
    }),
    country: readString(value, "country", {
      required: true,
      minLength: 2,
      maxLength: 120,
    }),
    companyName: readString(value, "companyName", {
      maxLength: 180,
    }),
    agencyName: readString(value, "agencyName", {
      maxLength: 180,
    }),
    campaignName: readString(value, "campaignName", {
      maxLength: 180,
    }),
    purchaseOrderNumber: readString(value, "purchaseOrderNumber", {
      maxLength: 100,
    }),
    smsTransactionalConsent:
      value.smsTransactionalConsent === true,
  };
}

function parseCartItem(value: unknown, index: number): ContractCartItem {
  if (!isRecord(value)) {
    throw new Error(`Cart item ${index + 1} is invalid.`);
  }

  const id = readString(value, "id", {
    required: true,
    maxLength: 160,
  });
  const sku = readString(value, "sku", {
    required: true,
    maxLength: 120,
  });
  const startDate = readString(value, "startDate", {
    required: true,
    maxLength: 10,
  });
  const endDate = readString(value, "endDate", {
    required: true,
    maxLength: 10,
  });
  const createdAt = readString(value, "createdAt", {
    required: true,
    maxLength: 60,
  });

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    throw new Error(`Cart item ${index + 1} has an invalid start date.`);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new Error(`Cart item ${index + 1} has an invalid end date.`);
  }

  return { id, sku, startDate, endDate, createdAt };
}

export function parseDraftCheckoutRequest(
  value: unknown,
): DraftCheckoutRequest {
  if (!isRecord(value)) {
    throw new Error("The checkout request is invalid.");
  }

  if (!Array.isArray(value.cartItems) || value.cartItems.length === 0) {
    throw new Error("At least one contract item is required.");
  }

  if (value.cartItems.length > 25) {
    throw new Error("A contract cannot contain more than 25 combinations.");
  }

  const cartItems = value.cartItems.map(parseCartItem);
  const uniqueIds = new Set(cartItems.map((item) => item.id));

  if (uniqueIds.size !== cartItems.length) {
    throw new Error("The contract contains duplicate cart item IDs.");
  }

  return {
    client: parseClient(value.client),
    cartItems,
  };
}
