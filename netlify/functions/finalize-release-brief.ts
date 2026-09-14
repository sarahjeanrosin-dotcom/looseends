// POST /.netlify/functions/finalize-release-brief
// Step 2 of 2 for a release brief file upload: called after the client has
// PUT the file to the signed URL from create-brief-upload-url. Records the
// Storage path and the extracted text (extracted client-side, same as the
// Stage 1 SharePoint upload) as a new release_briefs row — the New Audit
// screen allows multiple brief/release doc files per audit, so this can be
// called once per file rather than replacing a single value.
import type { Handler } from "@netlify/functions";
import { supabase } from "./_supabase";
import { json } from "./_http";

interface RequestBody {
  audit_id?: string;
  path?: string;
  file_name?: string;
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
    return json(400, { error: "Invalid JSON body" });
  }
  if (!body.audit_id) {
    return json(400, { error: "audit_id is required" });
  }
  if (!body.path) {
    return json(400, { error: "path is required" });
  }
  if (!body.file_name) {
    return json(400, { error: "file_name is required" });
  }

  const { data, error } = await supabase
    .from("release_briefs")
    .insert({
      audit_id: body.audit_id,
      file_path: body.path,
      file_name: body.file_name,
      content_text: body.content_text ?? "",
    })
    .select()
    .single();
  if (error) {
    return json(500, { error: error.message });
  }

  return json(201, { releaseBrief: data });
};
