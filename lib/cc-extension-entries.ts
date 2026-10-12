import type { AgentMessage, CustomMessage, SessionEntry } from "./types";

/**
 * Extension state entries written by pi-cc-extensions
 * (https://github.com/minuque/pi-cc-extensions). Both are `custom` entries, which
 * never enter model context; the TUI renders them through pi-tui components that
 * cannot run here, so the chat view reads their data instead. The shapes are the
 * package's, not ours: every field is validated and anything else is ignored.
 */
export const AGENT_SUMMARY_ENTRY_TYPE = "agent-summary";
export const THINKING_DURATION_ENTRY_TYPE = "compact-thinking-duration";

/** UI-only custom message type; namespaced so a `custom_message` of the package's type cannot collide. */
export const AGENT_SUMMARY_MESSAGE_TYPE = "pi-cc:agent-summary";

export interface AgentSummaryData {
  commands: number;
  reads: number;
  edits: number;
  writes: number;
  others: number;
  failed: number;
  durationMs: number;
}

const AGENT_SUMMARY_FIELDS = ["commands", "reads", "edits", "writes", "others", "failed", "durationMs"] as const;

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function parseAgentSummary(data: unknown): AgentSummaryData | null {
  if (typeof data !== "object" || data === null) return null;
  const record = data as Record<string, unknown>;
  const summary = {} as AgentSummaryData;
  for (const field of AGENT_SUMMARY_FIELDS) {
    const value = record[field];
    if (!isCount(value)) return null;
    summary[field] = value;
  }
  return summary;
}

/** A run that used no tools has nothing to summarize; the TUI renders nothing for it either. */
export function hasAgentSummaryActivity(summary: AgentSummaryData): boolean {
  return summary.commands + summary.reads + summary.edits + summary.writes + summary.others + summary.failed > 0;
}

export type AgentSummaryPartKey = "commands" | "reads" | "edits" | "writes" | "others" | "failed";

/** Non-zero counts in the package's order: commands, reads, edits, writes, other tools, failures. */
export function agentSummaryParts(summary: AgentSummaryData): { key: AgentSummaryPartKey; count: number }[] {
  const keys: AgentSummaryPartKey[] = ["commands", "reads", "edits", "writes", "others", "failed"];
  return keys.filter((key) => summary[key] > 0).map((key) => ({ key, count: summary[key] }));
}

export function formatRunDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 1000) return "";
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  return `${seconds}s`;
}

export function agentSummaryMessage(entry: SessionEntry, timestamp: number | undefined): CustomMessage | null {
  if (entry.type !== "custom" || entry.customType !== AGENT_SUMMARY_ENTRY_TYPE) return null;
  const summary = parseAgentSummary(entry.data);
  if (!summary || !hasAgentSummaryActivity(summary)) return null;
  return {
    role: "custom",
    customType: AGENT_SUMMARY_MESSAGE_TYPE,
    content: "",
    display: true,
    details: summary,
    timestamp,
  };
}

/** Assistant message timestamp → thinking block index → duration in ms. */
export type ThinkingDurations = Map<number, Map<number, number>>;

/**
 * Indexed from every entry, not only the rendered window: the package writes a
 * duration when the block finishes streaming, before pi persists the assistant
 * message, so the entry sits *above* the message it describes.
 */
export function collectThinkingDurations(entries: readonly SessionEntry[]): ThinkingDurations | null {
  let durations: ThinkingDurations | null = null;
  for (const entry of entries) {
    if (entry.type !== "custom" || entry.customType !== THINKING_DURATION_ENTRY_TYPE) continue;
    const data = entry.data as Record<string, unknown> | null | undefined;
    if (typeof data !== "object" || data === null) continue;
    const { messageTimestamp, contentIndex, durationMs } = data;
    if (
      typeof messageTimestamp !== "number" || !Number.isFinite(messageTimestamp)
      || typeof contentIndex !== "number" || !Number.isInteger(contentIndex) || contentIndex < 0
      || typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs <= 0
    ) continue;
    durations ??= new Map();
    let byIndex = durations.get(messageTimestamp);
    if (!byIndex) {
      byIndex = new Map();
      durations.set(messageTimestamp, byIndex);
    }
    byIndex.set(contentIndex, durationMs);
  }
  return durations;
}

export function applyThinkingDurations(message: AgentMessage, durations: ThinkingDurations | null): AgentMessage {
  if (!durations || message.role !== "assistant" || typeof message.timestamp !== "number") return message;
  const byIndex = durations.get(message.timestamp);
  if (!byIndex) return message;
  let changed = false;
  const content = message.content.map((block, index) => {
    const durationMs = byIndex.get(index);
    if (block.type !== "thinking" || durationMs === undefined) return block;
    changed = true;
    return { ...block, durationMs };
  });
  return changed ? { ...message, content } : message;
}
