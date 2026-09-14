// Shared JSON response helper for Netlify Functions.
//
// Netlify's default Content-Type for a function response without explicit
// headers is NOT application/json (it's text/plain) — every function here
// used to return `{ statusCode, body: JSON.stringify(...) }` with no headers
// and it worked fine, because the client used to parse any response body as
// JSON regardless of the header. Once the client was hardened to check the
// header first (to catch a different bug — Vite's dev server returning HTML
// for unmatched paths), every one of these responses started failing that
// check, even though the body was valid JSON all along. Route every
// response through this helper instead of constructing the object by hand,
// so the header is never missed again.
export function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
