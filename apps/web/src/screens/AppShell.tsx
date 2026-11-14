import type { ReactNode } from "react";
import { useT } from "../i18n";

/** The five destinations of the main navigation. */
export type NavTarget = "menu" | "play" | "online" | "learn" | "profile";

const ICON: Record<NavTarget, ReactNode> = {
  menu: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  play: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <circle cx="9" cy="9" r="1" fill="currentColor" />
      <circle cx="15" cy="15" r="1" fill="currentColor" />
      <circle cx="15" cy="9" r="1" fill="currentColor" />
      <circle cx="9" cy="15" r="1" fill="currentColor" />
    </>
  ),
  online: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </>
  ),
  learn: <path d="M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3zM21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z" />,
  profile: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
};

export function NavIcon({ target, className = "h-6 w-6" }: { target: NavTarget; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {ICON[target]}
    </svg>
  );
}

/** The app logo: a plain, flat board. */
export function Logo({ className = "h-9 w-9" }: { className?: string }) {
  return <img src="./icon.svg" alt="" className={className} />;
}

/**
 * Screens outside a game: the content plus the main navigation, a bar at the bottom on phones held
 * upright, a rail on the left on wide screens and phones held sideways ("rail:" variant).
 */
export function AppShell({
  active,
  onNav,
  onlineBadge = 0,
  children,
}: {
  active: NavTarget | null;
  onNav: (target: NavTarget) => void;
  /** Number of things waiting online (correspondence moves, invitations, requests). */
  onlineBadge?: number;
  children: ReactNode;
}) {
  const t = useT();
  const items: [NavTarget, string][] = [
    ["menu", t.navHome],
    ["play", t.navPlay],
    ["online", t.navOnline],
    ["learn", t.navLearn],
    ["profile", t.navProfile],
  ];
  return (
    <div className="min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom))] rail:pr-[env(safe-area-inset-right)] rail:pb-0 rail:pl-[calc(5.5rem+env(safe-area-inset-left))]">
      {children}
      <nav
        aria-label={t.mainNav}
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-stone-800 bg-stone-950 px-1 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] rail:inset-x-auto rail:inset-y-0 rail:left-0 rail:flex rail:w-[calc(5.5rem+env(safe-area-inset-left))] rail:flex-col rail:items-center rail:justify-center rail:gap-1 rail:border-t-0 rail:border-r rail:pt-0 rail:pb-0 rail:pl-[env(safe-area-inset-left)]"
      >
        <Logo className="mb-3 hidden h-10 w-10 rail:block" />
        {items.map(([id, label]) => {
          const current = active === id;
          return (
            <button
              key={id}
              type="button"
              aria-current={current ? "page" : undefined}
              onClick={() => onNav(id)}
              className={`relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] focus-visible:outline-2 focus-visible:outline-amber-400 rail:h-14 rail:w-16 ${
                current
                  ? "font-semibold text-amber-300 rail:bg-amber-400/15"
                  : "text-stone-400 hover:text-stone-200"
              }`}
            >
              <NavIcon target={id} />
              {label}
              {id === "online" && onlineBadge > 0 && (
                <span className="absolute top-0.5 left-1/2 ml-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-500 px-1 text-[11px] font-bold text-stone-950 tabular-nums">
                  <span className="sr-only">: </span>
                  {onlineBadge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/** Title row of a screen in the shell, with an optional back button. */
export function ScreenTitle({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack?: () => void;
  children?: ReactNode;
}) {
  const t = useT();
  return (
    <header className="flex items-center gap-2">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label={t.back}
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-stone-200 hover:bg-stone-800 focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
      )}
      <h1 className="min-w-0 flex-1 truncate text-2xl font-bold text-amber-100 sm:text-3xl">{title}</h1>
      {children}
    </header>
  );
}

/** Rows of a navigation list (profile, settings). */
export function ListRow({
  label,
  detail,
  value,
  icon,
  onClick,
  href,
}: {
  label: string;
  detail?: ReactNode;
  value?: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
  href?: string;
}) {
  const inner = (
    <>
      {icon && (
        <span aria-hidden className="flex w-6 justify-center text-amber-300">
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] text-stone-100">{label}</span>
        {detail && <span className="block text-xs text-stone-400">{detail}</span>}
      </span>
      {value !== undefined && <span className="text-sm text-stone-400">{value}</span>}
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4 shrink-0 text-stone-500"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </>
  );
  const cls =
    "flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left hover:bg-stone-800/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-amber-400";
  return href ? (
    <a href={href} target="_blank" rel="noreferrer noopener" className={cls}>
      {inner}
    </a>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

/** A rounded group of list rows. */
export function ListGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      {title && (
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-stone-400">{title}</h2>
      )}
      <div className="flex flex-col divide-y divide-stone-800 overflow-hidden rounded-2xl border border-stone-800 bg-stone-900/80">
        {children}
      </div>
    </section>
  );
}
