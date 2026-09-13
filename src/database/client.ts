import { createContextClient } from "@supabase/server/core";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types.js";

export type MythhClient = SupabaseClient<Database>;

export function createAnonClient(): MythhClient {
  return createContextClient<Database>();
}
