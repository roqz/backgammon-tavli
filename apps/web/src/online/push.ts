import { useEffect, useState } from "react";
import { useSettings } from "../store/settings";
import { httpUrl, useOnline } from "./store";

/**
 * Browser notifications for tournament matches: Web Push while the app is closed (the server
 * sends it to players who are not connected) and a local notification while it is open in a
 * background tab.
 */

export type PushState = "unsupported" | "denied" | "off" | "on" | "busy";

export const pushSupported = (): boolean =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

const registration = async (): Promise<ServiceWorkerRegistration | null> => {
  if (!pushSupported()) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
};

const authed = async (path: string, body: unknown): Promise<void> => {
  const { serverUrl, profile } = useOnline.getState();
  if (!profile) throw new Error("not registered");
  const res = await fetch(httpUrl(serverUrl, path), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${profile.id}.${profile.token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok)
    throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? res.statusText);
};

const fromB64u = (s: string): Uint8Array<ArrayBuffer> => {
  const b = atob(
    s
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(s.length / 4) * 4, "="),
  );
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

const currentState = async (): Promise<PushState> => {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
};

export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const reg = (await registration()) ?? (await navigator.serviceWorker.ready);
  const { serverUrl } = useOnline.getState();
  const res = await fetch(httpUrl(serverUrl, "/api/push/key"));
  if (!res.ok) throw new Error("push not available on this server");
  const { publicKey } = (await res.json()) as { publicKey: string };
  let sub = await reg.pushManager.getSubscription();
  // A subscription made for another server key cannot be used.
  const key = sub?.options.applicationServerKey;
  if (sub && key && new Uint8Array(key).join() !== fromB64u(publicKey).join()) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: fromB64u(publicKey),
  });
  await authed("/api/push/subscribe", { ...sub.toJSON(), lang: useSettings.getState().lang });
  return "on";
}

export async function disablePush(): Promise<PushState> {
  const sub = await (await registration())?.pushManager.getSubscription();
  if (sub) {
    await authed("/api/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe();
  }
  return currentState();
}

export function usePushState(): [PushState, (on: boolean) => void, string | null] {
  const [state, setState] = useState<PushState>("busy");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void currentState().then(setState);
  }, []);
  const toggle = (on: boolean) => {
    setState("busy");
    setError(null);
    (on ? enablePush() : disablePush()).then(setState).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : String(e));
      void currentState().then(setState);
    });
  };
  return [state, toggle, error];
}

/** Shows a notification while the page is hidden (permission must have been granted). */
export async function notifyIfHidden(title: string, body: string, tag: string): Promise<void> {
  if (typeof document === "undefined" || !document.hidden) return;
  if (!pushSupported() || Notification.permission !== "granted") return;
  const reg = await registration();
  await reg?.showNotification(title, { body, tag, icon: "icon-192.png", data: { url: location.href } });
}
