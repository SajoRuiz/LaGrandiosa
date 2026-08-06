import { NextResponse, type NextRequest } from "next/server";
import { sanitizeNextPath } from "@/lib/auth/paths";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = sanitizeNextPath(
    url.searchParams.get("next"),
    "/auth/activate",
  );
  const supabase = await createSupabaseServerClient();

  // Supabase's PKCE invitation flow normally returns a code.
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  // This also supports a custom Invite User email template that returns the
  // token hash directly to this callback route.
  if (tokenHash && type === "invite") {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "invite",
    });

    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(
    new URL(
      "/auth/login?error=" +
        encodeURIComponent(
          "The invitation or authentication link is invalid or expired.",
        ),
      request.url,
    ),
  );
}
