import {
  canConfirm,
  canDouble,
  canUndo,
  getVariant,
  type MatchState,
  type Move,
  type Player,
  pipCount,
} from "@tavli/engine";
import {
  CORR_DAYS,
  type CorrView,
  type FriendView,
  MATCH_VARIANTS,
  type MatchVariantId,
} from "@tavli/protocol";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Board } from "../board/Board";
import { layoutFromBoard } from "../board/layout";
import { Button, Card, Modal, Segmented } from "../components/ui";
import { errorOf } from "../errors";
import { lengthText, useT } from "../i18n";
import {
  abandonCorr,
  answerCorr,
  corrAction,
  fetchCorrGame,
  fetchCorrGames,
  fetchFriends,
  inviteCorr,
  type MatchLength,
} from "../online/client";
import { useOnline } from "../online/store";
import { useBoardTheme } from "../rewards";
import { useSettings } from "../store/settings";
import { Checker, usePortraitPhone } from "./GameScreen";

type T = ReturnType<typeof useT>;
const variantLabel = (v: MatchVariantId, tavli: string) => (v === "tavli" ? tavli : getVariant(v).name);

/** "2 Tage 4 Std." until the deadline. */
const timeLeft = (t: T, deadline: number | null): string => {
  if (deadline === null) return "";
  const ms = Math.max(0, deadline - Date.now());
  const h = Math.floor(ms / 3_600_000);
  return h >= 24
    ? t.corrDaysLeft.replace("{d}", String(Math.floor(h / 24))).replace("{h}", String(h % 24))
    : t.corrHoursLeft.replace("{h}", String(h));
};

/** Correspondence games: invitations, own turn first, then waiting and finished ones. */
export function CorrPanel({ onOpen }: { onOpen: (id: string) => void }) {
  const t = useT();
  const version = useOnline((s) => s.corrVersion);
  const me = useOnline((s) => s.profile?.id);
  const [list, setList] = useState<CorrView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [reload, setReload] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: version and reload re-run the fetch
  useEffect(() => {
    fetchCorrGames()
      .then((l) => {
        setList(l);
        setError(null);
      })
      .catch((e: unknown) => setError(errorOf(t, e)));
  }, [version, reload]);

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      setReload((n) => n + 1);
    } catch (e) {
      setError(errorOf(t, e));
    }
  };
  const games = list ?? [];
  const incoming = games.filter((g) => g.status === "invited" && g.createdBy !== me);
  const sent = games.filter((g) => g.status === "invited" && g.createdBy === me);
  const myTurn = games.filter((g) => g.status === "active" && g.toAct === g.seat);
  const waiting = games.filter((g) => g.status === "active" && g.toAct !== g.seat);
  const finished = games.filter((g) => g.status === "finished");

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="text-center text-sm text-red-400">
          {error}
        </p>
      )}
      <Card className="flex flex-col gap-2">
        <p className="text-xs text-stone-500">{t.corrHint}</p>
        <Button variant="primary" onClick={() => setCreating(true)}>
          ♟ {t.corrNew}
        </Button>
      </Card>
      {incoming.length > 0 && (
        <Card>
          <h2 className="mb-1 font-semibold text-amber-200">{t.corrInvitations}</h2>
          <ul className="divide-y divide-stone-800">
            {incoming.map((g) => (
              <CorrRow key={g.id} g={g} onOpen={onOpen}>
                <Button
                  variant="ghost"
                  className="px-2 py-1 text-sm"
                  onClick={() => void act(() => answerCorr(g.id, false))}
                >
                  {t.decline}
                </Button>
                <Button
                  variant="primary"
                  className="px-2 py-1 text-sm"
                  onClick={() =>
                    void act(async () => {
                      const v = await answerCorr(g.id, true);
                      onOpen(v.id);
                    })
                  }
                >
                  {t.accept}
                </Button>
              </CorrRow>
            ))}
          </ul>
        </Card>
      )}
      {[
        [t.corrYourTurn, myTurn],
        [t.corrWaiting, waiting],
        [t.corrFinished, finished],
      ].map(([title, items]) =>
        (items as CorrView[]).length === 0 ? null : (
          <Card key={title as string}>
            <h2 className="mb-1 font-semibold text-stone-200">{title as string}</h2>
            <ul className="divide-y divide-stone-800">
              {(items as CorrView[]).map((g) => (
                <CorrRow key={g.id} g={g} onOpen={onOpen} />
              ))}
            </ul>
          </Card>
        ),
      )}
      {sent.length > 0 && (
        <Card>
          <h2 className="mb-1 font-semibold text-stone-300">{t.corrSent}</h2>
          <ul className="divide-y divide-stone-800">
            {sent.map((g) => (
              <CorrRow key={g.id} g={g} onOpen={onOpen}>
                <Button
                  variant="ghost"
                  className="px-2 py-1 text-sm"
                  onClick={() => void act(() => abandonCorr(g.id))}
                >
                  {t.cancel}
                </Button>
              </CorrRow>
            ))}
          </ul>
        </Card>
      )}
      {list !== null && games.length === 0 && (
        <p className="text-center text-sm text-stone-500">{t.corrNone}</p>
      )}
      {creating && (
        <CorrInvite
          onClose={() => setCreating(false)}
          onSent={() => {
            setCreating(false);
            setReload((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}

function CorrInvite({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const t = useT();
  const [friends, setFriends] = useState<FriendView[] | null>(null);
  const [friend, setFriend] = useState<string | null>(null);
  const [variant, setVariant] = useState<MatchVariantId>("backgammon");
  const [length, setLength] = useState<MatchLength>(3);
  const [days, setDays] = useState<1 | 3 | 7>(3);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetchFriends()
      .then((l) => {
        const accepted = l.filter((f) => f.status === "accepted");
        setFriends(accepted);
        setFriend(accepted[0]?.id ?? null);
      })
      .catch(() => setFriends([]));
  }, []);
  return (
    <Modal onClose={onClose}>
      <h2 className="mb-3 text-lg font-semibold text-stone-100">♟ {t.corrNew}</h2>
      {friends?.length === 0 ? (
        <p className="mb-4 text-sm text-stone-400">{t.corrNeedFriends}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm text-stone-400">
            {t.friends}
            <select
              className="rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100"
              value={friend ?? ""}
              onChange={(e) => setFriend(e.target.value)}
            >
              {friends?.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
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
            options={([0, 1, 3, 5, 7] as const).map((l) => ({
              value: l,
              label: l === 0 ? `💰 ${t.money}` : String(l),
            }))}
          />
          <Segmented
            label={t.corrTimePerMove}
            value={days}
            onChange={setDays}
            options={CORR_DAYS.map((d) => ({ value: d, label: t.corrDays.replace("{d}", String(d)) }))}
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <Button className="flex-1" onClick={onClose}>
          {t.cancel}
        </Button>
        <Button
          variant="primary"
          className="flex-[2]"
          disabled={!friend}
          onClick={() =>
            void inviteCorr(friend!, variant, length, days)
              .then(onSent)
              .catch((e: unknown) => setError(errorOf(t, e)))
          }
        >
          {t.sendRequest}
        </Button>
      </div>
    </Modal>
  );
}

function CorrRow({
  g,
  onOpen,
  children,
}: {
  g: CorrView;
  onOpen: (id: string) => void;
  children?: ReactNode;
}) {
  const t = useT();
  const opponent = g.players[g.seat === 0 ? 1 : 0];
  return (
    <li className="flex items-center gap-2 py-2">
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={() => g.status !== "invited" && onOpen(g.id)}
      >
        <span className="block truncate text-stone-100">
          {opponent.name}
          {g.match && (
            <span className="ml-2 text-sm tabular-nums text-stone-400">
              {g.match.score[g.seat ?? 0]}:{g.match.score[g.seat === 0 ? 1 : 0]}
            </span>
          )}
        </span>
        <span className="block text-xs text-stone-500">
          {variantLabel(g.variant, t.tavliMatch)} · {lengthText(t, g.length)} ·{" "}
          {t.corrDays.replace("{d}", String(g.days))}
          {g.status === "active" && ` · ⏳ ${timeLeft(t, g.deadline)}`}
          {g.status === "finished" && ` · ${g.winner === g.seat ? `🏆 ${t.corrWon}` : t.corrLost}`}
        </span>
      </button>
      {children}
    </li>
  );
}

/** One correspondence game: the board, the player's decisions as requests, the deadline. */
export function CorrGameScreen({ id, onBack }: { id: string; onBack: () => void }) {
  const t = useT();
  const theme = useBoardTheme();
  const settings = useSettings();
  const portrait = usePortraitPhone();
  const version = useOnline((s) => s.corrVersion);
  const [view, setView] = useState<CorrView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resigning, setResigning] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: version re-runs the fetch
  useEffect(() => {
    fetchCorrGame(id)
      .then(setView)
      .catch((e: unknown) => setError(errorOf(t, e)));
  }, [id, version]);

  const send = useCallback(
    async (actions: Parameters<typeof corrAction>[1][]) => {
      setBusy(true);
      setError(null);
      try {
        let v: CorrView | null = null;
        for (const a of actions) v = await corrAction(id, a);
        if (v) setView(v);
      } catch (e) {
        setError(errorOf(t, e));
        fetchCorrGame(id)
          .then(setView)
          .catch(() => {});
      } finally {
        setBusy(false);
      }
    },
    [id, t],
  );

  const m = view?.match as MatchState | null | undefined;
  const layout = useMemo(() => (m ? layoutFromBoard(m.game.board) : null), [m]);
  if (!view || !m || !layout)
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 p-6 text-center">
        <p className="text-stone-400">{error ?? t.loading}</p>
        <Button onClick={onBack}>← {t.back}</Button>
      </div>
    );

  const g = m.game;
  const seat = view.seat ?? 0;
  const mine = view.status === "active" && view.toAct === seat;
  const rules = getVariant(g.variant);
  const name = (p: Player) => view.players[p].name;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 p-2 sm:p-4">
      <div className="flex items-center justify-between gap-2 px-1">
        <Button variant="ghost" onClick={onBack} className="px-3 py-1.5 text-sm" aria-label={t.back}>
          ← <span className="hidden sm:inline">{t.back}</span>
        </Button>
        <div className="min-w-0 truncate text-center text-xs text-stone-400 sm:text-sm">
          ♟ <span className="font-semibold text-stone-200">{rules.name}</span> · {lengthText(t, view.length)}{" "}
          · {t.corrDays.replace("{d}", String(view.days))}
        </div>
        {view.status === "active" ? (
          <Button
            variant="ghost"
            className="px-3 py-1.5 text-lg"
            onClick={() => setResigning(true)}
            aria-label={t.resign}
          >
            🏳
          </Button>
        ) : (
          <span className="w-10" />
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        {([0, 1] as Player[]).map((p) => (
          <div
            key={p}
            className={`flex items-center gap-2 rounded-lg border px-2 py-1 ${view.toAct === p ? "border-amber-400/60 bg-amber-400/10" : "border-stone-800 bg-stone-900/70"}`}
          >
            <Checker player={p} />
            <span className="min-w-0 flex-1 truncate text-stone-100">
              {name(p)}
              {p === seat && ` (${t.tYou})`}
            </span>
            {settings.showPips && (
              <span className="text-xs text-stone-500">{pipCount(rules, g.board, p)}</span>
            )}
            <span className="text-base font-bold tabular-nums">{m.score[p]}</span>
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl shadow-2xl ring-1 ring-black/40">
        <Board
          state={g}
          layout={layout}
          theme={theme}
          interactive={mine && g.phase === "moving" && !busy}
          openingDice={null}
          numbersFor={settings.showNumbers ? seat : null}
          viewer={seat}
          onMoves={(chain: Move[]) => void send(chain.map((move) => ({ type: "move", move })))}
          rotated={portrait}
          mirrored={settings.homeLeft}
        />
      </div>
      <p className="text-center text-sm text-stone-300" aria-live="polite">
        {view.status === "finished"
          ? `🏁 ${name(view.winner ?? 0)} ${t.winsMatch}`
          : mine
            ? `${t.yourTurn} · ⏳ ${timeLeft(t, view.deadline)}`
            : `${t.corrWaitingFor.replace("{name}", name(view.toAct ?? 0))} · ⏳ ${timeLeft(t, view.deadline)}`}
      </p>
      {error && (
        <p role="alert" className="text-center text-sm text-red-400">
          {error}
        </p>
      )}
      {mine && (
        <div className="flex flex-wrap justify-center gap-2">
          {g.phase === "rolling" && (
            <>
              {canDouble(g) && (
                <Button disabled={busy} onClick={() => void send([{ type: "double" }])}>
                  {t.double} ({g.cube.value * 2})
                </Button>
              )}
              <Button variant="primary" disabled={busy} onClick={() => void send([{ type: "roll" }])}>
                {t.roll}
              </Button>
            </>
          )}
          {g.phase === "moving" && (
            <>
              <Button disabled={busy || !canUndo(g)} onClick={() => void send([{ type: "undo" }])}>
                ↶ {t.undo}
              </Button>
              <Button
                variant="primary"
                disabled={busy || !canConfirm(g)}
                onClick={() => void send([{ type: "confirm" }])}
              >
                {t.confirm}
              </Button>
            </>
          )}
          {g.phase === "cube-offered" && (
            <>
              <Button variant="danger" disabled={busy} onClick={() => void send([{ type: "drop" }])}>
                {t.drop}
              </Button>
              <Button variant="primary" disabled={busy} onClick={() => void send([{ type: "take" }])}>
                {t.take} ({g.cube.value * 2})
              </Button>
            </>
          )}
        </div>
      )}
      {resigning && (
        <Modal onClose={() => setResigning(false)}>
          <p className="mb-4 text-stone-100">{t.corrResignConfirm}</p>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => setResigning(false)}>
              {t.cancel}
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={() => {
                setResigning(false);
                void abandonCorr(id).then(setView);
              }}
            >
              🏳 {t.resign}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
