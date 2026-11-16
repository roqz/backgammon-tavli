/**
 * Supporting the project: why (free, no ads, open source), what it costs, what supporters get
 * (cosmetic thanks only) and redeeming a supporter code. Payments run outside the app, on the
 * page the operator links to (docs/SUPPORT.md).
 */
import { type AccountResponse, SUPPORTER_LIFETIME, type SupportInfo } from "@tavli/protocol";
import { type ReactNode, useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { StylePreview } from "../components/Looks";
import { Medallion } from "../components/Medallion";
import { fieldClass } from "../components/Security";
import { Button, Toggle } from "../components/ui";
import { errorOf } from "../errors";
import { type Dict, useT } from "../i18n";
import { fetchAccount, fetchSupportInfo, redeemSupporterCode, setSupporterPublic } from "../online/client";
import { useOnline } from "../online/store";
import { Page, ScreenTitle } from "./AppShell";

const day = (t: Dict, iso: string) =>
  new Date(iso).toLocaleDateString(t.locale, { day: "numeric", month: "long", year: "numeric" });

function Box({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`flex flex-col gap-3 rounded-xl border border-stone-800 bg-stone-900/80 p-5 ${className}`}
    >
      {children}
    </section>
  );
}

export function SupportScreen({ onBack, onOnline }: { onBack: () => void; onOnline: () => void }) {
  const t = useT();
  const profile = useOnline((s) => s.profile);
  const [info, setInfo] = useState<SupportInfo | null>(null);
  const [account, setAccount] = useState<AccountResponse | null>(null);
  useEffect(() => {
    fetchSupportInfo()
      .then(setInfo)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!profile) return;
    fetchAccount()
      .then(setAccount)
      .catch(() => {});
  }, [profile]);
  const status = account?.supporter ?? null;
  const reload = (acc: AccountResponse) => {
    setAccount(acc);
    fetchSupportInfo()
      .then(setInfo)
      .catch(() => {});
  };
  return (
    <Page>
      <ScreenTitle title={t.supportTitle} subtitle={t.supportSub} onBack={onBack} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="flex flex-col gap-6">
          <Box className="border-brass/40">
            <p className="leading-relaxed text-stone-200">{t.supportIntro}</p>
            {info && (
              <ul className="flex flex-col gap-1 text-sm text-stone-400">
                {info.monthlyCost !== null && (
                  <li>{t.supportCosts.replace("{n}", String(info.monthlyCost))}</li>
                )}
                {info.supporters > 0 && (
                  <li>
                    {info.supporters === 1
                      ? t.supportCountOne
                      : t.supportCount.replace("{n}", String(info.supporters))}
                  </li>
                )}
              </ul>
            )}
            {info?.url ? (
              <a
                href={info.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex min-h-12 items-center justify-center gap-2 self-start rounded-xl bg-felt-500 px-6 text-lg font-semibold text-stone-50 hover:bg-felt-400"
                data-testid="support-link"
              >
                <Icon name="heart" /> {t.supportButton} <Icon name="external" />
              </a>
            ) : (
              info && <p className="text-sm text-stone-500">{t.supportNoUrl}</p>
            )}
          </Box>

          <Box>
            <h2 className="font-display text-xl font-semibold text-amber-100">{t.supportPerksTitle}</h2>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <span className="block w-full max-w-56 shrink-0">
                <StylePreview style="patron" />
              </span>
              <ul className="flex flex-col gap-2 text-sm text-stone-200">
                <li className="flex gap-2">
                  <span aria-hidden className="flex w-5 shrink-0 justify-center text-brass">
                    <Icon name="heart" />
                  </span>
                  {t.supportPerkBadge}
                </li>
                <li className="flex gap-2">
                  <span aria-hidden className="flex w-5 shrink-0 justify-center">
                    <Medallion frame="patron" size={20} />
                  </span>
                  {t.supportPerkFrame}
                </li>
                <li className="flex gap-2">
                  <span aria-hidden className="flex w-5 shrink-0 justify-center text-amber-200">
                    <Icon name="palette" />
                  </span>
                  {t.supportPerkBoard}
                </li>
                <li className="flex gap-2">
                  <span aria-hidden className="flex w-5 shrink-0 justify-center text-amber-200">
                    <Icon name="rules" />
                  </span>
                  {t.supportPerkThanks}
                </li>
              </ul>
            </div>
            <p className="text-xs leading-relaxed text-stone-500">{t.supportFair}</p>
          </Box>
        </div>

        <div className="flex flex-col gap-6">
          {status && <StatusCard status={status} onChange={reload} />}
          <RedeemCard hasProfile={!!profile} onOnline={onOnline} onRedeemed={reload} />
          {info && info.names.length > 0 && (
            <Box>
              <h2 className="font-display text-lg font-semibold text-amber-100">{t.supportThanksTitle}</h2>
              <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-stone-300" data-testid="thanks">
                {info.names.map((n, i) => (
                  // names can repeat: the position keeps them apart
                  // biome-ignore lint/suspicious/noArrayIndexKey: names are not unique
                  <li key={`${n}-${i}`}>
                    <Icon name="heart" className="h-[1.15em] w-[1.15em] text-brass" /> {n}
                  </li>
                ))}
              </ul>
            </Box>
          )}
        </div>
      </div>
    </Page>
  );
}

function StatusCard({
  status,
  onChange,
}: {
  status: NonNullable<AccountResponse["supporter"]>;
  onChange: (acc: AccountResponse) => void;
}) {
  const t = useT();
  return (
    <Box className="border-brass/50 bg-brass/5">
      {status.active ? (
        <>
          <h2 className="font-display text-lg font-semibold text-brass">
            <Icon name="heart" /> {t.supportStatusTitle}
          </h2>
          <p className="text-sm text-stone-200">
            {t.supportSince.replace("{date}", day(t, status.since))} ·{" "}
            {status.until === SUPPORTER_LIFETIME
              ? t.supportLifetime
              : t.supportUntil.replace("{date}", day(t, status.until))}
          </p>
          <Toggle
            checked={status.public}
            label={t.supportPublic}
            description={t.supportPublicHint}
            onChange={(v) => {
              setSupporterPublic(v)
                .then(onChange)
                .catch(() => {});
            }}
          />
        </>
      ) : (
        <p className="text-sm text-stone-300">{t.supportExpired.replace("{date}", day(t, status.until))}</p>
      )}
    </Box>
  );
}

function RedeemCard({
  hasProfile,
  onOnline,
  onRedeemed,
}: {
  hasProfile: boolean;
  onOnline: () => void;
  onRedeemed: (acc: AccountResponse) => void;
}) {
  const t = useT();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const ready = code.replace(/[\s-]/g, "").length >= 12;
  const redeem = async () => {
    setBusy(true);
    setMessage(null);
    try {
      onRedeemed(await redeemSupporterCode(code.trim()));
      setCode("");
      setMessage({ ok: true, text: t.supportRedeemed });
    } catch (e) {
      setMessage({ ok: false, text: errorOf(t, e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Box>
      <h2 className="font-display text-lg font-semibold text-amber-100">{t.supportCodeTitle}</h2>
      <p className="text-sm text-stone-400">{t.supportCodeHint}</p>
      {hasProfile ? (
        <>
          <input
            className={`${fieldClass} font-mono tracking-wider`}
            value={code}
            placeholder="SUPP-XXXX-XXXX-XXXX"
            aria-label={t.supportCodeTitle}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={30}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ready && !busy && void redeem()}
          />
          <Button variant="primary" disabled={!ready || busy} onClick={() => void redeem()}>
            {t.supportRedeem}
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-stone-300">{t.supportCodeNeedsProfile}</p>
          <Button className="self-start" onClick={onOnline}>
            {t.createProfile}
          </Button>
        </>
      )}
      {message && (
        <p className={`text-sm ${message.ok ? "text-emerald-300" : "text-red-400"}`}>
          {message.ok && (
            <>
              <Icon name="check" />{" "}
            </>
          )}
          {message.text}
        </p>
      )}
    </Box>
  );
}
