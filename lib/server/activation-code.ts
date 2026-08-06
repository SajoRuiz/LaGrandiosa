import { createHash, randomBytes } from "node:crypto";

export function normalizeActivationCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function hashActivationCode(value: string): string {
  return createHash("sha256")
    .update(normalizeActivationCode(value), "utf8")
    .digest("hex");
}

export function generateActivationCode(): string {
  const hex = randomBytes(8).toString("hex").toUpperCase();
  return `LG-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
}
