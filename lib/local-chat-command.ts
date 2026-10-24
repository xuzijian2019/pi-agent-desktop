export type LocalChatCommand = { kind: "recap"; question: string };

export function parseLocalChatCommand(text: string): LocalChatCommand | null {
  const match = text.match(/^\/(recap)(?:\s+([\s\S]*))?$/i);
  if (!match) return null;
  return { kind: "recap", question: (match[2] ?? "").trim() };
}
