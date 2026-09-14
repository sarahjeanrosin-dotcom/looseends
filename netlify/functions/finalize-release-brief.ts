// POST /.netlify/functions/finalize-release-brief
// Step 2 of 2 for the release brief upload: called after the client has PUT
// the file to the signed URL from create-brief-upload-url. Records the
// Storage path and the extracted text (extracted client-side, same as the
// Stage 1 SharePoint upload) against the audit.
import type { Handler } from "@netlify/functions";
import { supabase } from "./_supabase";

interface RequestBody {
  audit_id?: string;
  path?: string;
  content_text?: string;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body: RequestBody;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }
  if (!body.audit_id) {
    return { statusCode: 400, body: JSON.stringify({ error: "audit_id is required" }) };
  }
  if (!body.path) {
    return { statusCode: 400, body: JSON.stringify({ error: "path is required" }) };
  }

  const { data, error } = await supabase
    .from("audits")
    .update({ brief_file_path: body.path, brief_content_text: body.content_text ?? null })
    .eq("id", body.audit_id)
    .select()
    .single();
  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  return { statusCode: 200, body: JSON.stringify({ audit: data }) };
};
