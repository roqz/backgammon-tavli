import { PUSH_KINDS, type PushKind } from "@tavli/protocol";
import { useEffect, useState } from "react";
import { useAchievements } from "../achievements";
import { SHOP, useCareer } from "../career";
import { Drawer } from "../components/Drawer";
import { Icon } from "../components/Icon";
import { CheckerPicker, DicePicker, lockText, StylePicker } from "../components/Looks";
import { Section, Segmented, Toggle } from "../components/ui";
import { useT } from "../i18n";
import { disconnect } from "../online/client";
import { fetchPushPrefs, savePushPrefs, usePushState } from "../online/push";
import { useOnline } from "../online/store";
import { isUnlocked, REWARDS } from "../rewards";
import { previewDice, previewSoundSet } from "../sound";
import { DICE_SURFACES, SOUND_SETS, useSettings } from "../store/settings";
import { ListGroup, ListRow, ScreenTitle } from "./AppShell";
import { PushToggle } from "./TournamentPanel";

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
          <Icon name="user" /> {profile.name} · {t.profileHint}
        </p>
      )}
    </div>
  );
}

/** Short state of the notifications for the settings list. */
function PushSummary() {
  const t = useT();
  const hasProfile = useOnline((s) => s.profile !== null);
  const [state] = usePushState();
  if (!hasProfile) return <>{t.pushNeedProfile}</>;
  return <>{state === "on" ? t.pushOn : state === "denied" ? t.pushDenied : t.pushOffHint}</>;
}

export type SectionId = "play" | "display" | "looks" | "sound" | "language" | "notify" | "online";

/**
 * All settings as a grouped list; each entry shows its current value and opens a page with the
 * options. Used as a screen (from the profile) and as a drawer during a game.
 */
export function SettingsPanel({
  initial = null,
  onExit,
}: {
  initial?: SectionId | null;
  /** As a screen: the title row shows where one is and leads back (to the list, or out of it). */
  onExit?: () => void;
} = {}) {
  const [page, setPage] = useState<SectionId | null>(initial);
  const t = useT();
  const s = useSettings();
  const unlocked = useAchievements((a) => a.unlocked);
  const countdown = (s.autoRoll && s.autoRollCountdown) || (s.autoConfirm && s.autoConfirmDelay);
  const titles: Record<SectionId, string> = {
    play: t.gameplay,
    display: t.displaySection,
    looks: initial === "looks" ? t.boardAndDice : t.appearance,
    sound: t.soundSection,
    language: t.language,
    notify: t.pushTitle,
    online: t.onlineSection,
  };
  return (
    <div className="flex flex-col gap-4">
      {onExit && (
        <ScreenTitle
          title={page ? titles[page] : t.settings}
          // opened straight on a page (e.g. "Board & dice"): back leaves, else back to the list
          onBack={page && page !== initial ? () => setPage(null) : onExit}
        />
      )}
      {page === null ? (
        <>
          <ListGroup title={t.settingsGroupGame}>
            <ListRow
              label={t.gameplay}
              detail={`${t.autoRoll}: ${s.autoRoll ? t.valueOn : t.valueOff} · ${t.autoConfirm}: ${s.autoConfirm ? t.valueOn : t.valueOff}${countdown ? ` · ${s.countdownSeconds} s` : ""}`}
              onClick={() => setPage("play")}
            />
            <ListRow
              label={t.displaySection}
              detail={`${t.showPips}: ${s.showPips ? t.valueOn : t.valueOff} · ${s.gameOrientation === "landscape" ? t.orientationLandscape : t.orientationAuto}`}
              onClick={() => setPage("display")}
            />
            <ListRow label={t.appearance} detail={t.styleNames[s.style]} onClick={() => setPage("looks")} />
            <ListRow
              label={t.soundSection}
              detail={`${t.sound}: ${s.sound ? t.valueOn : t.valueOff}`}
              onClick={() => setPage("sound")}
            />
          </ListGroup>
          <ListGroup title={t.settingsGroupOnline}>
            <ListRow label={t.pushTitle} detail={<PushSummary />} onClick={() => setPage("notify")} />
            <ListRow
              label={t.onlineSection}
              detail={`${t.showEmotes}: ${s.showEmotes ? t.valueOn : t.valueOff}`}
              onClick={() => setPage("online")}
            />
          </ListGroup>
          <ListGroup title={t.settingsGroupGeneral}>
            <ListRow
              label={t.language}
              detail={s.lang === "de" ? "Deutsch" : "English"}
              onClick={() => setPage("language")}
            />
          </ListGroup>
        </>
      ) : onExit ? null : (
        <button
          type="button"
          onClick={() => setPage(null)}
          className="flex min-h-11 w-fit items-center gap-1 rounded-lg pr-3 text-sm text-stone-300 hover:text-amber-200"
        >
          <Icon name="back" /> {t.settings}
        </button>
      )}

      {page === "play" && (
        <Section bare={!!onExit} title={t.gameplay} icon="dice">
          <Toggle
            label={t.autoRoll}
            description={t.autoRollDesc}
            checked={s.autoRoll}
            onChange={(autoRoll) => s.update({ autoRoll })}
          />
          <Toggle
            sub
            disabled={!s.autoRoll}
            label={t.autoRollCountdown.replace("{s}", String(s.countdownSeconds))}
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
            label={t.autoConfirmDelay.replace("{s}", String(s.countdownSeconds))}
            checked={s.autoConfirmDelay}
            onChange={(autoConfirmDelay) => s.update({ autoConfirmDelay })}
          />
          <div className={`py-3 ${countdown ? "" : "opacity-40"}`}>
            <Segmented
              label={t.countdownSeconds}
              value={s.countdownSeconds}
              onChange={(countdownSeconds) => s.update({ countdownSeconds })}
              options={([3, 2, 1] as const).map((n) => ({ value: n, label: `${n} s` }))}
            />
          </div>
        </Section>
      )}

      {page === "display" && (
        <Section bare={!!onExit} title={t.displaySection} icon="computer">
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
          <div className="py-3">
            <Segmented
              label={t.gameOrientation}
              value={s.gameOrientation}
              options={[
                { value: "auto", label: t.orientationAuto },
                { value: "landscape", label: t.orientationLandscape },
              ]}
              onChange={(gameOrientation) => s.update({ gameOrientation })}
            />
            <p className="mt-2 text-xs leading-snug text-stone-500">{t.gameOrientationHint}</p>
          </div>
        </Section>
      )}

      {page === "looks" && (
        <Section bare={!!onExit} title={t.appearance} icon="palette">
          <StylePicker />
          <DicePicker />
          <CheckerPicker />
          {isUnlocked(REWARDS.diceCup, unlocked) ? (
            <Toggle
              label={t.diceCup}
              description={t.diceCupDesc}
              checked={s.diceSound === "cup"}
              onChange={(on) => s.update({ diceSound: on ? "cup" : "classic" })}
            />
          ) : (
            <p className="py-2 text-xs text-stone-500">
              <Icon name="lock" /> {t.diceCup} – {lockText(t, REWARDS.diceCup)}
            </p>
          )}
          {isUnlocked(REWARDS.fireworks, unlocked) && (
            <Toggle
              label={t.fireworks}
              description={t.fireworksDesc}
              checked={s.fireworks}
              onChange={(fireworks) => s.update({ fireworks })}
            />
          )}
        </Section>
      )}

      {page === "sound" && (
        <Section bare={!!onExit} title={t.soundSection} icon="sound">
          <Toggle
            label={t.sound}
            description={t.soundDesc}
            checked={s.sound}
            onChange={(sound) => s.update({ sound })}
          />
          <SoundPicker
            label={t.soundSet}
            description={t.soundSetDesc}
            options={SOUND_SETS}
            names={t.soundSets}
            prefix="sound-"
            chosen={s.soundSet}
            onChoose={(soundSet) => {
              s.update({ soundSet });
              previewSoundSet(soundSet);
            }}
          />
          <SoundPicker
            label={t.diceSurface}
            description={t.diceSurfaceDesc}
            options={DICE_SURFACES}
            names={t.diceSurfaces}
            prefix="roll-"
            chosen={s.diceSurface}
            onChoose={(diceSurface) => {
              s.update({ diceSurface });
              previewDice(diceSurface);
            }}
          />
        </Section>
      )}

      {page === "language" && (
        <Section bare={!!onExit} title={t.language} icon="globe">
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
      )}

      {page === "notify" && (
        <Section bare={!!onExit} title={t.pushTitle} icon="bell">
          <NotificationSettings />
        </Section>
      )}

      {page === "online" && (
        <Section bare={!!onExit} title={t.onlineSection} icon="signal">
          <Toggle
            label={t.showEmotes}
            description={t.showEmotesHint}
            checked={s.showEmotes}
            onChange={(showEmotes) => s.update({ showEmotes })}
          />
          <ServerUrlField />
        </Section>
      )}
    </div>
  );
}

/** What notifications are for, how to get them on an iPhone, and the switch. */
function NotificationSettings() {
  const t = useT();
  const hasProfile = useOnline((s) => s.profile !== null);
  const ios = typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone =
    typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches;
  return (
    <div className="flex flex-col gap-2 text-sm text-stone-300">
      {ios && !standalone && (
        <p className="text-xs text-amber-200/80">
          <Icon name="phone" /> {t.pushIphone}
        </p>
      )}
      {hasProfile ? (
        <>
          <PushToggle />
          <PushKinds />
        </>
      ) : (
        <p className="text-xs text-stone-500">{t.pushNeedProfile}</p>
      )}
    </div>
  );
}

/** Which kinds of notifications the player wants (stored with the profile). */
function PushKinds() {
  const t = useT();
  const [off, setOff] = useState<readonly PushKind[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetchPushPrefs()
      .then((p) => setOff(p.off))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  const set = (kind: PushKind, on: boolean) => {
    if (!off) return;
    const next = on ? off.filter((k) => k !== kind) : [...off, kind];
    setOff(next);
    savePushPrefs(next).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : String(e));
      setOff(off);
    });
  };
  return (
    <div className="mt-2 flex flex-col gap-2">
      <p>{t.pushExplain}</p>
      {off === null && !error && <p className="text-xs text-stone-500">{t.loading}</p>}
      {off &&
        PUSH_KINDS.map((k) => (
          <Toggle key={k} checked={!off.includes(k)} onChange={(v) => set(k, v)} label={t.pushKinds[k]} />
        ))}
      <p className="text-xs text-stone-500">{t.pushKindsOnlyOffline}</p>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

/** Settings over the running game (the game stays mounted). */
export function SettingsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={
        <>
          <Icon name="settings" /> {t.settings}
        </>
      }
      closeLabel={t.close}
    >
      <SettingsPanel />
    </Drawer>
  );
}

/** Sound sets and dice sounds: classic for everyone, the others from the token exchange. */
function SoundPicker<T extends string>({
  label,
  description,
  options,
  names,
  prefix,
  chosen,
  onChoose,
}: {
  label: string;
  description: string;
  options: readonly T[];
  names: Record<T, string>;
  /** Shop id prefix (`sound-`, `roll-`). */
  prefix: string;
  chosen: T;
  onChoose: (value: T) => void;
}) {
  const t = useT();
  const owned = useCareer((s) => s.owned);
  return (
    <div className="flex flex-col gap-2 py-3">
      <div>
        <div className="text-sm text-stone-200">{label}</div>
        <div className="text-xs text-stone-500">{description}</div>
      </div>
      <fieldset className="grid grid-cols-2 gap-2" aria-label={label}>
        {options.map((set) => {
          const item = SHOP.find((o) => o.id === `${prefix}${set}`);
          const open = set === "classic" || owned.includes(`${prefix}${set}`);
          return (
            <button
              key={set}
              type="button"
              aria-pressed={chosen === set}
              disabled={!open}
              title={open ? undefined : t.soundSetLocked.replace("{n}", String(item?.price ?? "?"))}
              onClick={() => onChoose(set)}
              className={`min-h-11 rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:opacity-50 ${
                chosen === set
                  ? "border-amber-400 bg-amber-400/10 text-amber-200"
                  : "border-stone-700 text-stone-300 hover:border-stone-500"
              }`}
            >
              {!open && (
                <>
                  <Icon name="lock" />{" "}
                </>
              )}
              {names[set]}
            </button>
          );
        })}
      </fieldset>
    </div>
  );
}
