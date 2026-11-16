import { useEffect, useState } from "react";
import { fetchOnlineStats } from "./client";
import { useOnline } from "./store";

/**
 * Players connected to the server right now; refreshed every minute while the app is visible
 * and as soon as the own connection is up (on a cold start the first count comes before it and
 * would leave oneself out until the next refresh). One's own connection always counts.
 */
export function useOnlinePlayers(): number | null {
  const serverUrl = useOnline((s) => s.serverUrl);
  const connected = useOnline((s) => s.status === "ready");
  const [count, setCount] = useState<number | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `connected` reloads the count once the own connection is up
  useEffect(() => {
    if (!serverUrl) return;
    let alive = true;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      fetchOnlineStats()
        .then((s) => alive && setCount(s.online))
        .catch(() => alive && setCount(null));
    };
    load();
    const timer = setInterval(load, 60_000);
    document.addEventListener("visibilitychange", load);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [serverUrl, connected]);
  if (count === null) return connected ? 1 : null;
  return connected ? Math.max(1, count) : count;
}
