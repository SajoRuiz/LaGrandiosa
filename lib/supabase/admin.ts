import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getCommerceServerConfig } from "../server/config";

/**
 * Server-only Supabase client.
 *
 * Never import this file into a Client Component and never expose the
 * service-role key through a NEXT_PUBLIC_ environment variable.
 */
export function createSupabaseAdminClient(): SupabaseClient {
  const config = getCommerceServerConfig();

  return createClient(
    config.supabaseUrl,
    config.supabaseServiceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
}
