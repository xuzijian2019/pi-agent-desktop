import type { SessionInfo } from "./types";

export const MAX_RECENT_SESSIONS = 6;
const MAX_RECENT_PER_PROJECT = 2;

function startOfDay(value: Date): number {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Cross-project entry points. Only user-started families participate: a
 * subagent's later activity must not promote its parent, and scheduled runs
 * live under Scheduled rather than competing for recall.
 */
export function getRecallSessions(
  sessions: readonly SessionInfo[],
  now: Date | string | number = new Date(),
  limit = MAX_RECENT_SESSIONS,
): SessionInfo[] {
  const eligible = sessions
    .filter((session) => session.relation?.kind !== "subagent" && session.relation?.kind !== "scheduled")
    .sort((a, b) => b.modified.localeCompare(a.modified));
  const dayStart = startOfDay(new Date(now));
  const todays = eligible.filter((session) => new Date(session.modified).getTime() >= dayStart);
  return selectDiverseSessions(todays.length > 0 ? todays : eligible, limit);
}

/**
 * Keep recall useful when one project has a burst of activity: first expose
 * up to two sessions from each project, then fill any remaining slots in
 * chronological order. The list remains sorted by recency after selection.
 */
function selectDiverseSessions(sessions: readonly SessionInfo[], limit: number): SessionInfo[] {
  const max = Math.max(0, limit);
  const selected: SessionInfo[] = [];
  const selectedIds = new Set<string>();
  const counts = new Map<string, number>();
  for (const session of sessions) {
    if (selected.length === max) break;
    const project = session.projectKey ?? session.projectRoot ?? session.cwd;
    const count = counts.get(project) ?? 0;
    if (count >= MAX_RECENT_PER_PROJECT) continue;
    counts.set(project, count + 1);
    selectedIds.add(session.id);
    selected.push(session);
  }

  if (selected.length < max) {
    for (const session of sessions) {
      if (selected.length === max) break;
      if (!selectedIds.has(session.id)) {
        selectedIds.add(session.id);
        selected.push(session);
      }
    }
  }
  return selected.slice(0, max);
}

export function hasRecallSessionsToday(
  sessions: readonly SessionInfo[],
  now: Date | string | number = new Date(),
): boolean {
  const dayStart = startOfDay(new Date(now));
  return sessions.some((session) => (
    session.relation?.kind !== "subagent"
    && session.relation?.kind !== "scheduled"
    && new Date(session.modified).getTime() >= dayStart
  ));
}
