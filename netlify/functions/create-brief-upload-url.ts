// POST /.netlify/functions/create-brief-upload-url
// Step 1 of 2 for the release brief upload: returns a signed Supabase
// Storage upload URL so the client can PUT the raw file directly to Storage
// (not through this function — keeps large decks/PDFs off Netlify's sync
// function payload limit). Call finalize-release-brief after the upload
// completes to attach it to the audit.
import type { Handler } from "@netlify/functions";
import { supabase } from "./_supabase";

const BUCKET = "release-briefs";

interface RequestBody {
  audit_id?: string;
  file_name?: string;
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
  if (!body.file_name) {
    return { statusCode: 400, body: JSON.stringify({ error: "file_name is required" }) };
  }

  const { data: audit, error: auditError } = await supabase
    .from("audits")
    .select("id")
    .eq("id", body.audit_id)
    .maybeSingle();
  if (auditError) {
    return { statusCode: 500, body: JSON.stringify({ error: auditError.message }) };
  }
  if (!audit) {
    return { statusCode: 404, body: JSON.stringify({ error: `No audit found with id ${body.audit_id}` }) };
  }

  const safeFileName = body.file_name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${body.audit_id}/${Date.now()}-${safeFileName}`;

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ path: data.path, signedUrl: data.signedUrl, token: data.token }),
  };
};
