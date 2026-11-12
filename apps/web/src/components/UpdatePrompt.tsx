import { useRegisterSW } from "virtual:pwa-register/react";
import { useT } from "../i18n";
import { Button } from "./ui";

/**
 * A new app version was downloaded: ask before reloading, so a running game is never
 * interrupted by an automatic update.
 */
export function UpdatePrompt() {
  const t = useT();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl border border-amber-400/40 bg-stone-900 px-4 py-3 text-sm text-stone-100 shadow-2xl"
    >
      <span>{t.updateReady}</span>
      <div className="flex gap-2">
        <Button variant="ghost" className="px-3 py-1.5 text-sm" onClick={() => setNeedRefresh(false)}>
          ✕
        </Button>
        <Button
          variant="primary"
          className="px-3 py-1.5 text-sm"
          onClick={() => void updateServiceWorker(true)}
        >
          {t.updateNow}
        </Button>
      </div>
    </div>
  );
}
