import type { AuthResult } from "@supabase/server";

import type { MythhClient } from "../database/client.js";
import type { Database } from "../database/types.js";

declare global {
  namespace Express {
    interface Request {
      supabaseAuth?: AuthResult;
      supabase?: MythhClient;
      profile?: Database["public"]["Tables"]["profiles"]["Row"];
    }
  }
}

export {};
