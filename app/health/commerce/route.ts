import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import {
  CommerceConfigurationError,
  getCommerceServerConfig,
} from "../../../lib/server/config";

export const runtime = "nodejs";

export async function GET() {
  try {
    const config = getCommerceServerConfig();
    const supabase = createSupabaseAdminClient();

    const { error } = await supabase
      .from("orders")
      .select("id")
      .limit(1);

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          stage: "3A",
          database: "unavailable",
          message:
            "Supabase is reachable, but the Stage 3A migration may not be installed.",
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ok: true,
      stage: "3A",
      database: "ready",
      internalProcessingEmail: config.internalProcessingEmail,
      salesReplyToEmail: config.salesReplyToEmail,
      transactionalFromEmail: config.transactionalFromEmail,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        stage: "3A",
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
