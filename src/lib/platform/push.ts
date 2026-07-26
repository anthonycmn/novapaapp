/**
 * Platform adapter: service worker + push registration (web implementation).
 *
 * All browser-only push/notification APIs are confined to this module.
 * A future Capacitor/Expo wrapper swaps this file for FCM/APNs registration
 * with the same exported signatures.
 */

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (error) {
    console.error("Service worker registration failed", error);
    return null;
  }
}

export type PushPermission = "granted" | "denied" | "default" | "unsupported";

export function getPushPermission(): PushPermission {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

export async function requestPushPermission(): Promise<PushPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.requestPermission();
}

/**
 * Subscribes this device to Web Push. Returns the subscription JSON to be
 * persisted server-side, or null when unsupported/denied/unconfigured.
 */
export async function subscribeToPush(
  vapidPublicKey: string
): Promise<PushSubscriptionJSON | null> {
  if (!vapidPublicKey) return null;
  const registration = await registerServiceWorker();
  if (!registration) return null;
  const permission = await requestPushPermission();
  if (permission !== "granted") return null;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });
  return subscription.toJSON();
}

export async function unsubscribeFromPush(): Promise<boolean> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return false;
  }
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return false;
  return subscription.unsubscribe();
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i++) bytes[i] = rawData.charCodeAt(i);
  return bytes;
}
