export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { configureHttpDispatcher } = await import("@/lib/http-dispatcher");
  configureHttpDispatcher();

  const { installStreamShutdown } = await import("@/lib/stream-shutdown");
  installStreamShutdown();
}
