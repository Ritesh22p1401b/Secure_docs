// Runs once when a server instance starts: fail fast on missing or weak secrets
// instead of on the first request. (Not executed during `next build`.)
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { env } = await import("./lib/env");
    env();
    const { LOCAL_STORAGE_NOTICE, STORAGE_NOT_CONFIGURED_LOG, storageDriver } = await import("./lib/storage/blob");
    const driver = storageDriver();
    if (!driver) console.warn(`[securedocs] WARNING: ${STORAGE_NOT_CONFIGURED_LOG}`);
    else if (driver === "local") console.warn(`[securedocs] ${LOCAL_STORAGE_NOTICE}`);
  }
}
