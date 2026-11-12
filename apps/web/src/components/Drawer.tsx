import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useRef } from "react";
import { useBackToClose, useDialogFocus } from "./overlay";

/** Slide-in panel from the right over the current screen (the screen stays mounted). */
export function Drawer({
  open,
  onClose,
  title,
  closeLabel,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  closeLabel: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useDialogFocus(ref, open, onClose);
  useBackToClose(open, onClose);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-40 flex justify-end bg-black/50 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.aside
            ref={ref}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            className="h-full w-full max-w-md overflow-y-auto border-l border-stone-800 bg-stone-950 p-4 shadow-2xl outline-none sm:p-5"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-amber-100">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-3 py-1.5 text-stone-300 hover:bg-stone-800"
                aria-label={closeLabel}
              >
                ✕
              </button>
            </div>
            {children}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
