import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

/** Singleton browser client: one realtime socket per tab. */
export function createClient() {
  client ??= createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
  return client;
}
