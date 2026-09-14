// Shared Supabase client for Netlify Functions.
// Uses the service role key because functions run server-side and need
// full read/write access (RLS can stay locked down for any public client).
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.warn(
    "[supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set. " +
      "Functions that touch the database will fail until these are configured " +
      "(see .env.example)."
  );
}

export const supabase = createClient(supabaseUrl ?? "", supabaseServiceRoleKey ?? "", {
  auth: { persistSession: false },
});
