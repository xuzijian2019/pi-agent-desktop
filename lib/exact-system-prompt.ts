import type { SystemMessage } from "@earendil-works/pi-ai";

/** Pi 0.86 stores prompts in transcript messages; systemPrompt is read-only.
 * Keep tool declarations/deltas while replacing every prompt-bearing section. */
export function withExactSystemPrompt<T extends { role: string }>(messages: readonly T[], prompt: string): Array<T | SystemMessage> {
  let firstSystem = true;
  const replaced = messages.map(message => {
    if (message.role !== "system") return message;
    const system = message as T & SystemMessage;
    const next = { ...system, content: firstSystem ? prompt : "", sections: undefined };
    firstSystem = false;
    return next;
  });
  return firstSystem
    ? [{ role: "system", content: prompt, timestamp: Date.now() }, ...replaced]
    : replaced;
}
