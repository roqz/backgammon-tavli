/**
 * Account security without e-mail: one-time recovery codes (shown once, replace a forgotten
 * password) and two-factor login with an authenticator app (TOTP).
 */
import type { AccountResponse, TwoFactorSetup } from "@tavli/protocol";
import { useEffect, useId, useState } from "react";
import { encode } from "uqr";
import { errorOf } from "../errors";
import { useT } from "../i18n";
import {
  disableTwoFactor,
  enableTwoFactor,
  fetchAccount,
  renewRecoveryCodes,
  setupTwoFactor,
} from "../online/client";
import { useOnline } from "../online/store";
import { Icon } from "./Icon";
import { Button, Modal } from "./ui";

export const fieldClass =
  "rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100 outline-none focus:border-amber-400";

/** A QR code drawn as SVG (dark modules on a light quiet zone, so every camera reads it). */
export function QrCode({ value, label }: { value: string; label: string }) {
  const { size, data } = encode(value, { ecc: "M", border: 2 });
  let path = "";
  data.forEach((row, y) => {
    row.forEach((on, x) => {
      if (on) path += `M${x},${y}h1v1h-1z`;
    });
  });
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      className="h-auto w-44 rounded-lg bg-[#fbf7ec]"
      shapeRendering="crispEdges"
    >
      <path d={path} fill="#17110d" />
    </svg>
  );
}

/** One-time codes; closing needs the confirmation that they are stored. */
export function RecoveryCodesModal({ codes, onClose }: { codes: readonly string[]; onClose: () => void }) {
  const t = useT();
  const user = useOnline((s) => s.profile?.username ?? "");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const checkId = useId();
  const text = [t.recoveryFileTitle.replace("{user}", user), "", ...codes, "", t.recoveryFileHint, ""].join(
    "\n",
  );
  const copy = () => {
    void navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `tavli-recovery-${user || "codes"}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <Modal onClose={() => saved && onClose()}>
      <h2 className="mb-2 font-display text-xl font-semibold text-amber-100">
        <Icon name="key" /> {t.recoveryShowTitle}
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-stone-400">{t.recoveryShowHint}</p>
      <ol
        className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl border border-stone-700 bg-stone-950 p-4 font-mono text-[15px] tracking-wide text-stone-100"
        data-testid="recovery-codes"
      >
        {codes.map((c) => (
          <li key={c} className="select-all">
            {c}
          </li>
        ))}
      </ol>
      <div className="mb-4 flex gap-2">
        <Button className="flex-1 text-sm" onClick={copy}>
          {copied ? (
            t.recoveryCopied
          ) : (
            <>
              <Icon name="copy" /> {t.recoveryCopy}
            </>
          )}
        </Button>
        <Button className="flex-1 text-sm" onClick={download}>
          <Icon name="download" /> {t.recoveryDownload}
        </Button>
      </div>
      <label htmlFor={checkId} className="mb-4 flex items-start gap-3 text-sm text-stone-200">
        <input
          id={checkId}
          type="checkbox"
          className="mt-0.5 h-5 w-5 accent-[#2d6449]"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
        />
        {t.recoverySaved}
      </label>
      <Button variant="primary" className="w-full" disabled={!saved} onClick={onClose}>
        {t.done}
      </Button>
    </Modal>
  );
}

/** Asks for the password (and runs the action with it). */
function PasswordStep({
  submit,
  onCancel,
  label,
  extra,
}: {
  submit: (password: string) => Promise<void>;
  onCancel: () => void;
  label: string;
  extra?: (password: string) => boolean;
}) {
  const t = useT();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      await submit(password);
    } catch (e) {
      setError(errorOf(t, e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm text-stone-400">
        {t.confirmPassword}
        <input
          className={fieldClass}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && password && void go()}
        />
      </label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={onCancel}>
          {t.cancel}
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          disabled={!password || busy || (extra ? !extra(password) : false)}
          onClick={() => void go()}
        >
          {label}
        </Button>
      </div>
    </div>
  );
}

/** Input for a 6-digit app code or a recovery code. */
export function OtpInput({
  value,
  onChange,
  onEnter,
  appOnly = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
  appOnly?: boolean;
}) {
  const t = useT();
  return (
    <label className="flex flex-col gap-1 text-sm text-stone-400">
      {t.otpLabel}
      <input
        className={`${fieldClass} font-mono text-lg tracking-[0.3em]`}
        inputMode={appOnly ? "numeric" : "text"}
        autoComplete="one-time-code"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={appOnly ? 6 : 14}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
      />
      {!appOnly && <span className="text-xs text-stone-500">{t.otpHint}</span>}
    </label>
  );
}

type Step =
  | { kind: "idle" }
  | { kind: "setup-password" }
  | { kind: "setup-scan"; setup: TwoFactorSetup }
  | { kind: "disable" }
  | { kind: "renew" };

/** Two-factor login and recovery codes of an account. */
export function SecurityCard() {
  const t = useT();
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [codes, setCodes] = useState<readonly string[] | null>(null);
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  useEffect(() => {
    fetchAccount()
      .then(setAccount)
      .catch(() => {});
  }, []);
  if (!account?.username) return null;
  const reset = () => {
    setStep({ kind: "idle" });
    setOtp("");
    setError(null);
  };
  const left = account.recoveryCodesLeft;
  const enable = async () => {
    setError(null);
    try {
      setAccount(await enableTwoFactor(otp.trim()));
      reset();
      setInfo(t.twoFactorEnabled);
    } catch (e) {
      setError(errorOf(t, e));
    }
  };
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-stone-800 p-4" data-testid="security">
      <h3 className="font-display text-lg font-semibold text-amber-100">
        <Icon name="key" /> {t.securityTitle}
      </h3>

      {/* two-factor login */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold text-stone-100">{t.twoFactor}</span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${account.twoFactor ? "bg-felt-500 text-stone-50" : "border border-stone-600 text-stone-400"}`}
          >
            {account.twoFactor ? (
              <>
                <Icon name="check" /> {t.stateOn}
              </>
            ) : (
              t.stateOff
            )}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-stone-400">
          {account.twoFactor ? t.twoFactorOn : t.twoFactorOff}
        </p>
        {step.kind === "idle" && (
          <Button
            className="self-start text-sm"
            onClick={() => {
              setInfo(null);
              setStep({ kind: account.twoFactor ? "disable" : "setup-password" });
            }}
          >
            {account.twoFactor ? t.twoFactorDisable : t.twoFactorSetup}
          </Button>
        )}
        {step.kind === "setup-password" && (
          <PasswordStep
            label={t.next}
            onCancel={reset}
            submit={async (pw) => setStep({ kind: "setup-scan", setup: await setupTwoFactor(pw) })}
          />
        )}
        {step.kind === "setup-scan" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-stone-300">
              <span className="mr-1 font-semibold text-amber-200">1.</span>
              {t.twoFactorStep1}
            </p>
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <QrCode value={step.setup.uri} label={t.twoFactorStep1} />
              <div className="flex min-w-0 flex-col gap-2">
                <a
                  href={step.setup.uri}
                  className="self-start rounded-lg border border-stone-700 px-3 py-2 text-sm text-stone-100 hover:border-amber-400"
                >
                  <Icon name="phone" /> {t.twoFactorOpenApp}
                </a>
                <div className="text-xs text-stone-500">{t.twoFactorManual}</div>
                <code className="select-all break-all font-mono text-sm tracking-wider text-stone-200">
                  {step.setup.secret.replace(/(.{4})/g, "$1 ").trim()}
                </code>
              </div>
            </div>
            <p className="text-sm text-stone-300">
              <span className="mr-1 font-semibold text-amber-200">2.</span>
              {t.twoFactorStep2}
            </p>
            <OtpInput appOnly value={otp} onChange={setOtp} onEnter={() => void enable()} />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex gap-2">
              <Button className="flex-1" onClick={reset}>
                {t.cancel}
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                disabled={!/^\d{6}$/.test(otp.trim())}
                onClick={() => void enable()}
              >
                {t.twoFactorEnable}
              </Button>
            </div>
          </div>
        )}
        {step.kind === "disable" && (
          <div className="flex flex-col gap-3">
            <OtpInput value={otp} onChange={setOtp} />
            <PasswordStep
              label={t.twoFactorDisable}
              onCancel={reset}
              extra={() => otp.trim().length >= 6}
              submit={async (pw) => {
                setAccount(await disableTwoFactor(pw, otp.trim()));
                reset();
                setInfo(t.twoFactorDisabled);
              }}
            />
          </div>
        )}
      </div>

      {/* recovery codes */}
      <div className="flex flex-col gap-2 border-t border-stone-800 pt-4">
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold text-stone-100">{t.recoveryTitle}</span>
          <span className="text-xs tabular-nums text-stone-400">
            {t.recoveryLeft.replace("{n}", String(left))}
          </span>
        </div>
        {left === 0 ? (
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            <Icon name="warning" /> {t.recoveryNone}
          </p>
        ) : left <= 3 ? (
          <p className="text-sm text-amber-200">
            <Icon name="warning" /> {t.recoveryLow}
          </p>
        ) : null}
        {step.kind === "renew" ? (
          <PasswordStep
            label={t.recoveryRenew}
            onCancel={reset}
            submit={async (pw) => {
              setCodes(await renewRecoveryCodes(pw));
              reset();
            }}
          />
        ) : (
          step.kind === "idle" && (
            <div className="flex flex-col items-start gap-1">
              <Button
                className="text-sm"
                onClick={() => {
                  setInfo(null);
                  setStep({ kind: "renew" });
                }}
              >
                {t.recoveryRenew}
              </Button>
              {left > 0 && <span className="text-xs text-stone-500">{t.recoveryRenewHint}</span>}
            </div>
          )
        )}
      </div>
      {info && (
        <p className="text-sm text-emerald-300">
          <Icon name="check" /> {info}
        </p>
      )}
      {codes && (
        <RecoveryCodesModal
          codes={codes}
          onClose={() => {
            setCodes(null);
            fetchAccount()
              .then(setAccount)
              .catch(() => {});
          }}
        />
      )}
    </section>
  );
}
