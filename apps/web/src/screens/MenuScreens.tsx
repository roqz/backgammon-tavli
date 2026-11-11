import type { MatchConfig, MatchVariant } from "@tavli/engine";
import { useState } from "react";
import { Button, Card, Segmented, Toggle } from "../components/ui";
import { useT } from "../i18n";
import { useGame } from "../store/game";
import { useSettings } from "../store/settings";

export function Menu({
  onNew,
  onResume,
  onSettings,
}: {
  onNew: () => void;
  onResume: () => void;
  onSettings: () => void;
}) {
  const t = useT();
  const match = useGame((s) => s.match);
  const canResume = match !== null && match.winner === null;
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-8 p-6">
      <div className="text-center">
        <img src="./icon.svg" alt="" className="mx-auto mb-4 h-24 w-24 drop-shadow-xl" />
        <h1 className="text-4xl font-bold tracking-tight text-amber-100">{t.appTitle}</h1>
        <p className="mt-2 text-stone-400">{t.tagline}</p>
      </div>
      <div className="flex w-full flex-col gap-3">
        {canResume && (
          <Button variant="primary" className="py-4 text-lg" onClick={onResume}>
            {t.resume}
          </Button>
        )}
        <Button variant={canResume ? "secondary" : "primary"} className="py-4 text-lg" onClick={onNew}>
          {t.newGame}
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
  const [names, setNames] = useState<[string, string]>([t.playerWhite, t.playerBlack]);

  const start = () => {
    const config: MatchConfig = { variant, length, crawford: true, jacoby: length === 0 };
    startMatch(config, [
      { name: names[0].trim() || t.playerWhite, kind: "human" },
      { name: names[1].trim() || t.playerBlack, kind: "human" },
    ]);
    onStarted();
  };

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
          value="human"
          onChange={() => {}}
          options={[
            { value: "human", label: t.humanLocal },
            { value: "bot", label: `${t.computer} (${t.comingSoon})`, disabled: true },
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          {([0, 1] as const).map((p) => (
            <label key={p} className="flex flex-col gap-1 text-sm text-stone-400">
              {p === 0 ? t.playerWhite : t.playerBlack}
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
  const s = useSettings();
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onBack} className="px-3">
          ←
        </Button>
        <h1 className="text-2xl font-bold text-amber-100">{t.settings}</h1>
      </div>
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
            label={t.autoConfirm}
            checked={s.autoConfirm}
            onChange={(autoConfirm) => s.update({ autoConfirm })}
          />
        </div>
      </Card>
    </div>
  );
}
