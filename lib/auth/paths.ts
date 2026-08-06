export function sanitizeNextPath(
  value: string | null | undefined,
  fallback = "/portal",
): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  return value;
}

export function withNext(path: string, nextPath: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}next=${encodeURIComponent(nextPath)}`;
}
