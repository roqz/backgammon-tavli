import { type RefObject, useEffect, useId, useRef } from "react";

/**
 * Closing an overlay in the UI removes its history entry with history.back(), which completes
 * asynchronously. Until its popstate arrived, screen changes must wait (otherwise the late
 * popstate would undo them) and that popstate must not be taken as a navigation.
 */
let settling: (() => void)[] | null = null;

/** True while an overlay's own history entry is being removed (ignore that popstate). */
export const historySettling = (): boolean => settling !== null;

/** Runs `fn` now, or once a pending overlay history removal has finished. */
export const afterHistory = (fn: () => void): void => {
  if (settling) settling.push(fn);
  else fn();
};

const backQuietly = () => {
  settling = [];
  const done = () => {
    window.removeEventListener("popstate", done, true);
    // after every popstate listener ran (they check historySettling)
    setTimeout(() => {
      const queue = settling ?? [];
      settling = null;
      for (const fn of queue) fn();
    }, 0);
  };
  window.addEventListener("popstate", done, true);
  history.back();
};

/**
 * Overlays (dialogs, drawers) add a browser history entry while they are open, so the device's
 * Back button closes them instead of leaving the app. Closing them in the UI removes the entry.
 */
export function useBackToClose(open: boolean, onClose: (() => void) | undefined): void {
  const id = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open || !closeRef.current) return;
    let poppedByBack = false;
    let pushed = false;
    afterHistory(() => {
      history.pushState({ ...(history.state as object | null), overlay: id }, "");
      pushed = true;
    });
    const onPop = () => {
      if (historySettling() || !pushed) return;
      poppedByBack = true;
      closeRef.current?.();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Closed in the UI: drop our entry (only if it is still the current one).
      if (!poppedByBack && (history.state as { overlay?: string } | null)?.overlay === id) backQuietly();
    };
  }, [open, id]);
}

/** Open dialogs, innermost last: only that one handles Tab and Escape. */
const stack: HTMLElement[] = [];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keyboard focus for a modal container: moves focus inside when it opens, keeps Tab inside,
 * closes on Escape (anywhere on the page) and gives focus back to the opener afterwards. The
 * dialog is labelled by its first heading.
 */
export function useDialogFocus(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onClose: (() => void) | undefined,
): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    const opener = document.activeElement as HTMLElement | null;
    const heading = el.querySelector("h1, h2, h3");
    if (heading) {
      heading.id ||= `dlg-${Math.random().toString(36).slice(2, 8)}`;
      el.setAttribute("aria-labelledby", heading.id);
    }
    const first = el.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? el).focus({ preventScroll: true });
    stack.push(el);
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== el) return;
      if (e.key === "Escape" && closeRef.current) {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
      if (items.length === 0) return;
      const firstItem = items[0]!;
      const lastItem = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault();
        firstItem.focus();
      } else if (!el.contains(document.activeElement)) {
        e.preventDefault();
        firstItem.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      stack.splice(stack.indexOf(el), 1);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [active, ref]);
}
