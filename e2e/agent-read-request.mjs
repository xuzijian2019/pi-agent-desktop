/** Exact read/liveness POSTs used by a loaded session, not model or settings writes. */
export function isAgentReadRequest(method, requestUrl, postData, sessionId) {
  if (method !== "POST") return false;
  const url = new URL(requestUrl);
  if (url.search) return false;
  const sessionPath = `/api/agent/${sessionId}`;
  if (url.pathname === `${sessionPath}/lease`) return postData === null || postData === "";
  if (url.pathname !== sessionPath) return false;
  let body;
  try { body = JSON.parse(postData); } catch { return false; }
  return body !== null && !Array.isArray(body) && typeof body === "object"
    && Object.keys(body).length === 1 && ["get_tools", "get_commands"].includes(body.type);
}
