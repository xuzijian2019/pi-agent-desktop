import assert from "node:assert/strict";
import test from "node:test";
import { getRecallSessions, hasRecallSessionsToday, MAX_RECENT_SESSIONS } from "./recent-sessions.ts";

const session = (id, modified, relation, projectKey = id) => ({
  id,
  modified,
  relation,
  projectKey,
});

test("recent sessions sort across projects, exclude subagents and scheduled runs, and cap the list", () => {
  const sessions = [
    session("old", "2026-10-01T10:00:00Z"),
    session("subagent", "2026-10-04T10:00:00Z", { kind: "subagent", parentSessionId: "old" }),
    session("scheduled", "2026-10-03T10:00:00Z", { kind: "scheduled", taskId: "task", runId: "run" }),
    session("new-b", "2026-10-04T09:00:00Z"),
    session("new-a", "2026-10-04T10:00:01Z"),
    session("new-c", "2026-10-04T08:00:00Z"),
    session("new-d", "2026-10-03T12:00:00Z"),
    session("new-e", "2026-10-03T11:00:00Z"),
    session("new-f", "2026-10-03T10:00:00Z"),
    session("new-g", "2026-10-02T10:00:00Z"),
  ];

  assert.deepEqual(getRecallSessions(sessions), [
    sessions[4],
    sessions[3],
    sessions[5],
    sessions[6],
    sessions[7],
    sessions[8],
  ]);
  assert.equal(MAX_RECENT_SESSIONS, 6);
  assert.deepEqual(getRecallSessions(sessions, new Date("2026-10-04T00:00:00Z"), 1).map((item) => item.id), ["new-a"]);
  assert.deepEqual(getRecallSessions([], 1), []);
});

test("recall prefers today's sessions and labels the section accordingly", () => {
  // Recall uses the reader's local day. UTC midnight is the previous day in
  // western time zones, so derive both fixtures from the same local calendar.
  const now = new Date(2026, 9, 4, 12);
  const sessions = [
    { id: "old", modified: new Date(2026, 9, 2, 23).toISOString() },
    { id: "today", modified: new Date(2026, 9, 4, 0).toISOString() },
  ];

  assert.equal(hasRecallSessionsToday(sessions, now), true);
  assert.deepEqual(getRecallSessions(sessions, now).map((item) => item.id), ["today"]);
  assert.equal(hasRecallSessionsToday([sessions[0]], now), false);
  assert.deepEqual(getRecallSessions([sessions[0]], now).map((item) => item.id), ["old"]);
});

test("recall caps projects before filling remaining slots", () => {
  const now = new Date(2026, 9, 4, 12);
  const todayAt = (hour) => new Date(2026, 9, 4, hour).toISOString();
  const sessions = [
    session("a3", todayAt(11), undefined, "a"),
    session("a2", todayAt(10), undefined, "a"),
    session("a1", todayAt(9), undefined, "a"),
    session("b2", todayAt(8), undefined, "b"),
    session("b1", todayAt(7), undefined, "b"),
    session("c1", todayAt(6), undefined, "c"),
  ];

  assert.deepEqual(getRecallSessions(sessions, now).map((item) => item.id), [
    "a3",
    "a2",
    "b2",
    "b1",
    "c1",
    "a1",
  ]);
});
