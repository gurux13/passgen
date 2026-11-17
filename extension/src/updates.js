// When a genpw.cc page doesn't match the pinned hashes, the extension may simply
// be older than the site. For Chrome Web Store (or policy) installs, ask the
// store for an update; if one arrives, the background reloads the extension and
// the page is checked again with the new pins. Unpacked installs never update
// on their own, so nothing is checked for them.

const THROTTLE_MS = 5 * 60 * 1000; // Chrome throttles update checks anyway
let lastCheck = 0;

// -> { status: "update_available" | "no_update" | "throttled" | "unpacked" | "error", version?, current }
export async function checkForUpdate() {
  const current = chrome.runtime.getManifest().version;
  const self = await chrome.management.getSelf();
  if (self.installType === "development") return { status: "unpacked", current };
  if (Date.now() - lastCheck < THROTTLE_MS) return { status: "throttled", current };
  lastCheck = Date.now();
  try {
    const { status, version } = await chrome.runtime.requestUpdateCheck();
    return { status, version: version ?? null, current };
  } catch {
    return { status: "error", current };
  }
}

export function describeUpdate(update) {
  if (update?.status !== "update_available") return null;
  return `Updating the extension to ${update.version ?? "a newer version"} (you have ${update.current})…`;
}
