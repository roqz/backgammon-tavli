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
  CORR_HOURS,
  type CorrHours,
  type CorrSeek,
  type CorrView,
  type FriendView,
  MATCH_VARIANTS,
  type MatchVariantId,
} from "@tavli/protocol";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Board } from "../board/Board";
import { HEIGHT, WIDTH } from "../board/geometry";
import { layoutFromBoard } from "../board/layout";
import { SetupLayout } from "../components/Setup";
import { Button, Card, Modal, Segmented } from "../components/ui";
import { Choice, VariantPicker } from "../components/VariantPicker";
import { errorOf } from "../errors";
import { lengthText, useT } from "../i18n";
import {
  abandonCorr,
  answerCorr,
  cancelCorrSeek,
  corrAction,
  corrEmote,
  fetchCorrGame,
  fetchCorrGames,
  fetchCorrSeeks,
  fetchFriends,
  inviteCorr,
  type MatchLength,
  seekCorr,
} from "../online/client";
import { useOnline } from "../online/store";
import { useBoardTheme } from "../rewards";
import { useSettings } from "../store/settings";
import { EmoteButton } from "./GameExtras";
import { Checker } from "./GameScreen";
import {
  ActionArea,
  FitBoard,
  fullscreenSupported,
  IconButton,
  MoreSheet,
  type PhoneAction,
  PhoneStage,
  PlayerBar,
  type PlayerInfo,
  type SheetItem,
  toggleFullscreen,
  useFullscreen,
  usePhoneLayout,
} from "./PhoneGame";
import { RulesDrawer } from "./RulesPanel";
import { SettingsDrawer } from "./SettingsPanel";

type T = ReturnType<typeof useT>;
const variantLabel = (v: MatchVariantId, tavli: string) => (v === "tavli" ? tavli : getVariant(v).name);

/** "2 Tage 4 Std." until the deadline (minutes in the last hour). */
const timeLeft = (t: T, deadline: number | null): string => {
  if (deadline === null) return "";
  const ms = Math.max(0, deadline - Date.now());
  const h = Math.floor(ms / 3_600_000);
  if (h === 0) return t.corrMinutesLeft.replace("{m}", String(Math.ceil(ms / 60_000)));
  return h >= 24
    ? t.corrDaysLeft.replace("{d}", String(Math.floor(h / 24))).replace("{h}", String(h % 24))
    : t.corrHoursLeft.replace("{h}", String(h));
};

/** "8 Std./Zug", "3 T./Zug". */
export const corrPace = (t: T, hours: number): string =>
  hours < 24 ? t.corrHours.replace("{h}", String(hours)) : t.corrDays.replace("{d}", String(hours / 24));

/** Variant, length and time per move, shared by the invitation and the search. */
function CorrSettings({
  variant,
  setVariant,
  length,
  setLength,
  hours,
  setHours,
}: {
  variant: MatchVariantId;
  setVariant: (v: MatchVariantId) => void;
  length: MatchLength;
  setLength: (l: MatchLength) => void;
  hours: CorrHours;
  setHours: (h: CorrHours) => void;
}) {
  const t = useT();
  return (
    <>
      <VariantPicker value={variant} onChange={setVariant} variants={MATCH_VARIANTS} />
      <Choice
        label={t.matchLength}
        value={length}
        onChange={setLength}
        options={([0, 1, 3, 5, 7] as const).map((l) => ({
          value: l,
          label: l === 0 ? t.money : String(l),
        }))}
      />
      <Segmented
        label={t.corrTimePerMove}
        value={hours}
        onChange={setHours}
        options={CORR_HOURS.map((h) => ({ value: h, label: corrPace(t, h) }))}
      />
    </>
  );
}

/** The "Play" screen's correspondence options: search an opponent or invite a friend. */
export function CorrSetup({ onOpen }: { onOpen: (id: string) => void }) {
  const t = useT();
  const [variant, setVariant] = useState<MatchVariantId>("backgammon");
  const [length, setLength] = useState<MatchLength>(3);
  const [hours, setHours] = useState<CorrHours>(24);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const seek = () => {
    setError(null);
    void seekCorr(variant, length, hours)
      .then((r) => (r.game ? onOpen(r.game.id) : setNotice(t.corrSeekWaiting)))
      .catch((e: unknown) => setError(errorOf(t, e)));
  };
  return (
    <SetupLayout
      variant={variant}
      summary={`${variantLabel(variant, t.tavliMatch)} · ${lengthText(t, length)} · ${corrPace(t, hours)}`}
      action={{ label: `🔍 ${t.corrSeek}`, onClick: seek }}
      secondary={<Button onClick={() => setInviting(true)}>♟ {t.corrInviteFriend}</Button>}
    >
      <p className="text-sm text-stone-400">{t.corrSeekHint}</p>
      <CorrSettings
        variant={variant}
        setVariant={setVariant}
        length={length}
        setLength={setLength}
        hours={hours}
        setHours={setHours}
      />
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-emerald-300">
          {notice}
        </p>
      )}
      {inviting && (
        <CorrInvite
          onClose={() => setInviting(false)}
          onSent={() => {
            setInviting(false);
            setNotice(t.corrInviteSentAny);
          }}
        />
      )}
    </SetupLayout>
  );
}

/** Correspondence games: invitations, own turn first, then waiting and finished ones. */
export function CorrPanel({ onOpen }: { onOpen: (id: string) => void }) {
  const t = useT();
  const version = useOnline((s) => s.corrVersion);
  const me = useOnline((s) => s.profile?.id);
  const [list, setList] = useState<CorrView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seeks, setSeeks] = useState<CorrSeek[]>([]);
  const [reload, setReload] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: version and reload re-run the fetch
  useEffect(() => {
    fetchCorrGames()
      .then((l) => {
        setList(l);
        setError(null);
      })
      .catch((e: unknown) => setError(errorOf(t, e)));
    fetchCorrSeeks()
      .then(setSeeks)
      .catch(() => {});
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
      {seeks.length > 0 && (
        <Card>
          <h2 className="mb-1 font-semibold text-stone-300">{t.corrSeeks}</h2>
          <p className="mb-1 text-xs text-stone-500">{t.corrSeekWaiting}</p>
          <ul className="divide-y divide-stone-800">
            {seeks.map((s) => (
              <li key={s.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 text-stone-200">
                  🔍 {variantLabel(s.variant, t.tavliMatch)} · {lengthText(t, s.length)} ·{" "}
                  {corrPace(t, s.hours)}
                </span>
                <Button
                  variant="ghost"
                  className="px-2 py-1 text-sm"
                  onClick={() => void act(() => cancelCorrSeek(s.id))}
                >
                  {t.cancel}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
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
      {list !== null && games.length === 0 && seeks.length === 0 && (
        <Card className="flex flex-col gap-2">
          <p className="text-stone-300">{t.corrNone}</p>
          <p className="text-sm text-stone-400">{t.corrHint}</p>
        </Card>
      )}
    </div>
  );
}

/** Invites a friend to a correspondence game (preselected when opened from the friends list). */
export function CorrInvite({
  onClose,
  onSent,
  friendId,
}: {
  onClose: () => void;
  onSent: () => void;
  friendId?: string;
}) {
  const t = useT();
  const [friends, setFriends] = useState<FriendView[] | null>(null);
  const [friend, setFriend] = useState<string | null>(null);
  const [variant, setVariant] = useState<MatchVariantId>("backgammon");
  const [length, setLength] = useState<MatchLength>(3);
  const [hours, setHours] = useState<CorrHours>(72);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetchFriends()
      .then((l) => {
        const accepted = l.filter((f) => f.status === "accepted");
        setFriends(accepted);
        setFriend(accepted.find((f) => f.id === friendId)?.id ?? accepted[0]?.id ?? null);
      })
      .catch(() => setFriends([]));
  }, [friendId]);
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
          <CorrSettings
            variant={variant}
            setVariant={setVariant}
            length={length}
            setLength={setLength}
            hours={hours}
            setHours={setHours}
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
            void inviteCorr(friend!, variant, length, hours)
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
          {variantLabel(g.variant, t.tavliMatch)} · {lengthText(t, g.length)} · {corrPace(t, g.hours)}
          {g.status === "active" && ` · ⏳ ${timeLeft(t, g.deadline)}`}
          {g.status === "finished" &&
            ` · ${g.winner === null ? t.corrEnded : g.winner === g.seat ? `🏆 ${t.corrWon}` : t.corrLost}`}
          {g.league && ` · 🏟️ ${g.league.name}`}
        </span>
      </button>
      {children}
    </li>
  );
}

/** "vor 3 Std." / "3 hr. ago" in the app language. */
const ago = (t: T, at: number): string => {
  const rtf = new Intl.RelativeTimeFormat(t.locale, { numeric: "auto", style: "short" });
  const min = Math.round((at - Date.now()) / 60_000);
  if (min > -60) return rtf.format(Math.min(min, 0), "minute");
  if (min > -60 * 24) return rtf.format(Math.round(min / 60), "hour");
  return rtf.format(Math.round(min / 60 / 24), "day");
};

/** One correspondence game: the same board layouts as a live game; moves are sent as requests. */
export function CorrGameScreen({ id, onBack }: { id: string; onBack: () => void }) {
  const t = useT();
  const theme = useBoardTheme();
  const settings = useSettings();
  const phone = usePhoneLayout();
  const fullscreen = useFullscreen();
  const version = useOnline((s) => s.corrVersion);
  const [view, setView] = useState<CorrView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resigning, setResigning] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
  const name = (p: Player) => (p === seat ? `${view.players[p].name} (${t.tYou})` : view.players[p].name);
  const canEmote = view.seat !== null && (view.status === "active" || view.status === "finished");
  const emote = canEmote && (
    <EmoteButton
      onSend={(e) =>
        void corrEmote(id, e)
          .then(setView)
          .catch((err: unknown) => setError(errorOf(t, err)))
      }
    />
  );
  const title = `${rules.name} · ${lengthText(t, view.length)} · ${corrPace(t, view.hours)}`;
  const status =
    view.status === "finished"
      ? view.winner === null
        ? `🏁 ${t.corrEnded}`
        : `🏁 ${view.players[view.winner].name} ${t.winsMatch}`
      : mine
        ? `${t.yourTurn} · ⏳ ${timeLeft(t, view.deadline)}`
        : `${t.corrWaitingFor.replace("{name}", view.players[view.toAct ?? 0].name)} · ⏳ ${timeLeft(t, view.deadline)}`;

  const actions: PhoneAction[] = [];
  if (mine && g.phase === "rolling") {
    if (canDouble(g))
      actions.push({
        id: "double",
        label: `${t.double} (${g.cube.value * 2})`,
        onClick: () => void send([{ type: "double" }]),
        disabled: busy,
        variant: "secondary",
      });
    actions.push({
      id: "roll",
      label: t.roll,
      onClick: () => void send([{ type: "roll" }]),
      disabled: busy,
      variant: "primary",
    });
  } else if (mine && g.phase === "moving") {
    actions.push({
      id: "undo",
      label: t.undo,
      icon: "↶",
      onClick: () => void send([{ type: "undo" }]),
      disabled: busy || !canUndo(g),
      variant: "secondary",
    });
    actions.push({
      id: "confirm",
      label: t.confirm,
      onClick: () => void send([{ type: "confirm" }]),
      disabled: busy || !canConfirm(g),
      variant: "primary",
    });
  } else if (mine && g.phase === "cube-offered") {
    actions.push({
      id: "drop",
      label: t.drop,
      onClick: () => void send([{ type: "drop" }]),
      disabled: busy,
      variant: "danger",
    });
    actions.push({
      id: "take",
      label: `${t.take} (${g.cube.value * 2})`,
      onClick: () => void send([{ type: "take" }]),
      disabled: busy,
      variant: "primary",
    });
  }

  const info = (p: Player): PlayerInfo => ({
    name: name(p),
    pips: settings.showPips ? pipCount(rules, g.board, p) : null,
    score: m.score[p],
    active: view.status === "active" && view.toAct === p,
    checker: <Checker player={p} />,
  });
  const bubble = view.emote && (view.emote.seat === seat || settings.showEmotes) && (
    <p
      role="status"
      className={`pointer-events-none absolute inset-x-2 top-2 z-10 mx-auto w-fit max-w-[90%] rounded-2xl px-3 py-1.5 text-sm shadow-lg ${
        view.emote.seat === seat ? "bg-amber-400 text-stone-950" : "bg-stone-100 text-stone-900"
      }`}
    >
      <span className="font-semibold">
        {view.emote.seat === seat ? t.tYou : view.players[view.emote.seat].name}:
      </span>{" "}
      {t.emote[view.emote.id]} <span className="text-xs opacity-60">· {ago(t, view.emote.at)}</span>
    </p>
  );
  const errorLine = error && (
    <p
      role="alert"
      className="pointer-events-none absolute inset-x-2 bottom-2 z-10 mx-auto w-fit rounded-full bg-stone-900/90 px-3 py-1 text-xs text-red-300 shadow-lg"
    >
      ⚠ {error}
    </p>
  );
  const board = (rotated: boolean) => (
    <>
      <Board
        state={g}
        layout={layout}
        theme={theme}
        interactive={mine && g.phase === "moving" && !busy}
        openingDice={null}
        numbersFor={settings.showNumbers ? seat : null}
        viewer={seat}
        onMoves={(chain: Move[]) => void send(chain.map((move) => ({ type: "move", move })))}
        rotated={rotated}
        screenTurned={!!phone?.turned}
        mirrored={settings.homeLeft}
      />
      {bubble}
      {errorLine}
    </>
  );
  const resignDialog = resigning && (
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
  );
  const drawers = (
    <>
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <RulesDrawer open={rulesOpen} onClose={() => setRulesOpen(false)} initial={g.variant} />
    </>
  );

  if (phone) {
    const sideways = phone.kind === "landscape";
    const bottom: Player = seat;
    const top: Player = seat === 0 ? 1 : 0;
    const closeThen = (fn: () => void) => () => {
      setMoreOpen(false);
      fn();
    };
    const items: SheetItem[] = [
      { id: "rules", label: t.rules, icon: "📖", onClick: closeThen(() => setRulesOpen(true)) },
      { id: "settings", label: t.settings, icon: "⚙", onClick: closeThen(() => setSettingsOpen(true)) },
    ];
    if (phone.turned || phone.kind === "portrait")
      items.push({
        id: "turn",
        label: phone.turned ? t.turnAuto : t.turnLandscape,
        icon: "⟳",
        onClick: closeThen(() => settings.update({ gameOrientation: phone.turned ? "auto" : "landscape" })),
      });
    if (fullscreenSupported())
      items.push({
        id: "fullscreen",
        label: fullscreen ? t.exitFullscreen : t.fullscreen,
        icon: "⛶",
        onClick: closeThen(() => void toggleFullscreen(sideways)),
      });
    if (view.status === "active")
      items.push({
        id: "resign",
        label: t.resign,
        icon: "🏳",
        danger: true,
        onClick: closeThen(() => setResigning(true)),
      });
    const back = (
      <IconButton label={t.back} onClick={onBack}>
        ←
      </IconButton>
    );
    const more = (
      <IconButton label={t.more} onClick={() => setMoreOpen(true)}>
        ⋯
      </IconButton>
    );
    const statusLine = <span className={sideways ? "" : "truncate"}>{status}</span>;
    return (
      <PhoneStage turned={phone.turned} sideways={sideways}>
        {sideways ? (
          <div className="flex h-full gap-2 py-2">
            <aside aria-label={title} className="flex w-14 shrink-0 flex-col items-center gap-2">
              {back}
              <PlayerBar card p={info(top)} testId="player-top" />
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center">{emote}</div>
              <PlayerBar card p={info(bottom)} testId="player-bottom" />
              {more}
            </aside>
            <FitBoard ratio={WIDTH / HEIGHT}>{board(false)}</FitBoard>
            <section aria-label={t.game} className="flex w-32 shrink-0 flex-col gap-2">
              <ActionArea actions={actions} status={statusLine} vertical />
            </section>
          </div>
        ) : (
          <div className="flex h-full flex-col gap-2 px-2 pt-2 pb-6">
            <header className="flex shrink-0 items-center gap-2">
              {back}
              <div className="min-w-0 flex-1 text-center leading-tight">
                <div className="truncate text-sm font-semibold text-stone-100">♟ {rules.name}</div>
                <div className="truncate text-xs text-stone-400">
                  {lengthText(t, view.length)} · {corrPace(t, view.hours)}
                </div>
              </div>
              {emote}
              {more}
            </header>
            <PlayerBar p={info(top)} testId="player-top" />
            <FitBoard ratio={HEIGHT / WIDTH}>{board(true)}</FitBoard>
            <PlayerBar p={info(bottom)} testId="player-bottom" />
            <ActionArea actions={actions} status={statusLine} vertical={false} />
          </div>
        )}
        <MoreSheet
          open={moreOpen}
          onClose={() => setMoreOpen(false)}
          side={sideways ? "right" : "bottom"}
          items={items}
        >
          <p className="text-sm text-stone-300">{title}</p>
        </MoreSheet>
        {resignDialog}
        {drawers}
      </PhoneStage>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 p-2 sm:p-4 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-center justify-between gap-2 px-1">
          <Button
            variant="ghost"
            onClick={onBack}
            className="shrink-0 px-3 py-1.5 text-sm"
            aria-label={t.back}
          >
            ← <span className="hidden sm:inline">{t.back}</span>
          </Button>
          <div className="min-w-0 truncate text-center text-xs text-stone-400 sm:text-sm">
            ♟ <span className="font-semibold text-stone-200">{rules.name}</span> ·{" "}
            {lengthText(t, view.length)} · {corrPace(t, view.hours)}
          </div>
          <div className="flex items-center gap-2">
            {emote}
            <Button
              variant="ghost"
              className="px-3 py-1.5 text-lg"
              onClick={() => setRulesOpen(true)}
              aria-label={t.rules}
              title={t.rules}
            >
              📖
            </Button>
            <Button
              variant="ghost"
              className="px-3 py-1.5 text-lg"
              onClick={() => setSettingsOpen(true)}
              aria-label={t.settings}
              title={t.settings}
            >
              ⚙
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 lg:hidden">
          <PlayerBar p={info(0)} />
          <PlayerBar p={info(1)} />
        </div>
        <div className="relative overflow-hidden rounded-2xl shadow-2xl ring-1 ring-black/40">
          {board(false)}
        </div>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
          <p className="text-lg font-medium text-stone-100" aria-live="polite">
            {status}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            {actions.map((a) => (
              <Button
                key={a.id}
                variant={
                  a.variant === "primary" ? "primary" : a.variant === "danger" ? "danger" : "secondary"
                }
                disabled={a.disabled}
                onClick={a.onClick}
              >
                {a.icon && `${a.icon} `}
                {a.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
      <aside className="flex w-full flex-col gap-3 lg:w-72">
        <div className="hidden flex-col gap-2 rounded-2xl border border-stone-800 bg-stone-900/80 p-4 lg:flex">
          <h2 className="text-sm font-medium text-stone-400">{t.score}</h2>
          <PlayerBar p={info(otherSeat(seat))} />
          <PlayerBar p={info(seat)} />
        </div>
        {view.status === "active" && (
          <Button variant="ghost" className="text-sm" onClick={() => setResigning(true)}>
            🏳 {t.resign}
          </Button>
        )}
      </aside>
      {resignDialog}
      {drawers}
    </div>
  );
}

const otherSeat = (seat: Player): Player => (seat === 0 ? 1 : 0);
