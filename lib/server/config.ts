export class CommerceConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommerceConfigurationError";
  }
}

function requireServerEnvironment(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new CommerceConfigurationError(
      `Missing required server environment variable: ${name}`,
    );
  }

  return value;
}

export interface CommerceServerConfig {
  appBaseUrl: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  internalProcessingEmail: string;
  salesReplyToEmail: string;
  transactionalFromEmail: string;
}

export function getCommerceServerConfig(): CommerceServerConfig {
  return {
    appBaseUrl:
      process.env.APP_BASE_URL?.trim() || "http://localhost:3000",
    supabaseUrl: requireServerEnvironment(
      "NEXT_PUBLIC_SUPABASE_URL",
    ),
    supabaseServiceRoleKey: requireServerEnvironment(
      "SUPABASE_SERVICE_ROLE_KEY",
    ),
    internalProcessingEmail: requireServerEnvironment(
      "INTERNAL_PROCESSING_EMAIL",
    ),
    salesReplyToEmail: requireServerEnvironment(
      "SALES_REPLY_TO_EMAIL",
    ),
    transactionalFromEmail: requireServerEnvironment(
      "TRANSACTIONAL_FROM_EMAIL",
    ),
  };
}
