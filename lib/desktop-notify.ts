import { isTauriDesktop } from "@/lib/desktop-updater";
import { APP_PREF_KEYS, getPrefBool } from "@/lib/app-prefs";

export function desktopNotificationsEnabled(): boolean {
  return getPrefBool(APP_PREF_KEYS.notifyOnComplete, true);
}

async function ensurePermission(): Promise<boolean> {
  const {
    isPermissionGranted,
    requestPermission,
  } = await import("@tauri-apps/plugin-notification");
  let granted = await isPermissionGranted();
  if (!granted) {
    const permission = await requestPermission();
    granted = permission === "granted";
  }
  return granted;
}

/** Show a native notification when the desktop window is in the background. */
export async function notifyDesktop(options: {
  key?: string;
  title: string;
  body: string;
}): Promise<void> {
  if (!isTauriDesktop()) {
    if (!getPrefBool(APP_PREF_KEYS.browserNotifications, false) || typeof Notification === "undefined" || Notification.permission !== "granted" || (document.hasFocus() && !document.hidden)) return;
    // Web Locks serializes the claim across tabs. A storage failure leaves
    // title/unread feedback available without risking duplicate notifications.
    if (!navigator.locks || !options.key) return;
    await navigator.locks.request("pi-completion-notification", () => {
      try {
        const key = options.key!;
        const claims = JSON.parse(localStorage.getItem(APP_PREF_KEYS.notificationClaims) ?? "{}") as Record<string, number>;
        const now = Date.now();
        if (claims[key]) return;
        for (const id of Object.keys(claims)) if (now - claims[id] > 7 * 24 * 60 * 60 * 1000) delete claims[id];
        claims[key] = now;
        localStorage.setItem(APP_PREF_KEYS.notificationClaims, JSON.stringify(claims));
        new Notification(options.title, { body: options.body, tag: key });
      } catch { /* Permission-free title feedback remains available. */ }
    });
    return;
  }
  if (!desktopNotificationsEnabled()) return;

  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const focused = await getCurrentWindow().isFocused();
    if (focused) return;
  } catch {
    // If focus cannot be determined, still notify.
  }

  try {
    if (!(await ensurePermission())) return;
    const { sendNotification } = await import("@tauri-apps/plugin-notification");
    sendNotification({ title: options.title, body: options.body });
  } catch (error) {
    console.error("Desktop notification failed:", error);
  }
}

export async function focusDesktopWindow(): Promise<void> {
  if (!isTauriDesktop()) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const window = getCurrentWindow();
    await window.show();
    await window.unminimize();
    await window.setFocus();
  } catch {
    // ignore
  }
}
