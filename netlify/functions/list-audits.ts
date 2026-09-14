// GET /.netlify/functions/list-audits
// Lists historic audits, most recent first. Stage 0: stub — returns whatever
// rows exist in `audits`, no pagination/filtering yet. Backs the "Past
// Audits" screen built in Stage 6.
import type { Handler } from "@netlify/functions";
import { supabase } from "./_supabase";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { data, error } = await supabase
    .from("audits")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  return { statusCode: 200, body: JSON.stringify({ audits: data }) };
};
