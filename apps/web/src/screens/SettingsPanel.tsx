import { useState } from "react";
import { type BoardStyle, THEMES } from "../board/themes";
import { Drawer } from "../components/Drawer";
import { Section, Toggle } from "../components/ui";
import { useT } from "../i18n";
import { disconnect } from "../online/client";
import { useOnline } from "../online/store";
import { useSettings } from "../store/settings";

/** Miniature board in the colours of a style. */
function StylePreview({ style }: { style: BoardStyle }) {
  const th = THEMES[style];
  const tri = (x: number, top: boolean, fill: string) => (
    <path
      key={`${x}${top}`}
      d={top ? `M${x},6 L${x + 10},6 L${x + 5},30 Z` : `M${x},66 L${x + 10},66 L${x + 5},42 Z`}
      fill={fill}
    />
  );
  return (
    <svg viewBox="0 0 120 72" className="h-auto w-full rounded-lg" aria-hidden>
      <defs>{th.defs}</defs>
      <rect width="120" height="72" rx="6" fill={th.frame} />
      <rect x="5" y="5" width="50" height="62" fill={th.felt} />
      <rect x="65" y="5" width="50" height="62" fill={th.felt} />
      <rect x="55" y="0" width="10" height="72" fill={th.bar} />
      {[5, 15, 25, 35, 45, 65, 75, 85, 95, 105].map((x, i) => tri(x, true, i % 2 ? th.pointB : th.pointA))}
      {[5, 15, 25, 35, 45, 65, 75, 85, 95, 105].map((x, i) => tri(x, false, i % 2 ? th.pointA : th.pointB))}
      <circle cx="20" cy="60" r="4.5" fill={th.checkers[0].fill} stroke={th.checkers[0].edge} />
      <circle cx="20" cy="51" r="4.5" fill={th.checkers[0].fill} stroke={th.checkers[0].edge} />
      <circle cx="100" cy="12" r="4.5" fill={th.checkers[1].fill} stroke={th.checkers[1].edge} />
      <circle cx="100" cy="21" r="4.5" fill={th.checkers[1].fill} stroke={th.checkers[1].edge} />
      <rect x="78" y="31" width="9" height="9" rx="2" fill={th.die.fill} />
      <rect x="90" y="31" width="9" height="9" rx="2" fill={th.die.fill} />
    </svg>
  );
}

function StylePicker() {
  const t = useT();
  const { style, update } = useSettings();
  return (
    <div className="grid grid-cols-2 gap-3 py-3">
      {(["classic", "modern"] as const).map((s) => (
        <button
          key={s}
          type="button"
          aria-pressed={style === s}
          onClick={() => update({ style: s })}
          className={`rounded-xl border-2 p-2 text-left transition-colors ${
            style === s ? "border-amber-400 bg-amber-400/10" : "border-stone-800 hover:border-stone-600"
          }`}
        >
          <StylePreview style={s} />
          <div className="mt-2 flex items-center justify-between px-1 text-sm">
            <span className={style === s ? "font-semibold text-amber-200" : "text-stone-300"}>
              {s === "classic" ? t.classic : t.modern}
            </span>
            {style === s && <span className="text-amber-300">✓</span>}
          </div>
        </button>
      ))}
    </div>
  );
}

function ServerUrlField() {
  const t = useT();
  const { serverUrl, set, profile } = useOnline();
  const [value, setValue] = useState(serverUrl);
  return (
    <div className="py-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-stone-100">{t.serverUrl}</span>
        <span className="text-xs text-stone-500">{t.serverDesc}</span>
        <input
          className="mt-1 rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 font-mono text-sm text-stone-100 outline-none focus:border-amber-400"
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
      {profile && (
        <p className="mt-2 text-xs text-stone-500">
          👤 {profile.name} · {t.profileHint}
        </p>
      )}
    </div>
  );
}

/** All settings, grouped. Used as a page from the menu and as a drawer during a game. */
export function SettingsPanel() {
  const t = useT();
  const s = useSettings();
  return (
    <div className="flex flex-col gap-4">
      <Section title={t.appearance} icon="🎨">
        <StylePicker />
        <Toggle
          label={t.dice3d}
          description={t.dice3dDesc}
          checked={s.dice3d}
          onChange={(dice3d) => s.update({ dice3d })}
        />
        <Toggle label={t.showPips} checked={s.showPips} onChange={(showPips) => s.update({ showPips })} />
        <Toggle
          label={t.showNumbers}
          checked={s.showNumbers}
          onChange={(showNumbers) => s.update({ showNumbers })}
        />
        <Toggle
          label={t.homeLeft}
          description={t.homeLeftHint}
          checked={s.homeLeft}
          onChange={(homeLeft) => s.update({ homeLeft })}
        />
      </Section>

      <Section title={t.gameplay} icon="🎲">
        <Toggle
          label={t.autoRoll}
          description={t.autoRollDesc}
          checked={s.autoRoll}
          onChange={(autoRoll) => s.update({ autoRoll })}
        />
        <Toggle
          sub
          disabled={!s.autoRoll}
          label={t.autoRollCountdown}
          checked={s.autoRollCountdown}
          onChange={(autoRollCountdown) => s.update({ autoRollCountdown })}
        />
        <Toggle
          label={t.autoConfirm}
          description={t.autoConfirmDesc}
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
      </Section>

      <Section title={t.soundSection} icon="🔊">
        <Toggle
          label={t.sound}
          description={t.soundDesc}
          checked={s.sound}
          onChange={(sound) => s.update({ sound })}
        />
      </Section>

      <Section title={t.language} icon="🌐">
        <div className="flex gap-2 py-3">
          {(
            [
              ["de", "Deutsch"],
              ["en", "English"],
            ] as const
          ).map(([lang, label]) => (
            <button
              key={lang}
              type="button"
              aria-pressed={s.lang === lang}
              onClick={() => s.update({ lang })}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                s.lang === lang
                  ? "border-amber-400 bg-amber-400/15 text-amber-200"
                  : "border-stone-700 text-stone-300 hover:border-stone-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Section>

      <Section title={t.onlineSection} icon="📡">
        <Toggle
          label={t.showEmotes}
          description={t.showEmotesHint}
          checked={s.showEmotes}
          onChange={(showEmotes) => s.update({ showEmotes })}
        />
        <ServerUrlField />
      </Section>
    </div>
  );
}

/** Settings over the running game (the game stays mounted). */
export function SettingsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  return (
    <Drawer open={open} onClose={onClose} title={`⚙ ${t.settings}`} closeLabel={t.close}>
      <SettingsPanel />
    </Drawer>
  );
}
