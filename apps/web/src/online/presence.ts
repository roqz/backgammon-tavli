import { useEffect, useState } from "react";
import { fetchOnlineStats } from "./client";
import { useOnline } from "./store";

/** Players connected to the server right now; refreshed every minute while the app is visible. */
export function useOnlinePlayers(): number | null {
  const serverUrl = useOnline((s) => s.serverUrl);
  const [count, setCount] = useState<number | null>(null);
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
  }, [serverUrl]);
  return count;
}
