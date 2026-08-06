import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  CommerceConfigurationError,
  getCommerceServerConfig,
} from "@/lib/server/config";

export const runtime = "nodejs";

export async function GET() {
  try {
    const config = getCommerceServerConfig();
    const supabase = createSupabaseAdminClient();

    const tableChecks = await Promise.all([
      supabase.from("orders").select("id").limit(1),
      supabase.from("agency_accounts").select("id").limit(1),
      supabase.from("user_profiles").select("user_id").limit(1),
      supabase.from("agency_invites").select("id").limit(1),
    ]);

    const failed = tableChecks.find((result) => result.error);

    if (failed?.error) {
      return NextResponse.json(
        {
          ok: false,
          stage: "3B-A",
          database: "unavailable",
          message:
            "Supabase is reachable, but the Stage 3B-A agency-auth migration may not be installed.",
          detail: failed.error.message,
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ok: true,
      stage: "3B-A",
      database: "ready",
      authentication: "invite-only email/password + TOTP MFA",
      internalProcessingEmail: config.internalProcessingEmail,
      salesReplyToEmail: config.salesReplyToEmail,
      transactionalFromEmail: config.transactionalFromEmail,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        stage: "3B-A",
        database: "not_configured",
        message:
          error instanceof CommerceConfigurationError
            ? error.message
            : "Commerce health check failed.",
      },
      { status: 503 },
    );
  }
}
