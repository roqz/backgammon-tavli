import type { ReactNode } from "react";
import { useT } from "../i18n";

/** The four destinations of the main navigation. */
export type NavTarget = "menu" | "play" | "online" | "profile";

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

export function CountBadge({ n, className = "" }: { n: number; className?: string }) {
  if (n <= 0) return null;
  return (
    <span
      className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-500 px-1 text-[11px] font-bold text-stone-950 tabular-nums ${className}`}
    >
      <span className="sr-only">: </span>
      {n}
    </span>
  );
}

/**
 * Screens outside a game: the content plus the main navigation. Phones held upright have a bar at
 * the bottom, phones held sideways a rail on the left ("short:"), tablets and desktops a bar at the
 * top ("wide:").
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
    ["profile", t.navProfile],
  ];
  const badge = (id: NavTarget) => (id === "online" ? onlineBadge : 0);
  return (
    <div className="min-h-dvh overflow-x-clip pb-[calc(4.5rem+env(safe-area-inset-bottom))] short:pr-[env(safe-area-inset-right)] short:pb-0 short:pl-[calc(5.5rem+env(safe-area-inset-left))] wide:pb-0">
      <AppHeader active={active} onNav={onNav} onlineBadge={onlineBadge} />
      {children}
      <nav
        aria-label={t.mainNav}
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-stone-800 bg-stone-950 px-1 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] short:inset-x-auto short:inset-y-0 short:left-0 short:flex short:w-[calc(5.5rem+env(safe-area-inset-left))] short:flex-col short:items-center short:justify-center short:gap-1 short:border-t-0 short:border-r short:pt-0 short:pb-0 short:pl-[env(safe-area-inset-left)] wide:hidden"
      >
        <Logo className="mb-3 hidden h-10 w-10 short:block" />
        {items.map(([id, label]) => {
          const current = active === id;
          return (
            <button
              key={id}
              type="button"
              aria-current={current ? "page" : undefined}
              onClick={() => onNav(id)}
              className={`relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] focus-visible:outline-2 focus-visible:outline-amber-400 short:h-14 short:w-16 ${
                current
                  ? "font-semibold text-amber-300 short:bg-amber-400/15"
                  : "text-stone-400 hover:text-stone-200"
              }`}
            >
              <NavIcon target={id} />
              {label}
              <CountBadge n={badge(id)} className="absolute top-0.5 left-1/2 ml-1.5" />
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/**
 * The bar at the top on tablets and desktops (hidden on phones): logo and main navigation. Also
 * above the board during a game, so the app keeps its frame on a big screen.
 */
export function AppHeader({
  active,
  onNav,
  onlineBadge = 0,
}: {
  active: NavTarget | null;
  onNav: (target: NavTarget) => void;
  onlineBadge?: number;
}) {
  const t = useT();
  const items: [NavTarget, string][] = [
    ["menu", t.navHome],
    ["play", t.navPlay],
    ["online", t.navOnline],
    ["profile", t.navProfile],
  ];
  const badge = (id: NavTarget) => (id === "online" ? onlineBadge : 0);
  return (
    <header className="sticky top-0 z-20 hidden border-b border-stone-800/80 bg-stone-950/95 backdrop-blur wide:block">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-8">
        <button
          type="button"
          onClick={() => onNav("menu")}
          className="flex items-center gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          <Logo className="h-9 w-9" />
          <span className="font-display text-xl font-semibold text-amber-100">{t.appTitle}</span>
        </button>
        <nav aria-label={t.mainNav} className="ml-auto flex items-center gap-1">
          {items.map(([id, label]) => {
            const current = active === id;
            return (
              <button
                key={id}
                type="button"
                aria-current={current ? "page" : undefined}
                onClick={() => onNav(id)}
                className={`relative flex h-10 items-center gap-2 rounded-xl px-4 text-sm focus-visible:outline-2 focus-visible:outline-amber-400 ${
                  current
                    ? "bg-amber-400/15 font-semibold text-amber-200"
                    : "text-stone-300 hover:bg-stone-800/70 hover:text-stone-100"
                }`}
              >
                <NavIcon target={id} className="h-5 w-5" />
                {label}
                <CountBadge n={badge(id)} />
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

/** The frame of every page in the shell: the same width, gutters and spacing everywhere. */
export function Page({
  narrow = false,
  className = "",
  children,
}: {
  /** Forms and lists that read best in one column. */
  narrow?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`mx-auto flex w-full flex-col gap-6 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-8 short:pt-4 wide:px-8 wide:pt-10 ${
        narrow ? "max-w-3xl" : "max-w-6xl"
      } ${className}`}
    >
      {children}
    </div>
  );
}

/** Title of a page: the same on every screen, with an optional back button, subtitle and actions. */
export function ScreenTitle({
  title,
  subtitle,
  onBack,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  onBack?: () => void;
  children?: ReactNode;
}) {
  const t = useT();
  return (
    <header className="flex min-h-12 items-center gap-3">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label={t.back}
          className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-stone-200 hover:bg-stone-800 focus-visible:outline-2 focus-visible:outline-amber-400"
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
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-[28px] font-semibold leading-tight text-amber-100 wide:text-4xl">
          {title}
        </h1>
        {subtitle && <p className="line-clamp-2 text-sm text-stone-400">{subtitle}</p>}
      </div>
      {children}
    </header>
  );
}

/** A row of board points (the "Clubraum" divider). */
export function PointStrip({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={`block h-2.5 w-full ${className}`}
      preserveAspectRatio="none"
      viewBox="0 0 336 10"
    >
      {Array.from({ length: 14 }, (_, i) => (
        <path
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed pattern
          key={i}
          d={`M${i * 24} 0h12l-6 10z`}
          className={i % 2 === 0 ? "fill-amber-500/60" : "fill-stone-100/35"}
        />
      ))}
    </svg>
  );
}

/** A heading above a group of cards or rows. */
export function SectionTitle({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="px-1 text-xs font-semibold uppercase tracking-wide text-stone-400">
      {children}
    </h2>
  );
}

/** A large choice: icon, title, one line of detail; opens the next step. */
export function ActionCard({
  icon,
  title,
  detail,
  onClick,
  badge = 0,
  dot = false,
  status,
  compact = false,
}: {
  icon: ReactNode;
  title: string;
  detail: ReactNode;
  onClick: () => void;
  badge?: number;
  dot?: boolean;
  /** Small mark after the title (e.g. today's puzzle state). */
  status?: ReactNode;
  /** Small on phones (side by side, without the detail line); full size on large screens. */
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex items-center rounded-xl border border-stone-800 bg-stone-900/80 text-left transition-colors hover:border-amber-400/50 hover:bg-stone-900 focus-visible:outline-2 focus-visible:outline-amber-400 ${
        compact
          ? "min-h-14 gap-3 p-3 lg:min-h-20 lg:gap-4 lg:p-4"
          : "min-h-20 gap-4 p-4 wide:min-h-28 wide:p-5"
      }`}
    >
      <span
        aria-hidden
        className={`flex shrink-0 items-center justify-center rounded-xl bg-stone-800 text-amber-300 group-hover:bg-amber-400/15 ${
          compact ? "h-9 w-9 lg:h-12 lg:w-12" : "h-12 w-12"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-base font-semibold text-stone-50 wide:text-lg">
          {title}
          {dot && <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden />}
          {status}
          <CountBadge n={badge} />
        </span>
        <span className={`block text-sm text-stone-400 ${compact ? "max-lg:sr-only" : ""}`}>{detail}</span>
      </span>
      <svg
        viewBox="0 0 24 24"
        className={`h-5 w-5 shrink-0 text-stone-500 group-hover:text-amber-300 ${compact ? "max-lg:hidden" : ""}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  );
}

/** Stroke icons of the menus. */
export function Glyph({ d, className = "h-6 w-6" }: { d: string; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

export const GLYPH = {
  computer: "M4 5h16v11H4zM9 20h6M12 16v4",
  people:
    "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 3.5a4 4 0 0 1 0 7.5M22 21a7 7 0 0 0-4-6.3",
  live: "M13 2L4 14h7l-1 8 9-12h-7z",
  mail: "M3 6h18v12H3zM3 6l9 7 9-7",
  puzzle:
    "M10 3h4v3a2 2 0 1 0 4 0h3v5h-3a2 2 0 1 0 0 4h3v6h-6v-3a2 2 0 1 0-4 0v3H4v-6h3a2 2 0 1 0 0-4H4V6h6z",
  school: "M2 9l10-5 10 5-10 5zM6 11v5c3 2.5 9 2.5 12 0v-5M22 9v6",
  book: "M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3zM21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z",
  stats: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  ranking: "M4 18h4v-5H4zM10 18h4V7h-4zM16 18h4v-8h-4z",
  board: "M4 5h16v14H4zM12 5v14M4 12h4M16 12h4",
  settings:
    "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  play: "M7 4v16l13-8z",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4",
  trophy: "M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M10 17h4",
  heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
} as const;

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
      <div className="flex flex-col divide-y divide-stone-800 overflow-hidden rounded-xl border border-stone-800 bg-stone-900/80">
        {children}
      </div>
    </section>
  );
}
