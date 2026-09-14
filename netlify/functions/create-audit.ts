// POST /.netlify/functions/create-audit
// Starts a new audit run: creates an `audits` row with status "pending".
// Stage 0: stub only — no crawl, no AI pass, no file handling yet.
// That logic lands in Stage 3 (release brief ingestion + AI relevance pass).
import type { Handler } from "@netlify/functions";
import { supabase } from "./_supabase";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body: { release_name?: string; description?: string };
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  if (!body.release_name) {
    return { statusCode: 400, body: JSON.stringify({ error: "release_name is required" }) };
  }

  const { data, error } = await supabase
    .from("audits")
    .insert({
      release_name: body.release_name,
      description: body.description ?? null,
      status: "pending",
      progress: 0,
    })
    .select()
    .single();

  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  // TODO (Stage 3): kick off the website crawl + AI relevance pass here
  // (likely as a background function given Netlify's execution time limits).

  return { statusCode: 201, body: JSON.stringify({ audit: data }) };
};
