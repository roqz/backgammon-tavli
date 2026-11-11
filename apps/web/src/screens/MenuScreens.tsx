import { BOT_LEVELS, type BotLevel } from "@tavli/ai";
import type { MatchConfig, MatchVariant } from "@tavli/engine";
import { useState } from "react";
import { Button, Card, Segmented, Toggle } from "../components/ui";
import { useT } from "../i18n";
import { disconnect } from "../online/client";
import { useOnline } from "../online/store";
import { type PlayerInfo, useGame } from "../store/game";
import { useSettings } from "../store/settings";

export function Menu({
  onNew,
  onResume,
  onSettings,
  onStats,
  onOnline,
}: {
  onNew: () => void;
  onResume: () => void;
  onSettings: () => void;
  onStats: () => void;
  onOnline: () => void;
}) {
  const t = useT();
  const match = useGame((s) => s.match);
  const mode = useGame((s) => s.mode);
  const onlineActive = useOnline((s) => s.match !== null && s.match.end === null);
  const canResume = mode === "local" && match !== null && match.winner === null;
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-8 p-6">
      <div className="text-center">
        <img src="./icon.svg" alt="" className="mx-auto mb-4 h-24 w-24 drop-shadow-xl" />
        <h1 className="text-4xl font-bold tracking-tight text-amber-100">{t.appTitle}</h1>
        <p className="mt-2 text-stone-400">{t.tagline}</p>
      </div>
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
        <Button variant="ghost" onClick={onStats}>
          📊 {t.stats}
        </Button>
        <Button variant="ghost" onClick={onSettings}>
          ⚙ {t.settings}
        </Button>
      </div>
    </div>
  );
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
  const levelName: Record<BotLevel, string> = { easy: t.easy, medium: t.medium, hard: t.hard };

  const start = () => {
    const config: MatchConfig = { variant, length, crawford: true, jacoby: length === 0 };
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
    startMatch(config, players);
    onStarted();
  };

  function botPlayer(): PlayerInfo {
    return { name: `${t.computer} (${levelName[level]})`, kind: "bot", level };
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onBack} className="px-3">
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

function ServerUrlField() {
  const t = useT();
  const { serverUrl, set } = useOnline();
  const [value, setValue] = useState(serverUrl);
  return (
    <Card className="order-last flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm text-stone-400">
        {t.serverUrl}
        <input
          className="rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 font-mono text-sm text-stone-100 outline-none focus:border-amber-400"
          value={value}
          placeholder="https://tavli.example.com"
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => {
            const url = value.trim().replace(/\/$/, "");
            if (url !== serverUrl) {
              disconnect();
              set({ serverUrl: url, profile: null });
            }
          }}
        />
      </label>
    </Card>
  );
}

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const t = useT();
  const s = useSettings();
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onBack} className="px-3">
          ←
        </Button>
        <h1 className="text-2xl font-bold text-amber-100">{t.settings}</h1>
      </div>
      <ServerUrlField />
      <Card className="flex flex-col gap-5">
        <Segmented
          label={t.style}
          value={s.style}
          onChange={(style) => s.update({ style })}
          options={[
            { value: "classic", label: t.classic },
            { value: "modern", label: t.modern },
          ]}
        />
        <Segmented
          label={t.language}
          value={s.lang}
          onChange={(lang) => s.update({ lang })}
          options={[
            { value: "de", label: "Deutsch" },
            { value: "en", label: "English" },
          ]}
        />
        <div className="divide-y divide-stone-800">
          <Toggle label={t.showPips} checked={s.showPips} onChange={(showPips) => s.update({ showPips })} />
          <Toggle
            label={t.showNumbers}
            checked={s.showNumbers}
            onChange={(showNumbers) => s.update({ showNumbers })}
          />
          <Toggle label={t.autoRoll} checked={s.autoRoll} onChange={(autoRoll) => s.update({ autoRoll })} />
          <Toggle
            sub
            disabled={!s.autoRoll}
            label={t.autoRollCountdown}
            checked={s.autoRollCountdown}
            onChange={(autoRollCountdown) => s.update({ autoRollCountdown })}
          />
          <Toggle label={t.sound} checked={s.sound} onChange={(sound) => s.update({ sound })} />
          <Toggle label={t.dice3d} checked={s.dice3d} onChange={(dice3d) => s.update({ dice3d })} />
          <Toggle
            label={t.autoConfirm}
            checked={s.autoConfirm}
            onChange={(autoConfirm) => s.update({ autoConfirm })}
          />
          <Toggle
            sub
            disabled={!s.autoConfirm}
            label={t.autoConfirmDelay}
            checked={s.autoConfirmDelay}
            onChange={(autoConfirmDelay) => s.update({ autoConfirmDelay })}
          />
        </div>
      </Card>
    </div>
  );
}
