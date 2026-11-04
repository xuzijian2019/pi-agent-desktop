/**
 * Leave JSON unencoded at the Route Handler boundary. Next's Node response
 * adapter strips Content-Encoding (a fetched Response may already be decoded),
 * so returning a manually gzipped body here sends binary bytes as plain JSON.
 * Next's HTTP server owns compression and negotiates it with the client.
 */
export function jsonResponse(
  _request: Request,
  data: unknown,
  init: ResponseInit = {},
): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}
