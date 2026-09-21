import { closeAllAgentEventStreams } from "./agent-event-stream";

const INSTALLED = Symbol.for("pi-web.streamShutdownInstalled");

/** Keep Node signal APIs outside the Edge instrumentation graph. */
export function installStreamShutdown(): void {
  const state = globalThis as typeof globalThis & { [INSTALLED]?: boolean };
  if (state[INSTALLED]) return;
  state[INSTALLED] = true;
  // Next 16 waits for SSE clients when draining server.close().
  process.on("SIGINT", closeAllAgentEventStreams);
  process.on("SIGTERM", closeAllAgentEventStreams);
}
