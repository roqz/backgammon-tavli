import type { CorrView } from "@tavli/protocol";
import { useEffect, useState } from "react";
import { useCareer } from "../career";
import { fetchCorrGames, fetchFriends } from "./client";
import { useOnline } from "./store";

/** What waits for the player: correspondence moves and invitations, friend requests. */
export interface Todo {
  readonly corrTurn: readonly CorrView[];
  readonly corrInvites: readonly CorrView[];
  readonly friendRequests: number;
}

export const todoCount = (t: Todo | null): number =>
  t ? t.corrTurn.length + t.corrInvites.length + t.friendRequests : 0;

const REFRESH_MS = 60_000;

/**
 * Loads the to-do list while mounted (refreshed when the server reports changes, every minute and
 * when the app comes back to the foreground) and shows its size on the installed app's icon.
 */
export function useTodo(): Todo | null {
  const profile = useOnline((s) => s.profile);
  const serverUrl = useOnline((s) => s.serverUrl);
  const corrVersion = useOnline((s) => s.corrVersion);
  const friendsVersion = useOnline((s) => s.friendsVersion);
  const [todo, setTodo] = useState<Todo | null>(null);
  const me = profile?.id;

  // biome-ignore lint/correctness/useExhaustiveDependencies: the versions re-run the fetch
  useEffect(() => {
    if (!me || !serverUrl) {
      setTodo(null);
      return;
    }
    let alive = true;
    const load = async () => {
      const [games, friends] = await Promise.all([
        fetchCorrGames().catch(() => null),
        fetchFriends().catch(() => null),
      ]);
      if (!alive || (!games && !friends)) return;
      const next: Todo = {
        corrTurn: (games ?? []).filter((g) => g.status === "active" && g.toAct === g.seat),
        corrInvites: (games ?? []).filter((g) => g.status === "invited" && g.createdBy !== me),
        friendRequests: (friends ?? []).filter((f) => f.status === "incoming").length,
      };
      setTodo(next);
      setBadge(todoCount(next));
      // finished correspondence and league games count for the career (achievements, rank)
      if (games) {
        const finished = games.filter((g) => g.status === "finished" && g.seat !== null);
        useCareer.getState().setCorr(finished.length, finished.filter((g) => g.league).length);
      }
    };
    void load();
    const id = setInterval(() => void load(), REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [me, serverUrl, corrVersion, friendsVersion]);
  return todo;
}

/** Number on the home screen icon (installed app, where supported). */
const setBadge = (n: number) => {
  const nav = navigator as Navigator & {
    setAppBadge?: (n: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  (n > 0 ? nav.setAppBadge?.(n) : nav.clearAppBadge?.())?.catch(() => {});
};
