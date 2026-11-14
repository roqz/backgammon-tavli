import { BOT_LEVELS, type BotLevel, hasNet } from "@tavli/ai";
import {
  gameFromXgid,
  getVariant,
  isGnubgId,
  type MatchConfig,
  type MatchStart,
  type MatchVariant,
  parseGnubgId,
  parseXgid,
  type VariantId,
  XGID_VARIANTS,
} from "@tavli/engine";
import { useEffect, useState } from "react";
import { Button, Card, Segmented, Toggle } from "../components/ui";
import { useT } from "../i18n";
import { SOURCE_URL } from "../legal";
import { unqueue } from "../online/client";
import { useOnline } from "../online/store";
import { todoCount, useTodo } from "../online/todo";
import { today, usePuzzles } from "../puzzle";
import { type PlayerInfo, useGame } from "../store/game";
import { useSettings } from "../store/settings";
import type { OnlineTab } from "./OnlineScreen";
import { SettingsPanel } from "./SettingsPanel";

export function Menu({
  onNew,
  onResume,
  onSettings,
  onStats,
  onOnline,
  onRules,
  onLegal,
  onTutorial,
  onPuzzle,
  onCorr,
}: {
  onTutorial: () => void;
  onPuzzle: () => void;
  onNew: () => void;
  onResume: () => void;
  onSettings: () => void;
  onStats: () => void;
  /** Opens the online screen, optionally on a given tab. */
  onOnline: (tab?: OnlineTab) => void;
  /** Opens a correspondence game. */
  onCorr: (id: string) => void;
  onRules: () => void;
  onLegal: (page: "imprint" | "privacy") => void;
}) {
  const t = useT();
  const match = useGame((s) => s.match);
  const mode = useGame((s) => s.mode);
  const onlineActive = useOnline((s) => s.match !== null && s.match.end === null);
  const canResume = mode === "local" && match !== null && match.winner === null;
  const lobby = useOnline((s) => s.lobby);
  const solvedToday = usePuzzles((s) => s.results[today()] !== undefined);
  const online = useOnlineStatus();
  const todo = useTodo();
  const todoTotal = todoCount(todo);
  // Phones held sideways ("short:"): brand and to-do list on the left, the menu on the right.
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-8 p-6 short:max-w-3xl short:flex-row short:items-start short:gap-6 short:py-4 short:pr-[max(1rem,env(safe-area-inset-right))] short:pl-[max(1rem,env(safe-area-inset-left))]">
      <div className="flex w-full flex-col gap-4 short:sticky short:top-4 short:w-64 short:shrink-0">
        <div className="text-center short:flex short:items-center short:gap-3 short:text-left">
          <img
            src="./icon.svg"
            alt=""
            className="mx-auto mb-4 h-24 w-24 drop-shadow-xl short:m-0 short:h-12 short:w-12"
          />
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-amber-100 short:text-2xl">{t.appTitle}</h1>
            <p className="mt-2 text-stone-400 short:hidden">{t.tagline}</p>
          </div>
        </div>
        {todo && todoTotal > 0 && (
          <section
            aria-label={t.todoTitle}
            className="flex w-full flex-col gap-1 rounded-xl border border-amber-400/40 bg-amber-400/10 p-2 text-sm"
          >
            <h2 className="px-2 text-xs font-semibold uppercase tracking-wide text-amber-300">
              {t.todoTitle}
            </h2>
            {todo.corrTurn.length > 0 && (
              <TodoRow
                icon="♟"
                label={t.todoCorrTurn}
                detail={
                  todo.corrTurn.length === 1
                    ? todo.corrTurn[0]!.players[todo.corrTurn[0]!.seat === 0 ? 1 : 0].name
                    : undefined
                }
                count={todo.corrTurn.length}
                onClick={() => (todo.corrTurn.length === 1 ? onCorr(todo.corrTurn[0]!.id) : onOnline("corr"))}
              />
            )}
            {todo.corrInvites.length > 0 && (
              <TodoRow
                icon="✉"
                label={t.todoCorrInvite}
                count={todo.corrInvites.length}
                onClick={() => onOnline("corr")}
              />
            )}
            {todo.friendRequests > 0 && (
              <TodoRow
                icon="👥"
                label={t.todoFriendRequests}
                count={todo.friendRequests}
                onClick={() => onOnline("friends")}
              />
            )}
          </section>
        )}
        {lobby.kind === "queued" && (
          <div className="flex w-full items-center justify-between gap-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-sm text-amber-100">
            <button type="button" className="flex items-center gap-2" onClick={() => onOnline()}>
              <span className="h-2 w-2 rounded-full bg-amber-400 motion-safe:animate-pulse" />
              {t.searching}
            </button>
            <button
              type="button"
              className="rounded-lg px-2 py-0.5 text-stone-300 hover:bg-stone-800"
              onClick={() => unqueue()}
            >
              ✕ {t.cancel}
            </button>
          </div>
        )}
        {!online && <p className="text-center text-xs text-stone-500">📴 {t.offlineHint}</p>}
        <div className="hidden short:block">
          <LegalFooter onLegal={onLegal} />
        </div>
      </div>
      <div className="flex w-full flex-col gap-3 short:grid short:flex-1 short:grid-cols-2">
        {onlineActive ? (
          <Button variant="primary" className="py-4 text-lg short:col-span-2 short:py-3" onClick={onResume}>
            🌐 {t.resumeOnline}
          </Button>
        ) : (
          <>
            {canResume && (
              <Button
                variant="primary"
                className="py-4 text-lg short:col-span-2 short:py-3"
                onClick={onResume}
              >
                {t.resume}
              </Button>
            )}
            <Button
              variant={canResume ? "secondary" : "primary"}
              className="py-4 text-lg short:py-3"
              onClick={onNew}
            >
              {t.newGame}
            </Button>
            <Button className="relative py-4 text-lg short:py-3" onClick={() => onOnline()}>
              🌐 {t.online}
              <span className="block text-xs font-normal text-stone-400">{t.onlineSub}</span>
              {todoTotal > 0 && (
                <span className="absolute -top-2 -right-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-500 px-1.5 text-sm font-bold text-stone-950 tabular-nums">
                  <span className="sr-only">{t.todoTitle}: </span>
                  {todoTotal}
                </span>
              )}
            </Button>
          </>
        )}
        <div className="grid grid-cols-2 gap-3 short:col-span-2">
          <Button variant="ghost" onClick={onTutorial}>
            🎓 {t.tutorial}
          </Button>
          <Button variant="ghost" onClick={onPuzzle}>
            🧩 {t.puzzle}
            {!solvedToday && (
              <span className="ml-1 inline-block h-2 w-2 rounded-full bg-amber-400" aria-hidden />
            )}
          </Button>
        </div>
        <Button variant="ghost" onClick={onRules}>
          📖 {t.rules}
        </Button>
        <Button variant="ghost" onClick={onStats}>
          📊 {t.stats}
        </Button>
        <Button variant="ghost" onClick={onSettings}>
          ⚙ {t.settings}
        </Button>
      </div>
      <div className="short:hidden">
        <LegalFooter onLegal={onLegal} />
      </div>
    </div>
  );
}

function TodoRow({
  icon,
  label,
  detail,
  count,
  onClick,
}: {
  icon: string;
  label: string;
  detail?: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-left text-amber-50 hover:bg-amber-400/10 focus-visible:outline-2 focus-visible:outline-amber-400"
    >
      <span aria-hidden>{icon}</span>
      <span className="min-w-0 flex-1">
        {label}
        {detail && <span className="block truncate text-xs text-amber-200/70">{detail}</span>}
      </span>
      <span className="rounded-full bg-amber-500 px-2 text-xs font-bold text-stone-950 tabular-nums">
        {count}
      </span>
      <span aria-hidden className="text-amber-300">
        ›
      </span>
    </button>
  );
}

/** Imprint, privacy notice and source code (AGPL: the source must be reachable from the app). */
export function LegalFooter({ onLegal }: { onLegal: (page: "imprint" | "privacy") => void }) {
  const t = useT();
  return (
    <nav
      className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-stone-500"
      aria-label={t.imprint}
    >
      <button type="button" className="hover:text-stone-300" onClick={() => onLegal("imprint")}>
        {t.imprint}
      </button>
      <button type="button" className="hover:text-stone-300" onClick={() => onLegal("privacy")}>
        {t.privacy}
      </button>
      <a className="hover:text-stone-300" href={SOURCE_URL} target="_blank" rel="noreferrer noopener">
        {t.sourceCode} (AGPL)
      </a>
    </nav>
  );
}

/** Whether the browser is online. */
function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

const DEFAULT_LENGTH: Record<MatchVariant, number> = {
  backgammon: 5,
  portes: 5,
  plakoto: 5,
  fevga: 5,
  tavli: 5,
  tavla: 5,
  narde: 3,
  hypergammon: 3,
};

export function NewGame({ onBack, onStarted }: { onBack: () => void; onStarted: () => void }) {
  const t = useT();
  const startMatch = useGame((s) => s.startMatch);
  const [variant, setVariant] = useState<MatchVariant>("backgammon");
  const [length, setLength] = useState(DEFAULT_LENGTH.backgammon);
  // the online profile name is also used for local games
  // the online profile name, else the name used last time
  const savedName = useSettings((s) => s.playerName);
  const myName = useOnline((s) => s.profile?.name) ?? (savedName || t.you);
  const [names, setNames] = useState<[string, string]>([myName, t.playerBlack]);
  const [opponent, setOpponent] = useState<"bot" | "human">("bot");
  const [level, setLevel] = useState<BotLevel>("medium");
  const [seat, setSeat] = useState<0 | 1>(0);
  const [beavers, setBeavers] = useState(false);
  const [xgidOpen, setXgidOpen] = useState(false);
  const [xgid, setXgid] = useState("");
  const [xgidError, setXgidError] = useState<string | null>(null);
  const xgidPossible = XGID_VARIANTS.includes(variant as VariantId);
  const beaverPossible = variant !== "tavli" && getVariant(variant as VariantId).cube;
  const levelName: Record<BotLevel, string> = {
    easy: t.easy,
    medium: t.medium,
    hard: t.hard,
    expert: t.expert,
  };
  // the expert plays where a neural network is trained
  const expertHere = variant !== "tavli" && hasNet(variant as VariantId);
  const levels = BOT_LEVELS.filter((l) => l !== "expert" || expertHere);
  const botLevel: BotLevel = level === "expert" && !expertHere ? "hard" : level;

  const start = () => {
    let config: MatchConfig = {
      variant,
      length,
      crawford: true,
      jacoby: length === 0,
      ...(length === 0 && beaverPossible ? { beavers } : {}),
    };
    let from: MatchStart | undefined;
    if (xgidPossible && xgidOpen && xgid.trim()) {
      try {
        // XGID or GNU Backgammon "PositionID:MatchID"
        const x = isGnubgId(xgid) ? parseGnubgId(xgid) : parseXgid(xgid);
        const matchLength = x.length > 0 ? x.length : length;
        config = { ...config, length: matchLength, jacoby: matchLength === 0 && x.jacoby };
        from = {
          game: gameFromXgid(x, variant as VariantId),
          score: x.length > 0 ? x.score : [0, 0],
          crawfordGame: x.crawford,
        };
      } catch (e) {
        setXgidError(`${t.xgidInvalid}: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
    }
    const human = (p: 0 | 1): PlayerInfo => ({
      name: names[p].trim() || (p === 0 ? t.playerWhite : t.playerBlack),
      kind: "human",
    });
    const players: [PlayerInfo, PlayerInfo] =
      opponent === "human"
        ? [human(0), human(1)]
        : seat === 0
          ? [{ ...human(0), name: names[0].trim() || myName }, botPlayer()]
          : [botPlayer(), { ...human(1), name: names[0].trim() || myName }];
    const own = names[0].trim();
    if (own && own !== t.you && own !== t.playerWhite) useSettings.getState().update({ playerName: own });
    try {
      startMatch(config, players, from);
    } catch (e) {
      setXgidError(`${t.xgidInvalid}: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    onStarted();
  };

  function botPlayer(): PlayerInfo {
    return { name: `${t.computer} (${levelName[botLevel]})`, kind: "bot", level: botLevel };
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onBack} className="px-3" aria-label={t.back}>
          ←
        </Button>
        <h1 className="text-2xl font-bold text-amber-100">{t.newGame}</h1>
      </div>
      <Card className="flex flex-col gap-6">
        <Segmented
          label={t.variant}
          value={variant}
          onChange={(v) => {
            setVariant(v);
            setLength(DEFAULT_LENGTH[v]);
          }}
          options={[
            { value: "backgammon", label: "Backgammon" },
            { value: "portes", label: "Portes" },
            { value: "plakoto", label: "Plakoto" },
            { value: "fevga", label: "Fevga" },
            { value: "tavli", label: t.tavliMatch },
            { value: "tavla", label: "Tavla" },
            { value: "narde", label: "Narde" },
            { value: "hypergammon", label: "Hypergammon" },
          ]}
        />
        <p className="-mt-2 text-xs text-stone-400">{t.variantInfo[variant]}</p>
        <Segmented
          label={t.matchLength}
          value={length}
          onChange={setLength}
          options={[
            { value: 1, label: "1" },
            { value: 3, label: "3" },
            { value: 5, label: "5" },
            { value: 7, label: "7" },
            { value: 0, label: t.unlimited },
          ]}
        />
        <Segmented
          label={t.opponent}
          value={opponent}
          onChange={(o) => {
            setOpponent(o);
            // the player's own name stays; only the second name follows the opponent kind
            setNames([names[0], t.playerBlack]);
          }}
          options={[
            { value: "bot", label: t.computer },
            { value: "human", label: t.humanLocal },
          ]}
        />
        {length === 0 && beaverPossible && (
          <Toggle checked={beavers} onChange={setBeavers} label={t.beavers} description={t.beaversHint} />
        )}
        {opponent === "bot" && (
          <>
            <Segmented
              label={t.level}
              value={botLevel}
              onChange={setLevel}
              options={levels.map((l) => ({ value: l, label: levelName[l] }))}
            />
            {botLevel === "expert" && <p className="-mt-2 text-xs text-stone-400">{t.expertInfo}</p>}
            <Segmented
              label={t.playAs}
              value={seat}
              onChange={setSeat}
              options={[
                { value: 0, label: t.playerWhite },
                { value: 1, label: t.playerBlack },
              ]}
            />
          </>
        )}
        {xgidPossible && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="w-fit text-sm text-stone-400 hover:text-amber-200"
              aria-expanded={xgidOpen}
              onClick={() => setXgidOpen((o) => !o)}
            >
              {xgidOpen ? "▾" : "▸"} {t.importXgid}
            </button>
            {xgidOpen && (
              <>
                <input
                  aria-label={t.importXgid}
                  className="rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 font-mono text-xs text-stone-100 outline-none focus:border-amber-400"
                  placeholder="XGID=-b----E-C---eE---c-e----B-:0:0:1:00:0:0:0:0:10"
                  value={xgid}
                  spellCheck={false}
                  onChange={(e) => {
                    setXgid(e.target.value);
                    setXgidError(null);
                  }}
                />
                <p className="text-xs text-stone-500">{t.xgidHint}</p>
                {xgidError && <p className="text-sm text-red-400">{xgidError}</p>}
              </>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          {(opponent === "bot" ? ([0] as const) : ([0, 1] as const)).map((p) => (
            <label key={p} className="flex flex-col gap-1 text-sm text-stone-400">
              {opponent === "bot" ? t.name : p === 0 ? t.playerWhite : t.playerBlack}
              <input
                className="rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100 outline-none focus:border-amber-400"
                value={names[p]}
                maxLength={24}
                onChange={(e) => setNames(p === 0 ? [e.target.value, names[1]] : [names[0], e.target.value])}
              />
            </label>
          ))}
        </div>
      </Card>
      <Button variant="primary" className="py-4 text-lg" onClick={start}>
        {t.start}
      </Button>
    </div>
  );
}

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const t = useT();
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onBack} className="px-3" aria-label={t.back}>
          ←
        </Button>
        <h1 className="text-2xl font-bold text-amber-100">{t.settings}</h1>
      </div>
      <SettingsPanel />
    </div>
  );
}
