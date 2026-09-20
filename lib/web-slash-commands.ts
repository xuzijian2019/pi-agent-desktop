/** Pi 0.86.1 CLI commands with a supported Web UI equivalent. */
export const WEB_SLASH_COMMANDS = [
  { name: "side", description: "side.command", args: true },
  { name: "btw", description: "side.command", args: true },
  { name: "recap", description: "recap.command" },
  { name: "model", description: "chat.commandModel", args: true, idle: true },
  { name: "thinking", description: "chat.commandThinking", args: true, idle: true },
  { name: "new", description: "chat.commandNew" },
  { name: "resume", description: "chat.commandResume" },
  { name: "tree", description: "chat.commandTree", idle: true },
  { name: "fork", description: "chat.commandFork", idle: true },
  { name: "compact", description: "chat.commandCompact", args: true, idle: true },
  { name: "copy", description: "chat.commandCopy" },
  { name: "name", description: "chat.commandName", args: true },
  { name: "session", description: "chat.commandSession" },
  { name: "export", description: "chat.commandExport" },
  { name: "settings", description: "chat.commandSettings" },
  { name: "login", description: "chat.commandLogin" },
  { name: "logout", description: "chat.commandLogout" },
  { name: "trust", description: "chat.commandTrust" },
  { name: "hotkeys", description: "chat.commandHotkeys" },
  { name: "reload", description: "chat.commandReload", idle: true },
].map(command => ({ ...command, source: "builtin" as const }));

export type AppSlashCommand = "new" | "resume" | "tree" | "export" | "settings" | "login" | "logout" | "trust";
export type ViewSlashCommand = AppSlashCommand | "fork" | "hotkeys";

export function parseWebSlashCommand(text: string) {
  const match = text.trim().match(/^\/([^\s]+)(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  const command = WEB_SLASH_COMMANDS.find(item => item.name === match[1].toLowerCase());
  return command ? { ...command, argument: (match[2] ?? "").trim() } : null;
}
