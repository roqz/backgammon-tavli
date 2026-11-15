/**
 * First contact: a short welcome on the very first start, and the way in through a friend's
 * invitation link (profile, optionally an account, and the friendship in one go).
 */
import { PASSWORD_MIN, USERNAME_PATTERN } from "@tavli/protocol";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import { errorOf } from "../errors";
import { useT } from "../i18n";
import { claimAccount, connect, fetchInviteInfo, redeemInvite, register } from "../online/client";
import { useOnline } from "../online/store";
import { Logo, PointStrip } from "../screens/AppShell";
import { useSettings } from "../store/settings";
import { fieldClass, RecoveryCodesModal } from "./Security";
import { Button, Modal } from "./ui";

const ONBOARDED = "tavli.onboarded";

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/**
 * Decided once per page load, before any store writes: a browser that has never stored settings
 * and never finished the welcome is new. Returning players never see it.
 */
const FIRST_VISIT = read(ONBOARDED) === null && read("tavli.settings") === null;

export const markOnboarded = () => {
  try {
    localStorage.setItem(ONBOARDED, "1");
  } catch {
    // private mode: the welcome may show again next time, which is fine
  }
};

/** Full-screen card on the walnut ground, like the title screen. */
function Sheet({ children, label }: { children: ReactNode; label: string }) {
  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-stone-950 px-4 py-[max(1.5rem,env(safe-area-inset-top))]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="flex w-full max-w-md flex-col gap-5">{children}</div>
    </motion.div>
  );
}

function Brand() {
  const t = useT();
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <Logo className="h-16 w-16" />
      <p className="font-display text-2xl font-semibold text-stone-50">{t.appTitle}</p>
      <PointStrip className="w-40" />
    </div>
  );
}

function Choice({
  icon,
  title,
  sub,
  onClick,
}: {
  icon: string;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-4 rounded-xl border border-stone-700 bg-stone-900 p-4 text-left transition-colors hover:border-amber-400 focus-visible:border-amber-400"
    >
      <span aria-hidden className="text-3xl">
        {icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="font-semibold text-stone-50">{title}</span>
        <span className="text-sm text-stone-400">{sub}</span>
      </span>
    </button>
  );
}

/** Two steps on the first start: welcome (with language), then where to begin. */
export function FirstStart({
  onTutorial,
  onBot,
  onOnline,
}: {
  onTutorial: () => void;
  onBot: () => void;
  onOnline: () => void;
}) {
  const t = useT();
  const lang = useSettings((s) => s.lang);
  const update = useSettings((s) => s.update);
  const pendingInvite = useOnline((s) => s.pendingInvite);
  const [open, setOpen] = useState(FIRST_VISIT);
  const [step, setStep] = useState(0);
  // arrived through an invitation: that screen welcomes instead
  const show = open && !pendingInvite;
  const finish = (then?: () => void) => {
    markOnboarded();
    setOpen(false);
    then?.();
  };
  return (
    <AnimatePresence>
      {show && (
        <Sheet label={t.onbWelcome}>
          <Brand />
          {step === 0 ? (
            <>
              <div className="text-center">
                <h1 className="mb-2 font-display text-3xl font-semibold text-amber-100">{t.onbWelcome}</h1>
                <p className="leading-relaxed text-stone-300">{t.onbIntro}</p>
              </div>
              <fieldset className="flex items-center justify-center gap-2">
                <legend className="sr-only">{t.onbLang}</legend>
                {(["de", "en"] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={lang === l}
                    onClick={() => update({ lang: l })}
                    className={`rounded-lg border px-4 py-1.5 text-sm ${lang === l ? "border-amber-400 bg-amber-400/15 text-amber-100" : "border-stone-700 text-stone-300"}`}
                  >
                    {l === "de" ? "Deutsch" : "English"}
                  </button>
                ))}
              </fieldset>
              <Button variant="primary" className="w-full py-3 text-lg" onClick={() => setStep(1)}>
                {t.onbStart}
              </Button>
            </>
          ) : (
            <>
              <h1 className="text-center font-display text-2xl font-semibold text-amber-100">
                {t.onbLevelTitle}
              </h1>
              <div className="flex flex-col gap-3">
                <Choice icon="🎓" title={t.onbNew} sub={t.onbNewSub} onClick={() => finish(onTutorial)} />
                <Choice icon="🎲" title={t.onbKnow} sub={t.onbKnowSub} onClick={() => finish(onBot)} />
                <Choice icon="🌐" title={t.onbOnline} sub={t.onbOnlineSub} onClick={() => finish(onOnline)} />
              </div>
              <button
                type="button"
                className="self-center text-sm text-stone-400 underline underline-offset-2 hover:text-stone-200"
                onClick={() => finish()}
              >
                {t.onbLook}
              </button>
            </>
          )}
        </Sheet>
      )}
    </AnimatePresence>
  );
}

/** Inviter's name for the pending invitation (null while loading, "" if the code is invalid). */
const useInviter = (code: string | null): string | null => {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    if (!code) return;
    let alive = true;
    setName(null);
    fetchInviteInfo(code)
      .then((i) => alive && setName(i.name))
      .catch(() => alive && setName(""));
    return () => {
      alive = false;
    };
  }, [code]);
  return name;
};

/**
 * Opened through an invitation link. Without a profile: name (and optionally an account) and the
 * friendship in one step. With a profile: a short question.
 */
export function InviteFlow({ onFriends }: { onFriends: () => void }) {
  const code = useOnline((s) => s.pendingInvite);
  const profile = useOnline((s) => s.profile);
  const inviter = useInviter(code);
  // decided when the link opens: the welcome keeps going while it creates the profile
  const [newcomer] = useState(() => !useOnline.getState().profile);
  if (!code || inviter === null) return null;
  return profile && !newcomer ? (
    <InvitePrompt code={code} inviter={inviter} onFriends={onFriends} />
  ) : (
    <InviteWelcome code={code} inviter={inviter} onFriends={onFriends} />
  );
}

const clearInvite = () => useOnline.getState().set({ pendingInvite: null });

function InviteWelcome({
  code,
  inviter,
  onFriends,
}: {
  code: string;
  inviter: string;
  onFriends: () => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [withAccount, setWithAccount] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<readonly string[] | null>(null);
  const valid = inviter !== "";
  const ready =
    name.trim().length > 0 &&
    (!withAccount || (USERNAME_PATTERN.test(username) && password.length >= PASSWORD_MIN));
  const done = () => {
    clearInvite();
    markOnboarded();
    onFriends();
  };
  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!useOnline.getState().profile) await register(name.trim());
      connect();
      if (valid) await redeemInvite(code);
      if (withAccount) {
        const acc = await claimAccount(username, password, "");
        setCodes(acc.recoveryCodes);
        return; // the codes first, then on
      }
      done();
    } catch (e) {
      setError(errorOf(t, e));
    } finally {
      setBusy(false);
    }
  };
  if (codes) return <RecoveryCodesModal codes={codes} onClose={done} />;
  return (
    <AnimatePresence>
      <Sheet label={valid ? t.inviteWelcomeTitle.replace("{name}", inviter) : t.onbWelcome}>
        <Brand />
        <div className="text-center">
          <h1 className="mb-2 font-display text-3xl font-semibold text-amber-100">
            {valid ? `🤝 ${t.inviteWelcomeTitle.replace("{name}", inviter)}` : t.onbWelcome}
          </h1>
          <p className="leading-relaxed text-stone-300">
            {valid ? t.inviteWelcomeText.replace(/\{name\}/g, inviter) : t.inviteInvalid}
          </p>
        </div>
        <div className="flex flex-col gap-3 rounded-xl border border-stone-800 bg-stone-900 p-4">
          <label className="flex flex-col gap-1 text-sm text-stone-400">
            {t.yourName}
            <input
              className={fieldClass}
              value={name}
              maxLength={24}
              autoComplete="nickname"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ready && !busy && void join()}
            />
          </label>
          <label className="flex items-start gap-3 text-sm text-stone-300">
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5 shrink-0 accent-[#2d6449]"
              checked={withAccount}
              onChange={(e) => setWithAccount(e.target.checked)}
            />
            {t.inviteWithAccount}
          </label>
          {withAccount && (
            <>
              <label className="flex flex-col gap-1 text-sm text-stone-400">
                {t.username}
                <input
                  className={fieldClass}
                  value={username}
                  autoComplete="username"
                  onChange={(e) => setUsername(e.target.value)}
                />
                <span
                  className={`text-xs ${username && !USERNAME_PATTERN.test(username) ? "text-red-400" : "text-stone-500"}`}
                >
                  {t.usernameRules}
                </span>
              </label>
              <label className="flex flex-col gap-1 text-sm text-stone-400">
                {t.password}
                <input
                  className={fieldClass}
                  type="password"
                  value={password}
                  autoComplete="new-password"
                  onChange={(e) => setPassword(e.target.value)}
                />
                <span
                  className={`text-xs ${password && password.length < PASSWORD_MIN ? "text-red-400" : "text-stone-500"}`}
                >
                  {t.passwordRules}
                </span>
              </label>
            </>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button variant="primary" className="py-3" disabled={!ready || busy} onClick={() => void join()}>
            {valid ? t.inviteJoin : t.createProfile}
          </Button>
        </div>
        <button
          type="button"
          className="self-center text-sm text-stone-400 underline underline-offset-2 hover:text-stone-200"
          onClick={() => {
            clearInvite();
            markOnboarded();
          }}
        >
          {t.later}
        </button>
      </Sheet>
    </AnimatePresence>
  );
}

function InvitePrompt({
  code,
  inviter,
  onFriends,
}: {
  code: string;
  inviter: string;
  onFriends: () => void;
}) {
  const t = useT();
  const me = useOnline((s) => s.profile?.id);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (inviter === "") {
    return (
      <Modal onClose={clearInvite}>
        <p className="mb-4 text-stone-300">{t.inviteInvalid}</p>
        <Button className="w-full" onClick={clearInvite}>
          OK
        </Button>
      </Modal>
    );
  }
  const accept = async () => {
    setBusy(true);
    try {
      const r = await redeemInvite(code);
      setResult(t.inviteAccepted.replace("{name}", r.friend.name));
    } catch (e) {
      setResult(errorOf(t, e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal onClose={clearInvite}>
      <h2 className="mb-3 font-display text-xl font-semibold text-amber-100">🤝 {t.friendLink}</h2>
      {result ? (
        <>
          <p className="mb-4 text-stone-300">{result}</p>
          <Button
            variant="primary"
            className="w-full"
            onClick={() => {
              clearInvite();
              onFriends();
            }}
          >
            OK
          </Button>
        </>
      ) : (
        <>
          <p className="mb-4 text-stone-300">{t.invitePrompt.replace("{name}", inviter)}</p>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={clearInvite}>
              {t.later}
            </Button>
            <Button
              variant="primary"
              className="flex-[2]"
              disabled={busy || !me}
              onClick={() => void accept()}
            >
              {t.inviteAccept}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
