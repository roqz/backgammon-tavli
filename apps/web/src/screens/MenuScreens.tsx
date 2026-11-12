import { BOT_LEVELS, type BotLevel } from "@tavli/ai";
import {
  gameFromXgid,
  type MatchConfig,
  type MatchStart,
  type MatchVariant,
  parseXgid,
  type VariantId,
  XGID_VARIANTS,
} from "@tavli/engine";
import { useEffect, useState } from "react";
import { Button, Card, Segmented } from "../components/ui";
import { useT } from "../i18n";
import { SOURCE_URL } from "../legal";
import { unqueue } from "../online/client";
import { useOnline } from "../online/store";
import { today, usePuzzles } from "../puzzle";
import { type PlayerInfo, useGame } from "../store/game";
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
}: {
  onTutorial: () => void;
  onPuzzle: () => void;
  onNew: () => void;
  onResume: () => void;
  onSettings: () => void;
  onStats: () => void;
  onOnline: () => void;
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
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-8 p-6">
      <div className="text-center">
        <img src="./icon.svg" alt="" className="mx-auto mb-4 h-24 w-24 drop-shadow-xl" />
        <h1 className="text-4xl font-bold tracking-tight text-amber-100">{t.appTitle}</h1>
        <p className="mt-2 text-stone-400">{t.tagline}</p>
      </div>
      {lobby.kind === "queued" && (
        <div className="flex w-full items-center justify-between gap-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-sm text-amber-100">
          <button type="button" className="flex items-center gap-2" onClick={onOnline}>
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
      <div className="flex w-full flex-col gap-3">
        {onlineActive ? (
          <Button variant="primary" className="py-4 text-lg" onClick={onResume}>
            🌐 {t.resumeOnline}
          </Button>
        ) : (
          <>
            {canResume && (
              <Button variant="primary" className="py-4 text-lg" onClick={onResume}>
                {t.resume}
              </Button>
            )}
            <Button variant={canResume ? "secondary" : "primary"} className="py-4 text-lg" onClick={onNew}>
              {t.newGame}
            </Button>
            <Button className="py-4 text-lg" onClick={onOnline}>
              🌐 {t.online}
            </Button>
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
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
      <LegalFooter onLegal={onLegal} />
    </div>
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
};

export function NewGame({ onBack, onStarted }: { onBack: () => void; onStarted: () => void }) {
  const t = useT();
  const startMatch = useGame((s) => s.startMatch);
  const [variant, setVariant] = useState<MatchVariant>("backgammon");
  const [length, setLength] = useState(DEFAULT_LENGTH.backgammon);
  const [names, setNames] = useState<[string, string]>([t.you, t.playerBlack]);
  const [opponent, setOpponent] = useState<"bot" | "human">("bot");
  const [level, setLevel] = useState<BotLevel>("medium");
  const [seat, setSeat] = useState<0 | 1>(0);
  const [xgidOpen, setXgidOpen] = useState(false);
  const [xgid, setXgid] = useState("");
  const [xgidError, setXgidError] = useState<string | null>(null);
  const xgidPossible = XGID_VARIANTS.includes(variant as VariantId);
  const levelName: Record<BotLevel, string> = { easy: t.easy, medium: t.medium, hard: t.hard };

  const start = () => {
    let config: MatchConfig = { variant, length, crawford: true, jacoby: length === 0 };
    let from: MatchStart | undefined;
    if (xgidPossible && xgidOpen && xgid.trim()) {
      try {
        const x = parseXgid(xgid);
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
          ? [{ ...human(0), name: names[0].trim() || t.you }, botPlayer()]
          : [botPlayer(), { ...human(1), name: names[0].trim() || t.you }];
    try {
      startMatch(config, players, from);
    } catch (e) {
      setXgidError(`${t.xgidInvalid}: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    onStarted();
  };

  function botPlayer(): PlayerInfo {
    return { name: `${t.computer} (${levelName[level]})`, kind: "bot", level };
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
            setNames(o === "bot" ? [t.you, t.playerBlack] : [t.playerWhite, t.playerBlack]);
          }}
          options={[
            { value: "bot", label: t.computer },
            { value: "human", label: t.humanLocal },
          ]}
        />
        {opponent === "bot" && (
          <>
            <Segmented
              label={t.level}
              value={level}
              onChange={setLevel}
              options={BOT_LEVELS.map((l) => ({ value: l, label: levelName[l] }))}
            />
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
