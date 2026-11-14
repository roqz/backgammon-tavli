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
import { SetupLayout } from "../components/Setup";
import { Toggle } from "../components/ui";
import { Choice, VariantPicker, variantShortName } from "../components/VariantPicker";
import { type Dict, useT } from "../i18n";
import { SOURCE_URL } from "../legal";
import { useOnline } from "../online/store";
import { type PlayerInfo, useGame } from "../store/game";
import { useSettings } from "../store/settings";

/** Imprint, privacy notice and source code (AGPL: the source must be reachable from the app). */
export function LegalFooter({ onLegal }: { onLegal: (page: "imprint" | "privacy") => void }) {
  const t = useT();
  return (
    <nav
      className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-stone-500"
      aria-label={t.imprint}
    >
      <button type="button" className="py-1 hover:text-stone-300" onClick={() => onLegal("imprint")}>
        {t.imprint}
      </button>
      <button type="button" className="py-1 hover:text-stone-300" onClick={() => onLegal("privacy")}>
        {t.privacy}
      </button>
      <a className="py-1 hover:text-stone-300" href={SOURCE_URL} target="_blank" rel="noreferrer noopener">
        {t.sourceCode} (AGPL)
      </a>
    </nav>
  );
}

/** Whether the browser is online. */
export function useOnlineStatus(): boolean {
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

export const DEFAULT_LENGTH: Record<MatchVariant, number> = {
  backgammon: 5,
  portes: 5,
  plakoto: 5,
  fevga: 5,
  tavli: 5,
  tavla: 5,
  narde: 3,
  hypergammon: 3,
};

const LOCAL_VARIANTS: readonly MatchVariant[] = [
  "backgammon",
  "portes",
  "plakoto",
  "fevga",
  "tavli",
  "tavla",
  "narde",
  "hypergammon",
];

export const levelName = (t: Dict, l: BotLevel): string =>
  ({ easy: t.easy, medium: t.medium, hard: t.hard, expert: t.expert })[l];

/** The expert plays where a neural network is trained, elsewhere "hard" stands in. */
export const levelFor = (variant: MatchVariant, level: BotLevel): BotLevel =>
  level === "expert" && (variant === "tavli" || !hasNet(variant as VariantId)) ? "hard" : level;

/** The player's own name: the online profile, else the name used last time. */
const ownName = (t: Dict): string =>
  useOnline.getState().profile?.name ?? (useSettings.getState().playerName || t.you);

/** Starts a game against the computer (also the home screen's one-tap start). */
export function startBotGame(
  t: Dict,
  setup: { variant: MatchVariant; length: number; level: BotLevel; seat?: 0 | 1; name?: string },
  config?: Partial<MatchConfig>,
  from?: MatchStart,
): void {
  const level = levelFor(setup.variant, setup.level);
  const me: PlayerInfo = { name: setup.name?.trim() || ownName(t), kind: "human" };
  const bot: PlayerInfo = { name: `${t.computer} (${levelName(t, level)})`, kind: "bot", level };
  const length = config?.length ?? setup.length;
  useGame
    .getState()
    .startMatch(
      { variant: setup.variant, length, crawford: true, jacoby: length === 0, ...config },
      setup.seat === 1 ? [bot, me] : [me, bot],
      from,
    );
  useSettings.getState().update({ lastBot: { variant: setup.variant, length: setup.length, level } });
}

/** Options of a local game: against the computer or two players on one device. */
export function LocalSetup({ opponent, onStarted }: { opponent: "bot" | "human"; onStarted: () => void }) {
  const t = useT();
  const lastBot = useSettings((s) => s.lastBot);
  const [variant, setVariant] = useState<MatchVariant>(lastBot?.variant ?? "backgammon");
  const [length, setLength] = useState(lastBot?.length ?? DEFAULT_LENGTH.backgammon);
  const savedName = useSettings((s) => s.playerName);
  const myName = useOnline((s) => s.profile?.name) ?? (savedName || t.you);
  const [names, setNames] = useState<[string, string]>([myName, t.playerBlack]);
  const [level, setLevel] = useState<BotLevel>(lastBot?.level ?? "medium");
  const [seat, setSeat] = useState<0 | 1>(0);
  const [beavers, setBeavers] = useState(false);
  const [more, setMore] = useState(false);
  const [xgid, setXgid] = useState("");
  const [xgidError, setXgidError] = useState<string | null>(null);
  const xgidPossible = XGID_VARIANTS.includes(variant as VariantId);
  const beaverPossible = variant !== "tavli" && getVariant(variant as VariantId).cube;
  const expertHere = variant !== "tavli" && hasNet(variant as VariantId);
  const levels = BOT_LEVELS.filter((l) => l !== "expert" || expertHere);
  const botLevel = levelFor(variant, level);

  const start = () => {
    let config: Partial<MatchConfig> = {
      length,
      jacoby: length === 0,
      ...(length === 0 && beaverPossible ? { beavers } : {}),
    };
    let from: MatchStart | undefined;
    if (xgidPossible && more && xgid.trim()) {
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
    const own = names[0].trim();
    if (own && own !== t.you && own !== t.playerWhite) useSettings.getState().update({ playerName: own });
    try {
      if (opponent === "bot")
        startBotGame(t, { variant, length, level: botLevel, seat, name: own }, config, from);
      else {
        const human = (p: 0 | 1): PlayerInfo => ({
          name: names[p].trim() || (p === 0 ? t.playerWhite : t.playerBlack),
          kind: "human",
        });
        useGame
          .getState()
          .startMatch(
            { variant, length, crawford: true, jacoby: length === 0, ...config },
            [human(0), human(1)],
            from,
          );
      }
    } catch (e) {
      setXgidError(`${t.xgidInvalid}: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    onStarted();
  };

  const nameFields = (
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
  );

  const summary = [
    variantShortName(variant),
    length === 0 ? t.unlimited : lengthText(t, length),
    opponent === "bot" ? levelName(t, botLevel) : t.modeHumanSub,
  ].join(" · ");

  return (
    <SetupLayout variant={variant} summary={summary} action={{ label: t.start, onClick: start }}>
      <VariantPicker
        value={variant}
        variants={LOCAL_VARIANTS}
        onChange={(v) => {
          setVariant(v);
          setLength(DEFAULT_LENGTH[v]);
        }}
      />
      <Choice
        label={t.matchLength}
        value={length}
        onChange={setLength}
        options={[
          { value: 1, label: "1" },
          { value: 3, label: "3" },
          { value: 5, label: "5" },
          { value: 7, label: "7" },
          { value: 0, label: "∞", title: t.unlimited },
        ]}
      />
      {length === 1 && variant !== "tavli" && getVariant(variant as VariantId).cube && (
        <p className="-mt-4 text-xs text-stone-400">{t.oneNoCube}</p>
      )}
      {length === 0 && beaverPossible && (
        <Toggle checked={beavers} onChange={setBeavers} label={t.beavers} description={t.beaversHint} />
      )}
      {opponent === "bot" && (
        <>
          <Choice
            label={t.level}
            value={botLevel}
            onChange={setLevel}
            options={levels.map((l) => ({ value: l, label: levelName(t, l) }))}
          />
          {botLevel === "expert" && <p className="-mt-2 text-xs text-stone-400">{t.expertInfo}</p>}
        </>
      )}
      {opponent === "human" && nameFields}
      {(opponent === "bot" || xgidPossible) && (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            aria-expanded={more}
            onClick={() => setMore((m) => !m)}
            className="flex min-h-11 items-center gap-2 text-left text-sm text-stone-300 hover:text-amber-200"
          >
            <span className="flex-1">
              {t.moreOptions}
              <span className="block text-xs text-stone-400">
                {[opponent === "bot" && t.playAs, opponent === "bot" && t.name, xgidPossible && t.importXgid]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            <span aria-hidden>{more ? "▴" : "▾"}</span>
          </button>
          {more && (
            <div className="flex flex-col gap-4 rounded-2xl border border-stone-800 bg-stone-900/60 p-4">
              {opponent === "bot" && (
                <Choice
                  label={t.playAs}
                  value={seat}
                  onChange={setSeat}
                  options={[
                    { value: 0, label: t.playerWhite },
                    { value: 1, label: t.playerBlack },
                  ]}
                />
              )}
              {opponent === "bot" && nameFields}
              {xgidPossible && (
                <label className="flex flex-col gap-1 text-sm text-stone-400">
                  {t.importXgid}
                  <input
                    className="rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 font-mono text-xs text-stone-100 outline-none focus:border-amber-400"
                    placeholder="XGID=-b----E-C---eE---c-e----B-:0:0:1:00:0:0:0:0:10"
                    value={xgid}
                    spellCheck={false}
                    onChange={(e) => {
                      setXgid(e.target.value);
                      setXgidError(null);
                    }}
                  />
                  <span className="text-xs text-stone-500">{t.xgidHint}</span>
                </label>
              )}
            </div>
          )}
        </div>
      )}
      {xgidError && <p className="text-sm text-red-400">{xgidError}</p>}
    </SetupLayout>
  );
}

const lengthText = (t: Dict, length: number): string => `${length} ${length === 1 ? t.point : t.points}`;
