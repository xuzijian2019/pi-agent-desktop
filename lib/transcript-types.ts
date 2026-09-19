import type { SessionContext } from "./types";
export interface TranscriptPreview {
  sessionId: string; entryId: string; displayEntryId: string; query: string; snippet: string; nonce: number;
  context: SessionContext;
}
