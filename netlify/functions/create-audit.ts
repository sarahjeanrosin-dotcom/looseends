// POST /.netlify/functions/create-audit
// Starts a new audit run: creates an `audits` row with status "pending".
import type { Handler } from "@netlify/functions";
import { supabase } from "./_supabase";
import { json } from "./_http";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body: { release_name?: string; description?: string };
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  if (!body.release_name) {
    return json(400, { error: "release_name is required" });
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
    return json(500, { error: error.message });
  }

  return json(201, { audit: data });
};
