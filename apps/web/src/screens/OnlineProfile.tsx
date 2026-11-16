import { getVariant } from "@tavli/engine";
import {
  type AccuracyReport,
  FRAMES,
  type Frame,
  type MatchAccuracy,
  type MatchDetailResponse,
  type MatchSummary,
  type MatchVariantId,
  OTP_REQUIRED,
  PASSWORD_MIN,
  type ProfileResponse,
  ratingKey,
  SHOWCASE_MAX,
  type Trophy,
  USERNAME_PATTERN,
} from "@tavli/protocol";
import { useEffect, useState } from "react";
import { ACHIEVEMENTS } from "../achievements";
import { AccuracyCard, percent } from "../components/Accuracy";
import { AchievementBadge } from "../components/AchievementBadge";
import { Icon } from "../components/Icon";
import { Medallion, Plaque } from "../components/Medallion";
import { FrameMedallion, PlayerName, titleText } from "../components/PlayerName";
import { OtpInput, RecoveryCodesModal, SecurityCard } from "../components/Security";
import { Sparkline } from "../components/Sparkline";
import { Button, Card, Modal, Toggle } from "../components/ui";
import { errorOf } from "../errors";
import { useT } from "../i18n";
import {
  changePassword,
  claimAccount,
  connect,
  deleteProfile,
  exportData,
  fetchAccount,
  fetchAccuracy,
  fetchMatch,
  fetchProfile,
  login,
  logout,
  logoutOthers,
  recoverAccount,
  register,
  setFrame as setFrameRemote,
  setFriendsCanWatch,
  setListed,
  setShowcase,
  setTitle as setTitleRemote,
} from "../online/client";
import { useOnline } from "../online/store";
import { useOfferedFrames, useUnlocked } from "../rewards";
import type { GameRecord } from "../store/archive";
import { AddFriendButton } from "./FriendsPanel";

const input =
  "rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100 outline-none focus:border-amber-400";

const variantName = (v: MatchVariantId, tavli: string) => (v === "tavli" ? tavli : getVariant(v).name);

/** Converts a server match into replayable game records (one per game). */
export const matchToRecords = (d: MatchDetailResponse, meId: string | undefined): GameRecord[] =>
  d.games.map((g, i) => ({
    id: `${d.id}-${i}`,
    date: d.endedAt,
    variant: g.variant,
    matchLength: d.length,
    players: [
      { name: d.players[0].name, kind: d.players[0].id === meId ? "human" : "remote" },
      { name: d.players[1].name, kind: d.players[1].id === meId ? "human" : "remote" },
    ],
    // A game cut short by a forfeit has no result of its own.
    result: g.result ?? { winner: d.winner, level: 1, cube: 1, points: 0, reason: "resign" },
    history: g.history,
  }));

/** First screen without a profile: start as guest, log in, or recover access with a recovery code. */
export function AuthForm() {
  const t = useT();
  const pendingJoin = useOnline((s) => s.pendingJoin);
  const [mode, setMode] = useState<"guest" | "login" | "recover">("guest");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [otp, setOtp] = useState("");
  /** The server asked for the second factor. */
  const [needOtp, setNeedOtp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      connect();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message === OTP_REQUIRED) setNeedOtp(true);
      else setError(errorOf(t, e));
    } finally {
      setBusy(false);
    }
  };
  const switchTo = (m: typeof mode) => {
    setMode(m);
    setError(null);
    setNeedOtp(false);
    setOtp("");
  };
  const doLogin = () => void run(() => login(username.trim(), password, needOtp ? otp.trim() : undefined));
  const doRecover = () =>
    void run(() => recoverAccount(username.trim(), code.trim(), password, needOtp ? otp.trim() : undefined));
  const loginReady = !!username.trim() && !!password && (!needOtp || otp.trim().length >= 6);
  const recoverReady =
    !!username.trim() &&
    code.replace(/[\s-]/g, "").length === 10 &&
    password.length >= PASSWORD_MIN &&
    (!needOtp || /^\d{6}$/.test(otp.trim()));
  return (
    <Card className="flex flex-col gap-4">
      {pendingJoin && (
        <p className="rounded-lg bg-amber-400/15 px-3 py-2 text-sm text-amber-100">
          <Icon name="mail" /> {t.inviteBanner.replace("{code}", pendingJoin)}
        </p>
      )}
      {mode !== "recover" && (
        <div className="grid grid-cols-2 gap-2">
          {(["guest", "login"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => switchTo(m)}
              className={`rounded-lg border px-3 py-2 text-sm ${
                mode === m
                  ? "border-amber-400 bg-amber-400/15 text-amber-200"
                  : "border-stone-700 text-stone-300"
              }`}
            >
              {m === "guest" ? t.guestStart : t.haveAccount}
            </button>
          ))}
        </div>
      )}
      {mode === "guest" && (
        <>
          <label className="flex flex-col gap-1 text-sm text-stone-400">
            {t.yourName}
            <input
              className={input}
              value={name}
              maxLength={24}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && name.trim() && void run(() => register(name.trim()))}
            />
          </label>
          <p className="text-xs text-stone-500">{t.profileHint}</p>
          <Button
            variant="primary"
            disabled={!name.trim() || busy}
            onClick={() => void run(() => register(name.trim()))}
          >
            {t.createProfile}
          </Button>
        </>
      )}
      {mode === "login" && (
        <>
          <label className="flex flex-col gap-1 text-sm text-stone-400">
            {t.username}
            <input
              className={input}
              value={username}
              autoComplete="username"
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-stone-400">
            {t.password}
            <input
              className={input}
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loginReady && doLogin()}
            />
          </label>
          {needOtp && (
            <>
              <p className="text-sm text-stone-300">
                <Icon name="key" /> {t.errors["2fa code required"]}
              </p>
              <OtpInput value={otp} onChange={setOtp} onEnter={() => loginReady && doLogin()} />
            </>
          )}
          <Button variant="primary" disabled={!loginReady || busy} onClick={doLogin}>
            {t.login}
          </Button>
          <button
            type="button"
            className="self-start text-sm text-stone-400 underline underline-offset-2 hover:text-stone-200"
            onClick={() => switchTo("recover")}
          >
            {t.forgotPassword}
          </button>
        </>
      )}
      {mode === "recover" && (
        <>
          <h2 className="font-display text-lg font-semibold text-amber-100">
            <Icon name="key" /> {t.recoverTitle}
          </h2>
          <p className="text-sm leading-relaxed text-stone-400">{t.recoverHint}</p>
          <label className="flex flex-col gap-1 text-sm text-stone-400">
            {t.username}
            <input
              className={input}
              value={username}
              autoComplete="username"
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-stone-400">
            {t.recoveryCode}
            <input
              className={`${input} font-mono tracking-wider`}
              value={code}
              placeholder="XXXX-XXXX-XX"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={14}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-stone-400">
            {t.newPassword}
            <input
              className={input}
              type="password"
              value={password}
              autoComplete="new-password"
              onChange={(e) => setPassword(e.target.value)}
            />
            <span className="text-xs text-stone-500">{t.passwordRules}</span>
          </label>
          {needOtp && (
            <>
              <p className="text-sm text-stone-300">
                <Icon name="key" /> {t.errors["2fa code required"]}
              </p>
              <OtpInput appOnly value={otp} onChange={setOtp} onEnter={() => recoverReady && doRecover()} />
            </>
          )}
          <Button variant="primary" disabled={!recoverReady || busy} onClick={doRecover}>
            {t.recoverSubmit}
          </Button>
          <button
            type="button"
            className="self-start text-sm text-stone-400 underline underline-offset-2 hover:text-stone-200"
            onClick={() => switchTo("login")}
          >
            <Icon name="back" /> {t.backToLogin}
          </button>
        </>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </Card>
  );
}

/** Account state: secure the guest profile with username/password, or log out. */
/** Avatar frame next to the name; frames need their achievement. */
function FramePicker() {
  const t = useT();
  const unlocked = useUnlocked();
  const frames = useOfferedFrames();
  const [frame, setFrame] = useState<Frame | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetchAccount()
      .then((a) => setFrame(a.frame))
      .catch(() => {});
  }, []);
  if (frame === undefined) return null;
  const choose = (f: Frame | null) => {
    setError(null);
    setFrameRemote(f)
      .then((a) => setFrame(a.frame))
      .catch((e: unknown) => setError(errorOf(t, e)));
  };
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-stone-100">{t.frame}</legend>
      <p className="text-xs text-stone-500">{t.frameHint}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant={frame === null ? "primary" : "ghost"}
          className="px-3 py-1.5 text-sm"
          onClick={() => choose(null)}
        >
          {t.frameNone}
        </Button>
        {frames.map((f) => {
          const open = !!unlocked[FRAMES[f]];
          const a = ACHIEVEMENTS.find((x) => x.id === FRAMES[f]);
          return (
            <Button
              key={f}
              variant={frame === f ? "primary" : "ghost"}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm"
              disabled={!open}
              title={
                open
                  ? undefined
                  : FRAMES[f] === "supporter"
                    ? t.supporterOnly
                    : t.unlockBy.replace(
                        "{name}",
                        a ? `${a.icon} ${a.title[t.locale.startsWith("de") ? "de" : "en"]}` : FRAMES[f],
                      )
              }
              onClick={() => choose(f)}
            >
              {open ? <Medallion frame={f} size={20} /> : <Icon name="lock" />} {t.frameNames[f]}
            </Button>
          );
        })}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </fieldset>
  );
}

/** The title under the name, from the earned ones. */
function TitlePicker() {
  const t = useT();
  const [state, setState] = useState<{ title: string | null; titles: readonly string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetchAccount()
      .then((a) => setState({ title: a.title, titles: a.titles }))
      .catch(() => {});
  }, []);
  if (!state || state.titles.length === 0) return null;
  const choose = (title: string | null) => {
    setError(null);
    setTitleRemote(title)
      .then((a) => setState({ title: a.title, titles: a.titles }))
      .catch((e: unknown) => setError(errorOf(t, e)));
  };
  return (
    <fieldset className="flex flex-col gap-2" data-testid="title-picker">
      <legend className="mb-1 text-stone-100">{t.titleLabel}</legend>
      <p className="text-xs text-stone-500">{t.titleHint}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant={state.title === null ? "primary" : "ghost"}
          className="px-3 py-1.5 text-sm"
          onClick={() => choose(null)}
        >
          {t.titleNone}
        </Button>
        {state.titles.map((id) => (
          <Button
            key={id}
            variant={state.title === id ? "primary" : "ghost"}
            className="px-3 py-1.5 text-sm"
            onClick={() => choose(id)}
          >
            {titleText(t, id)}
          </Button>
        ))}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </fieldset>
  );
}

/** Up to three unlocked achievements on the public profile. */
function ShowcasePicker() {
  const t = useT();
  const unlocked = useUnlocked();
  const lang = t.locale.startsWith("de") ? "de" : "en";
  const [ids, setIds] = useState<readonly string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetchAccount()
      .then((a) => setIds(a.showcase))
      .catch(() => {});
  }, []);
  const open = ACHIEVEMENTS.filter((a) => unlocked[a.id]);
  if (ids === null || open.length === 0) return null;
  const toggle = (id: string) => {
    setError(null);
    if (!ids.includes(id) && ids.length >= SHOWCASE_MAX) return setError(t.showcaseFull);
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    setIds(next);
    setShowcase(next)
      .then((a) => setIds(a.showcase))
      .catch((e: unknown) => {
        setIds(ids);
        setError(errorOf(t, e));
      });
  };
  return (
    <fieldset className="flex flex-col gap-2" data-testid="showcase-picker">
      <legend className="mb-1 text-stone-100">{t.showcaseTitle}</legend>
      <p className="text-xs text-stone-500">{t.showcaseHint}</p>
      <div className="flex flex-wrap gap-2">
        {open.map((a) => (
          <Button
            key={a.id}
            variant={ids.includes(a.id) ? "primary" : "ghost"}
            className="px-3 py-1.5 text-sm"
            aria-pressed={ids.includes(a.id)}
            onClick={() => toggle(a.id)}
          >
            <span className="inline-flex items-center gap-1.5">
              <AchievementBadge a={a} size={20} />
              {a.title[lang]}
            </span>
          </Button>
        ))}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </fieldset>
  );
}

/** Whether one appears in the monthly and activity rankings. */
function ListedToggle() {
  const t = useT();
  const [value, setValue] = useState<boolean | null>(null);
  useEffect(() => {
    fetchAccount()
      .then((a) => setValue(a.listed))
      .catch(() => {});
  }, []);
  if (value === null) return null;
  return (
    <Toggle
      checked={value}
      label={t.listedLabel}
      description={t.listedHint}
      onChange={(v) => {
        setValue(v);
        setListed(v).catch(() => setValue(!v));
      }}
    />
  );
}

/** Whether friends may watch one's private matches (invites, challenges). */
function FriendsCanWatchToggle() {
  const t = useT();
  const [value, setValue] = useState<boolean | null>(null);
  useEffect(() => {
    fetchAccount()
      .then((a) => setValue(a.friendsCanWatch))
      .catch(() => {});
  }, []);
  if (value === null) return null;
  return (
    <Toggle
      checked={value}
      label={t.friendsCanWatch}
      description={t.friendsCanWatchHint}
      onChange={(v) => {
        setValue(v);
        setFriendsCanWatch(v).catch(() => setValue(!v));
      }}
    />
  );
}

/** Data export, logging out other devices and deleting the profile. */
function PrivacyCard() {
  const t = useT();
  const profile = useOnline((s) => s.profile)!;
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await fn();
    } catch (e) {
      setError(errorOf(t, e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="rounded-xl border border-stone-800 p-3 text-sm">
      <summary className="cursor-pointer text-stone-300">
        <Icon name="shield" /> {t.privacyTitle}
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <FramePicker />
        <TitlePicker />
        <ShowcasePicker />
        <FriendsCanWatchToggle />
        <ListedToggle />
        <div>
          <Button disabled={busy} onClick={() => void run(exportData)}>
            <Icon name="download" /> {t.exportData}
          </Button>
          <p className="mt-1 text-xs text-stone-500">{t.exportHint}</p>
        </div>
        {profile.username && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() =>
              void run(async () => setInfo(t.logoutOthersDone.replace("{n}", String(await logoutOthers()))))
            }
          >
            {t.logoutOthers}
          </Button>
        )}
        <div>
          <Button variant="danger" disabled={busy} onClick={() => setDeleting(true)}>
            <Icon name="trash" /> {t.deleteProfile}
          </Button>
          <p className="mt-1 text-xs text-stone-500">{t.deleteHint}</p>
        </div>
        {info && <p className="text-emerald-300">{info}</p>}
        {error && !deleting && <p className="text-red-400">{error}</p>}
      </div>
      {deleting && (
        <Modal onClose={() => setDeleting(false)}>
          <h2 className="mb-2 text-lg font-semibold text-stone-100">{t.deleteConfirm}</h2>
          <p className="mb-3 text-sm text-stone-400">{t.deleteHint}</p>
          {profile.username && (
            <label className="mb-3 flex flex-col gap-1 text-sm text-stone-400">
              {t.deletePasswordPrompt}
              <input
                className={input}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => setDeleting(false)}>
              {t.cancel}
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              disabled={busy || (!!profile.username && password.length === 0)}
              onClick={() => void run(() => deleteProfile(profile.username ? password : undefined))}
            >
              {t.deleteProfile}
            </Button>
          </div>
        </Modal>
      )}
    </details>
  );
}

function AccountCard() {
  const t = useT();
  const profile = useOnline((s) => s.profile)!;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [codes, setCodes] = useState<readonly string[] | null>(null);
  const validName = USERNAME_PATTERN.test(username);
  const validPassword = password.length >= PASSWORD_MIN;

  const secure = async () => {
    setBusy(true);
    setError(null);
    try {
      const acc = await claimAccount(username, password, email.trim());
      setPassword("");
      setCodes(acc.recoveryCodes);
    } catch (e) {
      setError(errorOf(t, e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-lg font-semibold text-stone-100">{profile.name}</div>
          <div className="text-xs text-stone-500">
            {profile.username ? `${t.accountSecured} ${profile.username}` : t.guestProfile}
          </div>
        </div>
        <Button variant="ghost" className="text-sm" onClick={() => setConfirmLogout(true)}>
          {t.logout}
        </Button>
      </div>
      {!profile.username && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4">
          <div className="font-semibold text-amber-200">
            <Icon name="key" /> {t.secureAccount}
          </div>
          <p className="text-sm text-stone-400">{t.secureHint}</p>
          <label className="flex flex-col gap-1 text-sm text-stone-400">
            {t.username}
            <input
              className={input}
              value={username}
              autoComplete="username"
              onChange={(e) => setUsername(e.target.value)}
            />
            <span className={`text-xs ${username && !validName ? "text-red-400" : "text-stone-500"}`}>
              {t.usernameRules}
            </span>
          </label>
          <label className="flex flex-col gap-1 text-sm text-stone-400">
            {t.password}
            <input
              className={input}
              type="password"
              value={password}
              autoComplete="new-password"
              onChange={(e) => setPassword(e.target.value)}
            />
            <span className={`text-xs ${password && !validPassword ? "text-red-400" : "text-stone-500"}`}>
              {t.passwordRules}
            </span>
          </label>
          <label className="flex flex-col gap-1 text-sm text-stone-400">
            {t.emailOptional}
            <input
              className={input}
              type="email"
              value={email}
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button
            variant="primary"
            disabled={!validName || !validPassword || busy}
            onClick={() => void secure()}
          >
            {t.secureAccount}
          </Button>
        </div>
      )}
      {profile.username && <PasswordChange />}
      {profile.username && !codes && <SecurityCard />}
      <PrivacyCard />
      {codes && <RecoveryCodesModal codes={codes} onClose={() => setCodes(null)} />}
      {confirmLogout && (
        <Modal onClose={() => setConfirmLogout(false)}>
          <p className="mb-2 text-stone-100">{t.logout}?</p>
          {!profile.username && (
            <p className="mb-4 text-sm text-amber-300">
              <Icon name="warning" /> {t.logoutGuestWarn}
            </p>
          )}
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => setConfirmLogout(false)}>
              {t.cancel}
            </Button>
            <Button variant="danger" className="flex-1" onClick={() => void logout()}>
              {t.logout}
            </Button>
          </div>
        </Modal>
      )}
    </Card>
  );
}

function PasswordChange() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [state, setState] = useState<{ ok?: boolean; error?: string }>({});
  const submit = async () => {
    setState({});
    try {
      await changePassword(oldPw, newPw);
      setOldPw("");
      setNewPw("");
      setState({ ok: true });
    } catch (e) {
      setState({ error: errorOf(t, e) });
    }
  };
  if (!open) {
    return (
      <button
        type="button"
        className="self-start text-sm text-stone-400 underline"
        onClick={() => setOpen(true)}
      >
        {t.changePassword}
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-stone-800 p-3">
      <label className="flex flex-col gap-1 text-sm text-stone-400">
        {t.currentPassword}
        <input
          className={input}
          type="password"
          autoComplete="current-password"
          value={oldPw}
          onChange={(e) => setOldPw(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-stone-400">
        {t.newPassword}
        <input
          className={input}
          type="password"
          autoComplete="new-password"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
        />
        <span className="text-xs text-stone-500">{t.passwordRules}</span>
      </label>
      {state.error && <p className="text-sm text-red-400">{state.error}</p>}
      {state.ok && (
        <p className="text-sm text-emerald-400">
          <Icon name="check" /> {t.passwordChanged}
        </p>
      )}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => setOpen(false)}>
          {t.cancel}
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          disabled={!oldPw || newPw.length < PASSWORD_MIN}
          onClick={() => void submit()}
        >
          {t.changePassword}
        </Button>
      </div>
    </div>
  );
}

/** Recent matches of a player with a replay button each. */
export function MatchList({
  playerId,
  onReplay,
  accuracy,
}: {
  playerId: string;
  onReplay: (records: GameRecord[]) => void;
  /** The own accuracy per match (only in the own list). */
  accuracy?: readonly MatchAccuracy[];
}) {
  const t = useT();
  const me = useOnline((s) => s.profile?.id);
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchProfile(playerId)
      .then(setProfile)
      .catch((e: unknown) => setError(errorOf(t, e)));
  }, [playerId, t]);

  const open = async (m: MatchSummary) => {
    setLoading(m.id);
    try {
      onReplay(matchToRecords(await fetchMatch(m.id), me ?? playerId));
    } catch (e) {
      setError(errorOf(t, e));
    } finally {
      setLoading(null);
    }
  };

  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!profile) return <p className="text-sm text-stone-500">{t.loading}</p>;
  return (
    <div className="flex flex-col gap-3">
      {profile.ratings.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {profile.ratings.map((r) => (
            <div
              key={ratingKey(r.variant, r.pool)}
              className="rounded-xl border border-stone-800 bg-stone-900 p-3 text-center"
            >
              <div className="text-xl font-bold text-amber-100 tabular-nums">{r.rating}</div>
              <div className="text-xs text-stone-400">
                {variantName(r.variant, t.tavliMatch)}
                {r.pool === "blitz" && (
                  <>
                    {" "}
                    · <Icon name="blitz" /> {t.timeControls.blitz}
                  </>
                )}{" "}
                · {r.wins}/{r.matches}
              </div>
              {profile.history?.[ratingKey(r.variant, r.pool)] && (
                <Sparkline
                  points={profile.history[ratingKey(r.variant, r.pool)]!}
                  label={t.ratingHistory}
                  locale={t.locale}
                />
              )}
            </div>
          ))}
        </div>
      )}
      {profile.recent.length === 0 ? (
        <p className="text-sm text-stone-500">{t.noMatches}</p>
      ) : (
        <ul className="divide-y divide-stone-800">
          {profile.recent.map((m) => {
            const seat = m.players[0].id === playerId ? 0 : 1;
            const opp = m.players[seat === 0 ? 1 : 0];
            const won = m.winner === seat;
            const acc = accuracy?.find((a) => a.matchId === m.id);
            return (
              <li key={m.id} className="flex items-center gap-3 py-2 text-sm">
                <span
                  className={`w-16 shrink-0 rounded px-1.5 py-0.5 text-center text-xs font-semibold ${
                    won ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"
                  }`}
                >
                  {won ? t.won : t.lost}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-stone-200">
                    {t.vs} {opp.name} · {m.score[seat]}:{m.score[seat === 0 ? 1 : 0]}
                  </div>
                  <div className="text-xs text-stone-500">
                    {variantName(m.variant, t.tavliMatch)} ·{" "}
                    {m.length === 0 ? (
                      <>
                        <Icon name="infinity" /> {t.money}
                      </>
                    ) : (
                      m.length
                    )}{" "}
                    · {new Date(m.endedAt).toLocaleDateString(t.locale)}
                    {acc && ` · ${t.accuracyMatch.replace("{n}", percent(acc.agreement))}`}
                  </div>
                </div>
                <Button
                  className="px-3 py-1.5 text-sm"
                  disabled={loading !== null}
                  onClick={() => void open(m)}
                >
                  {loading === m.id ? (
                    "…"
                  ) : (
                    <>
                      <Icon name="play" /> {t.watch}
                    </>
                  )}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function ProfileTab({ onReplay }: { onReplay: (records: GameRecord[]) => void }) {
  const t = useT();
  const profile = useOnline((s) => s.profile);
  const [accuracy, setAccuracy] = useState<AccuracyReport | null>(null);
  const id = profile?.id;
  useEffect(() => {
    if (!id) return;
    fetchAccuracy()
      .then(setAccuracy)
      .catch(() => setAccuracy({ summary: null, before: null, matches: [] }));
  }, [id]);
  if (!profile) return null;
  return (
    <div className="flex flex-col gap-4">
      <AccountCard />
      <AccuracyCard report={accuracy} />
      <Card>
        <h2 className="mb-3 font-semibold text-stone-200">{t.myMatches}</h2>
        <MatchList playerId={profile.id} onReplay={onReplay} accuracy={accuracy?.matches} />
      </Card>
    </div>
  );
}

/** Another player's profile (opened from the leaderboard). */
export function PlayerSheet({
  playerId,
  name,
  onClose,
  onReplay,
}: {
  playerId: string;
  name: string;
  onClose: () => void;
  onReplay: (records: GameRecord[]) => void;
}) {
  const t = useT();
  const lang = t.locale.startsWith("de") ? "de" : "en";
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  useEffect(() => {
    fetchProfile(playerId)
      .then(setProfile)
      .catch(() => {});
  }, [playerId]);
  const month = (m: string) =>
    new Date(`${m}-15T12:00:00Z`).toLocaleDateString(t.locale, { month: "short", year: "numeric" });
  const shown = (profile?.showcase ?? [])
    .map((id) => ACHIEVEMENTS.find((a) => a.id === id))
    .filter((a) => a !== undefined);
  const ratings = (profile?.ratings ?? []).filter((r) => r.matches > 0);
  return (
    <Modal onClose={onClose}>
      <div className="max-h-[80vh] overflow-y-auto" data-testid="player-profile">
        <div className="mb-3 flex items-start gap-3">
          <FrameMedallion frame={profile?.frame ?? null} shine />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-stone-100">
              <PlayerName name={profile?.name ?? name} rank={profile?.rank} supporter={profile?.supporter} />
            </h2>
            {profile?.title ? (
              <p className="text-xs text-brass" data-testid="profile-title">
                {titleText(t, profile.title)}
              </p>
            ) : (
              profile?.frame && <p className="text-xs text-brass">{t.frameNames[profile.frame]}</p>
            )}
            {profile?.since && (
              <p className="text-xs text-stone-500">
                {t.profileSince.replace("{month}", month(profile.since))}
              </p>
            )}
          </div>
          <button type="button" className="text-stone-400" onClick={onClose} aria-label={t.close}>
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        <AddFriendButton playerId={playerId} className="mb-3" />
        {profile?.trophies && profile.trophies.length > 0 && (
          <section className="mb-3" aria-label={t.profileTrophies}>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-400">
              {t.profileTrophies}
            </h3>
            <ul className="flex flex-wrap gap-1.5" data-testid="trophies">
              {profile.trophies.map((x) => (
                <li
                  key={`${x.month}${x.variant}${x.pool ?? ""}`}
                  className="rounded-full border border-brass/40 bg-stone-900 px-2.5 py-0.5 text-xs text-stone-200"
                >
                  <Plaque place={x.place} size={16} /> {trophyText(t, x)}
                  {x.pool === "blitz" && (
                    <>
                      {" "}
                      <Icon name="blitz" />
                    </>
                  )}{" "}
                  · {month(x.month)}
                </li>
              ))}
            </ul>
          </section>
        )}
        {shown.length > 0 && (
          <section className="mb-3" aria-label={t.profileShowcase}>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-400">
              {t.profileShowcase}
            </h3>
            <ul className="grid gap-1.5 sm:grid-cols-3" data-testid="profile-showcase">
              {shown.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-2 rounded-lg border border-stone-800 bg-stone-900/70 px-3 py-2 text-sm"
                >
                  <AchievementBadge a={a} size={28} />
                  <span className="min-w-0 text-stone-100">{a.title[lang]}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {ratings.length > 0 && (
          <section className="mb-3" aria-label={t.profileRatings}>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-400">
              {t.profileRatings}
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ratings.map((r) => (
                <div
                  key={`${r.variant}${r.pool ?? ""}`}
                  className="rounded-lg border border-stone-800 bg-stone-900/70 px-3 py-2 text-center"
                >
                  <div className="text-xl font-bold text-amber-100 tabular-nums">{r.rating}</div>
                  <div className="text-xs text-stone-400">
                    {variantName(r.variant, t.tavliMatch)}
                    {r.pool === "blitz" && (
                      <>
                        {" "}
                        · <Icon name="blitz" label={t.timeControls.blitz} />
                      </>
                    )}{" "}
                    · {r.wins}/{r.matches}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-400">
          {t.profileMatches}
        </h3>
        <MatchList playerId={playerId} onReplay={onReplay} />
      </div>
    </Modal>
  );
}

const trophyText = (t: ReturnType<typeof useT>, x: Trophy) =>
  `${t.trophyPlace.replace("{place}", String(x.place))} ${variantName(x.variant, t.tavliMatch)}`;
