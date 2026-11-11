import { getVariant } from "@tavli/engine";
import {
  type MatchDetailResponse,
  type MatchSummary,
  type MatchVariantId,
  PASSWORD_MIN,
  type ProfileResponse,
  USERNAME_PATTERN,
} from "@tavli/protocol";
import { useEffect, useState } from "react";
import { Button, Card, Modal } from "../components/ui";
import { useT } from "../i18n";
import {
  changePassword,
  claimAccount,
  connect,
  fetchMatch,
  fetchProfile,
  login,
  logout,
  register,
} from "../online/client";
import { useOnline } from "../online/store";
import type { GameRecord } from "../store/archive";

const input =
  "rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100 outline-none focus:border-amber-400";

const variantName = (v: MatchVariantId, tavli: string) => (v === "tavli" ? tavli : getVariant(v).name);

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

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

/** First screen without a profile: start as guest or log in with an existing account. */
export function AuthForm() {
  const t = useT();
  const [mode, setMode] = useState<"guest" | "login">("guest");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      connect();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        {(["guest", "login"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
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
      {mode === "guest" ? (
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
      ) : (
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
              onKeyDown={(e) => e.key === "Enter" && void run(() => login(username.trim(), password))}
            />
          </label>
          <Button
            variant="primary"
            disabled={!username.trim() || !password || busy}
            onClick={() => void run(() => login(username.trim(), password))}
          >
            {t.login}
          </Button>
        </>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </Card>
  );
}

/** Account state: secure the guest profile with username/password, or log out. */
function AccountCard() {
  const t = useT();
  const profile = useOnline((s) => s.profile)!;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const validName = USERNAME_PATTERN.test(username);
  const validPassword = password.length >= PASSWORD_MIN;

  const secure = async () => {
    setBusy(true);
    setError(null);
    try {
      await claimAccount(username, password, email.trim());
      setPassword("");
    } catch (e) {
      setError(errorText(e));
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
          <div className="font-semibold text-amber-200">🔐 {t.secureAccount}</div>
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
      {confirmLogout && (
        <Modal onClose={() => setConfirmLogout(false)}>
          <p className="mb-2 text-stone-100">{t.logout}?</p>
          {!profile.username && <p className="mb-4 text-sm text-amber-300">⚠ {t.logoutGuestWarn}</p>}
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
      setState({ error: errorText(e) });
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
      {state.ok && <p className="text-sm text-emerald-400">✓ {t.passwordChanged}</p>}
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
}: {
  playerId: string;
  onReplay: (records: GameRecord[]) => void;
}) {
  const t = useT();
  const me = useOnline((s) => s.profile?.id);
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchProfile(playerId)
      .then(setProfile)
      .catch((e: unknown) => setError(errorText(e)));
  }, [playerId]);

  const open = async (m: MatchSummary) => {
    setLoading(m.id);
    try {
      onReplay(matchToRecords(await fetchMatch(m.id), me ?? playerId));
    } catch (e) {
      setError(errorText(e));
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
            <div key={r.variant} className="rounded-xl border border-stone-800 bg-stone-900 p-3 text-center">
              <div className="text-xl font-bold text-amber-100 tabular-nums">{r.rating}</div>
              <div className="text-xs text-stone-400">
                {variantName(r.variant, t.tavliMatch)} · {r.wins}/{r.matches}
              </div>
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
                    {variantName(m.variant, t.tavliMatch)} · {m.length} ·{" "}
                    {new Date(m.endedAt).toLocaleDateString()}
                  </div>
                </div>
                <Button
                  className="px-3 py-1.5 text-sm"
                  disabled={loading !== null}
                  onClick={() => void open(m)}
                >
                  {loading === m.id ? "…" : `▶ ${t.watch}`}
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
  if (!profile) return null;
  return (
    <div className="flex flex-col gap-4">
      <AccountCard />
      <Card>
        <h2 className="mb-3 font-semibold text-stone-200">{t.myMatches}</h2>
        <MatchList playerId={profile.id} onReplay={onReplay} />
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
  return (
    <Modal onClose={onClose}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-stone-100">👤 {name}</h2>
        <button type="button" className="text-stone-400" onClick={onClose} aria-label="close">
          ✕
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto">
        <MatchList playerId={playerId} onReplay={onReplay} />
      </div>
    </Modal>
  );
}
