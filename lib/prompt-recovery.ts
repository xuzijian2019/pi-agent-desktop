import type { AgentMessage } from "@/lib/types";

function extractMessageText(message: Partial<AgentMessage>): string {
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) =>
      block && typeof block === "object"
        && (block as { type?: string }).type === "text"
        && typeof (block as { text?: unknown }).text === "string"
        ? (block as { text: string }).text
        : "")
    .filter(Boolean)
    .join("\n");
}

function imageSignature(block: unknown): string {
  if (!block || typeof block !== "object" || (block as { type?: unknown }).type !== "image") return "";
  const source = (block as { source?: unknown }).source;
  if (source && typeof source === "object") {
    const src = source as { type?: unknown; media_type?: unknown; data?: unknown; url?: unknown };
    return [
      src.type === "url" ? "url" : "base64",
      typeof src.media_type === "string" ? src.media_type : "",
      typeof src.data === "string" ? src.data : "",
      typeof src.url === "string" ? src.url : "",
    ].join(":");
  }
  const flat = block as { data?: unknown; mimeType?: unknown };
  return [
    "base64",
    typeof flat.mimeType === "string" ? flat.mimeType : "",
    typeof flat.data === "string" ? flat.data : "",
    "",
  ].join(":");
}

export function userMessageKey(message: Partial<AgentMessage>): string {
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return JSON.stringify({ text: content, images: [] });
  if (!Array.isArray(content)) return JSON.stringify({ text: "", images: [] });
  return JSON.stringify({
    text: extractMessageText(message),
    images: content.map(imageSignature).filter(Boolean),
  });
}

/**
 * Folds a delivered user `message_end` into the transcript, consuming the
 * optimistic bubble `handleSend` appended for the same prompt.
 *
 * The bubble is not always the last message. When the system prompt changed
 * (first prompt of a session, or tools/skills/context files/date changed since
 * the last one), pi's `prompt()` unshifts a `role: "system"` section-update
 * message ahead of the user message, so its `message_end` lands first. Trailing
 * system messages are skipped when looking for the bubble. Without that, the
 * prompt showed twice while streaming and once after the post-run reload.
 *
 * Returns `prev` unchanged when the bubble already shows the delivered content,
 * replaces it when pi delivered different content (e.g. an expanded prompt
 * template), and appends otherwise (steering/follow-up deliveries).
 */
export function reconcileDeliveredUserMessage(
  prev: AgentMessage[],
  delivered: AgentMessage,
  optimisticKey: string | null,
): AgentMessage[] {
  if (optimisticKey) {
    let index = prev.length - 1;
    while (index >= 0 && (prev[index] as { role?: string }).role === "system") index -= 1;
    const candidate = prev[index];
    if (candidate?.role === "user" && userMessageKey(candidate) === optimisticKey) {
      return userMessageKey(delivered) === optimisticKey
        ? prev
        : [...prev.slice(0, index), delivered, ...prev.slice(index + 1)];
    }
  }
  return [...prev, delivered];
}
