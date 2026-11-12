import { getVariant } from "@tavli/engine";
import { type FriendView, type LiveMatch, MATCH_VARIANTS, type MatchVariantId } from "@tavli/protocol";
import { useEffect, useState } from "react";
import { Button, Card, Modal, Segmented } from "../components/ui";
import { errorOf } from "../errors";
import { useT } from "../i18n";
import {
  addFriend,
  answerChallenge,
  cancelChallenge,
  challengeFriend,
  fetchFriends,
  fetchLive,
  friendLink,
  type MatchLength,
  removeFriend,
} from "../online/client";
import { useOnline } from "../online/store";
import { PushToggle, roundName } from "./TournamentPanel";

const REFRESH_MS = 10_000;
const variantLabel = (v: MatchVariantId, tavli: string) => (v === "tavli" ? tavli : getVariant(v).name);

/** Friends with online state, open requests, challenges and the own friend link. */
export function FriendsPanel({ onWatch }: { onWatch: (matchId: string) => void }) {
  const t = useT();
  const version = useOnline((s) => s.friendsVersion);
  const profile = useOnline((s) => s.profile);
  const status = useOnline((s) => s.status);
  const [list, setList] = useState<FriendView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [challenging, setChallenging] = useState<FriendView | null>(null);
  const [reload, setReload] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: version and reload re-run the fetch
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchFriends()
        .then((l) => {
          if (!alive) return;
          setList(l);
          setError(null);
        })
        .catch((e: unknown) => alive && setError(errorOf(t, e)));
    void load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [version, reload]);

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      setReload((n) => n + 1);
    } catch (e) {
      setError(errorOf(t, e));
    }
  };

  const incoming = list?.filter((f) => f.status === "incoming") ?? [];
  const friends = list?.filter((f) => f.status === "accepted") ?? [];
  const outgoing = list?.filter((f) => f.status === "outgoing") ?? [];
  const order = { playing: 0, online: 1, offline: 2 } as const;

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="text-center text-sm text-red-400">
          {error}
        </p>
      )}
      <OutgoingChallenge />
      {incoming.length > 0 && (
        <Card className="flex flex-col gap-2">
          <h2 className="font-semibold text-amber-200">{t.friendRequests}</h2>
          {incoming.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-2">
              <span className="truncate text-stone-100">{f.name}</span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  className="px-3 py-1.5 text-sm"
                  onClick={() => void act(() => removeFriend(f.id))}
                >
                  {t.decline}
                </Button>
                <Button
                  variant="primary"
                  className="px-3 py-1.5 text-sm"
                  onClick={() => void act(() => addFriend(f.id))}
                >
                  {t.accept}
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}
      <Card className="flex flex-col gap-2">
        <h2 className="font-semibold text-stone-200">👥 {t.friends}</h2>
        {list === null && !error && <p className="text-sm text-stone-500">{t.loading}</p>}
        {list !== null && friends.length === 0 && <p className="text-sm text-stone-500">{t.noFriends}</p>}
        <ul className="divide-y divide-stone-800">
          {[...friends]
            .sort((a, b) => order[a.presence ?? "offline"] - order[b.presence ?? "offline"])
            .map((f) => (
              <li key={f.id} className="flex items-center gap-2 py-2">
                <PresenceDot presence={f.presence} />
                <span className="min-w-0 flex-1 truncate text-stone-100">{f.name}</span>
                <span className="text-xs text-stone-500">{t.presence[f.presence ?? "offline"]}</span>
                {f.presence === "playing" && f.matchId && (
                  <Button variant="ghost" className="px-2 py-1 text-sm" onClick={() => onWatch(f.matchId!)}>
                    👁 {t.watch}
                  </Button>
                )}
                {f.presence === "online" && (
                  <Button
                    className="px-2 py-1 text-sm"
                    disabled={status !== "ready"}
                    onClick={() => setChallenging(f)}
                  >
                    ⚔ {t.challenge}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  className="px-2 py-1 text-sm text-stone-500"
                  aria-label={`${t.removeFriend}: ${f.name}`}
                  title={t.removeFriend}
                  onClick={() => void act(() => removeFriend(f.id))}
                >
                  ✕
                </Button>
              </li>
            ))}
        </ul>
        {outgoing.length > 0 && (
          <p className="text-xs text-stone-500">
            {t.requestsSent}: {outgoing.map((f) => f.name).join(", ")}
          </p>
        )}
      </Card>
      {profile && <FriendLinkCard playerId={profile.id} />}
      <Card className="flex flex-col gap-2">
        <p className="text-xs text-stone-500">{t.friendsPushHint}</p>
        <PushToggle />
      </Card>
      {challenging && (
        <ChallengeDialog
          friend={challenging}
          onClose={() => setChallenging(null)}
          onSend={(variant, length) => {
            challengeFriend(challenging.id, variant, length);
            setChallenging(null);
          }}
        />
      )}
    </div>
  );
}

function PresenceDot({ presence }: { presence: FriendView["presence"] }) {
  const color =
    presence === "playing" ? "bg-amber-400" : presence === "online" ? "bg-emerald-400" : "bg-stone-600";
  return <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${color}`} />;
}

/** Share your friend link: whoever opens it can send you a request. */
function FriendLinkCard({ playerId }: { playerId: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const link = friendLink(playerId);
  return (
    <Card className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-stone-300">{t.friendLink}</h2>
      <p className="text-xs text-stone-500">{t.friendLinkHint}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={async () => {
            if (navigator.share) await navigator.share({ title: t.appTitle, url: link }).catch(() => {});
            else
              try {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              } catch {
                setCopied(false);
              }
          }}
        >
          🔗 {copied ? t.copied : t.copyLink}
        </Button>
        <span className="select-all break-all font-mono text-xs text-stone-500">{link}</span>
      </div>
    </Card>
  );
}

function ChallengeDialog({
  friend,
  onClose,
  onSend,
}: {
  friend: FriendView;
  onClose: () => void;
  onSend: (variant: MatchVariantId, length: MatchLength) => void;
}) {
  const t = useT();
  const [variant, setVariant] = useState<MatchVariantId>("backgammon");
  const [length, setLength] = useState<MatchLength>(3);
  return (
    <Modal onClose={onClose}>
      <h2 className="mb-3 text-lg font-semibold text-stone-100">
        ⚔ {t.challenge}: {friend.name}
      </h2>
      <div className="flex flex-col gap-4">
        <Segmented
          label={t.variant}
          value={variant}
          onChange={setVariant}
          options={MATCH_VARIANTS.map((v) => ({ value: v, label: variantLabel(v, t.tavliMatch) }))}
        />
        <Segmented
          label={t.matchLength}
          value={length}
          onChange={setLength}
          options={([1, 3, 5, 7] as const).map((l) => ({ value: l, label: String(l) }))}
        />
        <div className="flex gap-2">
          <Button className="flex-1" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button variant="primary" className="flex-[2]" onClick={() => onSend(variant, length)}>
            {t.sendChallenge}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** State of the own challenge: waiting (with cancel) or why it ended. */
function OutgoingChallenge() {
  const t = useT();
  const outgoing = useOnline((s) => s.outgoing);
  if (!outgoing) return null;
  const waiting = outgoing.status === "sent" || outgoing.status === "notified";
  return (
    <p
      role="status"
      className="flex items-center justify-between gap-2 rounded-lg bg-amber-400/10 px-3 py-2 text-sm text-amber-100"
    >
      <span>{t.challengeStatus[outgoing.status].replace("{name}", outgoing.to.name)}</span>
      <Button variant="ghost" className="px-2 py-1 text-sm" onClick={cancelChallenge}>
        {waiting ? t.cancel : "✕"}
      </Button>
    </p>
  );
}

/** A friend's challenge, shown on every screen until answered. */
export function ChallengePrompt() {
  const t = useT();
  const incoming = useOnline((s) => s.incoming);
  const inMatch = useOnline((s) => s.match !== null && s.match.end === null);
  if (!incoming || inMatch) return null;
  return (
    <Modal onClose={() => answerChallenge(incoming.id, false)}>
      <h2 className="mb-2 text-lg font-semibold text-amber-200">
        ⚔ {t.challengeFrom.replace("{name}", incoming.from.name)}
      </h2>
      <p className="mb-4 text-stone-300">
        {variantLabel(incoming.variant, t.tavliMatch)} · {incoming.length}{" "}
        {incoming.length === 1 ? t.point : t.points} · {incoming.from.rating}
      </p>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => answerChallenge(incoming.id, false)}>
          {t.decline}
        </Button>
        <Button variant="primary" className="flex-[2]" onClick={() => answerChallenge(incoming.id, true)}>
          {t.accept}
        </Button>
      </div>
    </Modal>
  );
}

/** Opened through a friend link: offers to send the request. */
export function FriendLinkPrompt() {
  const t = useT();
  const pending = useOnline((s) => s.pendingFriend);
  const profile = useOnline((s) => s.profile);
  const [result, setResult] = useState<string | null>(null);
  // your own link: nothing to do
  useEffect(() => {
    if (pending && pending === profile?.id) useOnline.getState().set({ pendingFriend: null });
  }, [pending, profile?.id]);
  if (!pending || !profile || pending === profile.id) return null;
  const close = () => {
    useOnline.getState().set({ pendingFriend: null });
    setResult(null);
  };
  return (
    <Modal onClose={close}>
      <h2 className="mb-3 text-lg font-semibold text-stone-100">👥 {t.addFriend}</h2>
      {result ? (
        <>
          <p className="mb-4 text-stone-300">{result}</p>
          <Button variant="primary" className="w-full" onClick={close}>
            OK
          </Button>
        </>
      ) : (
        <>
          <p className="mb-4 text-stone-300">{t.friendLinkPrompt}</p>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={close}>
              {t.cancel}
            </Button>
            <Button
              variant="primary"
              className="flex-[2]"
              onClick={() =>
                void addFriend(pending)
                  .then((r) => setResult(t.friendResult[r.result]))
                  .catch((e: unknown) => setResult(errorOf(t, e)))
              }
            >
              {t.sendRequest}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

/** "Add friend" for a player shown somewhere (leaderboard, opponent). */
export function AddFriendButton({ playerId, className = "" }: { playerId: string; className?: string }) {
  const t = useT();
  const me = useOnline((s) => s.profile?.id);
  const [state, setState] = useState<string | null>(null);
  if (!me || me === playerId) return null;
  return (
    <Button
      variant="ghost"
      className={`text-sm ${className}`}
      disabled={state !== null}
      onClick={() =>
        void addFriend(playerId)
          .then((r) => setState(t.friendResult[r.result]))
          .catch((e: unknown) => setState(errorOf(t, e)))
      }
    >
      {state ?? `👥 ${t.addFriend}`}
    </Button>
  );
}

/** Running public matches to watch. */
export function LivePanel({ onWatch }: { onWatch: (matchId: string) => void }) {
  const t = useT();
  const [list, setList] = useState<LiveMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchLive()
        .then((l) => {
          if (!alive) return;
          setList(l);
          setError(null);
        })
        .catch((e: unknown) => alive && setError(errorOf(t, e)));
    void load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [t]);
  return (
    <Card className="flex flex-col gap-2">
      <h2 className="font-semibold text-stone-200">📺 {t.liveTitle}</h2>
      <p className="text-xs text-stone-500">{t.liveHint}</p>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {list === null && !error && <p className="text-sm text-stone-500">{t.loading}</p>}
      {list?.length === 0 && <p className="text-sm text-stone-500">{t.liveNone}</p>}
      <ul className="divide-y divide-stone-800">
        {list?.map((m) => (
          <li key={m.matchId}>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded px-1 py-2 text-left hover:bg-stone-800/60"
              onClick={() => onWatch(m.matchId)}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-stone-100">
                  {m.players[0].name} ({m.players[0].rating}) – {m.players[1].name} ({m.players[1].rating})
                </span>
                <span className="block text-xs text-stone-500">
                  {variantLabel(m.variant, t.tavliMatch)} · {m.length} {m.length === 1 ? t.point : t.points}
                  {m.tournament &&
                    ` · 🏆 ${m.tournament.name} · ${roundName(t, m.tournament.round, m.tournament.rounds, m.tournament.format)}`}
                  {m.spectators > 0 && ` · 👁 ${m.spectators}`}
                </span>
              </span>
              <span className="font-bold tabular-nums text-stone-200">
                {m.score[0]}:{m.score[1]}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
