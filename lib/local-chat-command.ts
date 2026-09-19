export type LocalChatCommand =
  | { kind: "side"; question: string }
  | { kind: "recap"; question: string };

export function parseLocalChatCommand(text: string): LocalChatCommand | null {
  const match = text.match(/^\/(side|btw|recap)(?:\s+([\s\S]*))?$/i);
  if (!match) return null;
  const name = match[1].toLowerCase();
  return { kind: name === "recap" ? "recap" : "side", question: (match[2] ?? "").trim() };
}
