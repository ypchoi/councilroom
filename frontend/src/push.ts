/**
 * Notifications, from this browser's side.
 *
 * A subscription belongs to one installed browser, not to the account: saying
 * yes on the phone says nothing about the laptop. So the toggle reads its state
 * from the service worker registration in front of it, never from the server.
 */
import { api } from "./api";

/** The VAPID public key arrives base64url; PushManager wants the raw bytes. */
function decodeKey(key: string) {
  const padded = (key + "=".repeat((4 - (key.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  // Built on its own ArrayBuffer: subscribe() will not take a view that might
  // be sitting on a SharedArrayBuffer.
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export const supported = () =>
  "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** Blocked at the browser level: the toggle can say so, but cannot undo it. */
export const blocked = () => supported() && Notification.permission === "denied";

export async function subscribed(): Promise<boolean> {
  if (!supported()) return false;
  const registration = await navigator.serviceWorker.getRegistration();
  return Boolean(await registration?.pushManager.getSubscription());
}

/** Returns false when the reader turned the permission prompt down. */
export async function enable(): Promise<boolean> {
  const { key } = await api.pushKey();
  if (!key) throw new Error("push is disabled on this server");
  // Asked before subscribing: the prompt must come out of the reader's own tap.
  if ((await Notification.requestPermission()) !== "granted") return false;
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      // Chrome only allows subscriptions that promise to show something.
      userVisibleOnly: true,
      applicationServerKey: decodeKey(key),
    }));
  const { endpoint, keys } = subscription.toJSON() as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  await api.pushSubscribe({ endpoint, p256dh: keys.p256dh, auth: keys.auth });
  return true;
}

export async function disable(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  // The server first: a row that outlives the subscription pushes into a void.
  await api.pushUnsubscribe(subscription.endpoint).catch(() => {});
  await subscription.unsubscribe();
}
