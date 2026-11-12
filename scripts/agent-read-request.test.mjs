import assert from "node:assert/strict";
import { test } from "node:test";
import { isAgentReadRequest } from "../e2e/agent-read-request.mjs";

const id = "fixture-session";
const url = `http://127.0.0.1:30142/api/agent/${id}`;
const read = (body, target = url, method = "POST") => isAgentReadRequest(method, target, body, id);

test("only exact tool/command reads and an empty session lease are non-mutations", () => {
  for (const type of ["get_tools", "get_commands"]) assert.equal(read(JSON.stringify({ type })), true);
  assert.equal(read(null, `${url}/lease`), true);
  assert.equal(read("", `${url}/lease`), true);
});

test("sending, queueing, model changes and unknown commands remain forbidden", () => {
  for (const type of ["prompt", "follow_up", "steer", "queue_composer", "set_model", "set_thinking_level", "ensure_session", "unknown"]) {
    assert.equal(read(JSON.stringify({ type })), false, type);
  }
  assert.equal(read(JSON.stringify({ type: "get_tools", message: "never silently allow extra payload" })), false);
});

test("other sessions, endpoints, query strings and nonempty leases are not allowlisted", () => {
  for (const target of [`${url}?extra=1`, `${url}/other`, url.replace(id, "another-session"), url.replace(id, "new")]) {
    assert.equal(read('{"type":"get_tools"}', target), false, target);
  }
  assert.equal(read("{}", `${url}/lease`), false);
  assert.equal(read(null, `${url}/lease?extra=1`), false);
  assert.equal(read('{"type":"get_tools"}', url, "DELETE"), false);
});

test("malformed and non-object command payloads do not evade the mutation assertion", () => {
  for (const body of [null, "", "not json", "null", "0", "[]", "{}", '[{"type":"get_tools"}]']) {
    assert.equal(read(body), false, String(body));
  }
});
