import { getVariant } from "@tavli/engine";
import {
  CLUB_NAME_MAX,
  type ClubSummary,
  type ClubView,
  CORR_DAYS,
  LEAGUE_DIVISION_MIN,
  LEAGUE_DIVISIONS,
  LEAGUE_MODES,
  LEAGUE_WEEKS,
  type LeagueMode,
  type LeagueView,
  MATCH_VARIANTS,
  type MatchVariantId,
  type TimeControl,
  type TournamentView,
} from "@tavli/protocol";
import { useEffect, useState } from "react";
import { PlayerName } from "../components/PlayerName";
import { TimeControlPicker } from "../components/TimeControlPicker";
import { Button, Card, Modal, Segmented, Toggle } from "../components/ui";
import { errorOf } from "../errors";
import { lengthText, useT } from "../i18n";
import {
  challengeFriend,
  createClub,
  createLeague,
  fetchClub,
  fetchClubs,
  fetchLeague,
  joinClub,
  joinTournament,
  leagueAction,
  leaveClub,
  type MatchLength,
  manageMember,
} from "../online/client";
import { useOnline } from "../online/store";
import { OutgoingChallenge } from "./FriendsPanel";
import { CreateForm } from "./TournamentPanel";

type T = ReturnType<typeof useT>;
const variantLabel = (v: MatchVariantId, tavli: string) => (v === "tavli" ? tavli : getVariant(v).name);
const input =
  "rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100 outline-none focus:border-amber-400";

/** Clubs: own clubs and search, a club's members and leagues, a league's table and pairings. */
export function ClubsPanel({ onCorr }: { onCorr: (id: string) => void }) {
  const [club, setClub] = useState<string | null>(null);
  const [league, setLeague] = useState<string | null>(null);
  if (league)
    return (
      <LeaguePage
        key={league}
        id={league}
        onBack={() => setLeague(null)}
        onLeague={setLeague}
        onCorr={onCorr}
      />
    );
  if (club) return <ClubPage id={club} onBack={() => setClub(null)} onLeague={setLeague} />;
  return <ClubList onOpen={setClub} />;
}

function ClubList({ onOpen }: { onOpen: (id: string) => void }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [list, setList] = useState<ClubSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const id = setTimeout(
      () =>
        fetchClubs(query)
          .then((l) => {
            setList(l);
            setError(null);
          })
          .catch((e: unknown) => setError(errorOf(t, e))),
      query ? 300 : 0,
    );
    return () => clearTimeout(id);
  }, [query, t]);

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <p className="text-xs text-stone-500">{t.clubsHint}</p>
        <div className="flex gap-2">
          <input
            className={`${input} min-w-0 flex-1`}
            placeholder={t.clubSearch}
            aria-label={t.clubSearch}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Button variant="primary" onClick={() => setCreating(true)}>
            ＋ {t.clubCreate}
          </Button>
        </div>
      </Card>
      {error && (
        <p role="alert" className="text-center text-sm text-red-400">
          {error}
        </p>
      )}
      <Card>
        <h2 className="mb-1 font-semibold text-stone-200">{query ? t.clubResults : t.clubMine}</h2>
        {list === null && !error && <p className="text-sm text-stone-500">{t.loading}</p>}
        {list?.length === 0 && (
          <p className="text-sm text-stone-500">{query ? t.clubNoneFound : t.clubNone}</p>
        )}
        <ul className="divide-y divide-stone-800">
          {list?.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded px-1 py-2 text-left hover:bg-stone-800/60"
                onClick={() => onOpen(c.id)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-stone-100">
                    {c.open ? "🏛" : "🔒"} {c.name}
                  </span>
                  <span className="block truncate text-xs text-stone-500">{c.description || "–"}</span>
                </span>
                <span className="text-xs text-stone-400">
                  👥 {c.members}
                  {c.myRole && ` · ${t.clubRoles[c.myRole]}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      {creating && (
        <CreateClub
          onClose={() => setCreating(false)}
          onCreated={(c) => {
            setCreating(false);
            onOpen(c.id);
          }}
        />
      )}
    </div>
  );
}

function CreateClub({ onClose, onCreated }: { onClose: () => void; onCreated: (c: ClubView) => void }) {
  const t = useT();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [open, setOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal onClose={onClose}>
      <h2 className="mb-3 text-lg font-semibold text-stone-100">🏛 {t.clubCreate}</h2>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm text-stone-400">
          {t.tName}
          <input
            className={input}
            maxLength={CLUB_NAME_MAX}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-stone-400">
          {t.clubDescription}
          <textarea
            className={input}
            maxLength={300}
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <Toggle label={t.clubOpen} description={t.clubOpenHint} checked={open} onChange={setOpen} />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-2">
          <Button className="flex-1" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button
            variant="primary"
            className="flex-[2]"
            disabled={name.trim().length < 3}
            onClick={() =>
              void createClub(name.trim(), description.trim(), open)
                .then(onCreated)
                .catch((e: unknown) => setError(errorOf(t, e)))
            }
          >
            {t.clubCreate}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ClubPage({
  id,
  onBack,
  onLeague,
}: {
  id: string;
  onBack: () => void;
  onLeague: (id: string) => void;
}) {
  const t = useT();
  const me = useOnline((s) => s.profile?.id);
  const status = useOnline((s) => s.status);
  const [club, setClub] = useState<ClubView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [creatingTournament, setCreatingTournament] = useState(false);
  const [reload, setReload] = useState(0);
  // tournament changes arrive over the connection: reload the club with them
  const pushed = useOnline((s) => s.tournaments);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reload and pushed re-run the fetch
  useEffect(() => {
    fetchClub(id)
      .then(setClub)
      .catch((e: unknown) => setError(errorOf(t, e)));
  }, [id, reload, pushed]);

  const act = (fn: () => Promise<unknown>) =>
    void fn()
      .then(() => setReload((n) => n + 1))
      .catch((e: unknown) => setError(errorOf(t, e)));

  if (!club) return <Back onBack={onBack} text={error ?? t.loading} />;
  const admin = club.myRole === "owner" || club.myRole === "admin";
  const member = club.myRole !== null && club.myRole !== "pending";
  const order = { owner: 0, admin: 1, member: 2, pending: 3 } as const;

  return (
    <div className="flex flex-col gap-4">
      <Button variant="ghost" className="self-start px-3 py-1.5 text-sm" onClick={onBack}>
        ← {t.back}
      </Button>
      <Card className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-amber-100">
          {club.open ? "🏛" : "🔒"} {club.name}
        </h2>
        {club.description && <p className="whitespace-pre-line text-sm text-stone-300">{club.description}</p>}
        <p className="text-xs text-stone-500">
          👥 {club.members} · {club.open ? t.clubOpen : t.clubClosed}
          {club.myRole && ` · ${t.clubRoles[club.myRole]}`}
        </p>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex flex-wrap gap-2">
          {!club.myRole && (
            <Button variant="primary" onClick={() => act(() => joinClub(id))}>
              {club.open ? t.clubJoin : t.clubRequest}
            </Button>
          )}
          {club.myRole && (
            <Button variant="ghost" className="text-red-300" onClick={() => act(() => leaveClub(id))}>
              {club.myRole === "pending" ? t.cancel : t.clubLeave}
            </Button>
          )}
        </div>
      </Card>

      {member && (
        <Card className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-stone-200">🏟️ {t.leagues}</h3>
            {admin && (
              <Button className="px-3 py-1.5 text-sm" onClick={() => setCreating(true)}>
                ＋ {t.leagueCreate}
              </Button>
            )}
          </div>
          {club.leagues.length === 0 && <p className="text-sm text-stone-500">{t.leagueNone}</p>}
          <ul className="divide-y divide-stone-800">
            {club.leagues.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded px-1 py-2 text-left hover:bg-stone-800/60"
                  onClick={() => onLeague(l.id)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-stone-100">{l.name}</span>
                    <span className="block text-xs text-stone-500">
                      {variantLabel(l.variant, t.tavliMatch)} · {lengthText(t, l.length)} ·{" "}
                      {t.leagueModes[l.mode]} · 👥 {l.players}
                      {l.divisions > 1 && ` · ${l.divisions} ${t.leagueDivisions}`}
                      {l.winner && ` · 🥇 ${l.winner.name}`}
                    </span>
                  </span>
                  <span className="text-xs text-stone-400">{t.leagueStatus[l.status]}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {member && (
        <ClubTournaments
          tournaments={club.tournaments}
          admin={admin}
          onCreate={() => setCreatingTournament(true)}
        />
      )}

      <Card className="flex flex-col gap-1">
        <h3 className="mb-1 font-semibold text-stone-200">👥 {t.clubMembers}</h3>
        <ul className="divide-y divide-stone-800">
          {[...club.memberList]
            .sort((a, b) => order[a.role] - order[b.role])
            .map((m) => (
              <li key={m.player.id} className="flex items-center gap-2 py-1.5 text-sm">
                {m.presence && (
                  <span
                    aria-hidden
                    className={`h-2 w-2 rounded-full ${m.presence === "playing" ? "bg-amber-400" : m.presence === "online" ? "bg-emerald-400" : "bg-stone-600"}`}
                  />
                )}
                <PlayerName
                  className="min-w-0 flex-1 text-stone-100"
                  name={m.player.name}
                  frame={m.player.frame}
                />
                <span className="text-xs text-stone-500">
                  {m.player.rating} · {t.clubRoles[m.role]}
                </span>
                {admin && m.player.id !== me && m.role !== "owner" && (
                  <MemberActions
                    t={t}
                    role={m.role}
                    owner={club.myRole === "owner"}
                    onAction={(a) => act(() => manageMember(id, m.player.id, a))}
                  />
                )}
              </li>
            ))}
        </ul>
      </Card>
      {creating && (
        <CreateLeague
          clubId={id}
          onClose={() => setCreating(false)}
          onCreated={(l) => {
            setCreating(false);
            onLeague(l.id);
          }}
        />
      )}
      {creatingTournament && (
        <Modal onClose={() => setCreatingTournament(false)}>
          <h2 className="mb-3 text-lg font-semibold text-stone-100">🏆 {t.clubTournamentCreate}</h2>
          <CreateForm clubId={id} onDone={() => setCreatingTournament(false)} disabled={status !== "ready"} />
        </Modal>
      )}
    </div>
  );
}

/** A club's tournaments: join here, the bracket is in the Tournaments tab. */
function ClubTournaments({
  tournaments,
  admin,
  onCreate,
}: {
  tournaments: readonly TournamentView[];
  admin: boolean;
  onCreate: () => void;
}) {
  const t = useT();
  const me = useOnline((s) => s.profile?.id);
  const status = useOnline((s) => s.status);
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-stone-200">🏆 {t.clubTournaments}</h3>
        {admin && (
          <Button className="px-3 py-1.5 text-sm" disabled={status !== "ready"} onClick={onCreate}>
            ＋ {t.clubTournamentCreate}
          </Button>
        )}
      </div>
      <p className="text-xs text-stone-500">{t.clubTournamentHint}</p>
      {tournaments.length === 0 && <p className="text-sm text-stone-500">{t.clubTournamentNone}</p>}
      <ul className="divide-y divide-stone-800">
        {tournaments.map((x) => {
          const entered = !!me && x.players.some((p) => p.id === me);
          const winner = x.players.find((p) => p.id === x.winner);
          return (
            <li key={x.id} className="flex items-center gap-2 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-stone-100">{x.name}</span>
                <span className="block text-xs text-stone-500">
                  {t.tFormats[x.format]} · {variantLabel(x.variant, t.tavliMatch)} · {lengthText(t, x.length)}{" "}
                  · {t.tPlayers.replace("{n}", String(x.players.length)).replace("{size}", String(x.size))}
                  {winner && ` · 🥇 ${winner.name}`}
                </span>
              </span>
              {x.status === "open" && !entered ? (
                <Button
                  className="px-3 py-1 text-sm"
                  disabled={status !== "ready"}
                  onClick={() => joinTournament(x.id)}
                >
                  {t.tJoin}
                </Button>
              ) : (
                <span className="text-xs text-stone-400">{t.tStatus[x.status]}</span>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function MemberActions({
  t,
  role,
  owner,
  onAction,
}: {
  t: T;
  role: ClubView["memberList"][number]["role"];
  owner: boolean;
  onAction: (a: "approve" | "remove" | "promote" | "demote") => void;
}) {
  return (
    <span className="flex gap-1">
      {role === "pending" && (
        <Button className="px-2 py-1 text-xs" onClick={() => onAction("approve")}>
          {t.accept}
        </Button>
      )}
      {owner && role === "member" && (
        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onAction("promote")}>
          ⬆ {t.clubRoles.admin}
        </Button>
      )}
      {owner && role === "admin" && (
        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onAction("demote")}>
          ⬇ {t.clubRoles.member}
        </Button>
      )}
      <Button
        variant="ghost"
        className="px-2 py-1 text-xs text-red-300"
        aria-label={t.clubRemove}
        title={t.clubRemove}
        onClick={() => onAction("remove")}
      >
        ✕
      </Button>
    </span>
  );
}

function CreateLeague({
  clubId,
  onClose,
  onCreated,
}: {
  clubId: string;
  onClose: () => void;
  onCreated: (l: LeagueView) => void;
}) {
  const t = useT();
  const [name, setName] = useState(t.leagueDefaultName);
  const [variant, setVariant] = useState<MatchVariantId>("backgammon");
  const [length, setLength] = useState<Exclude<MatchLength, 0>>(3);
  const [weeks, setWeeks] = useState<(typeof LEAGUE_WEEKS)[number]>(4);
  const [mode, setMode] = useState<LeagueMode>("live");
  const [days, setDays] = useState<(typeof CORR_DAYS)[number]>(3);
  const [divisions, setDivisions] = useState<(typeof LEAGUE_DIVISIONS)[number]>(1);
  const [clock, setClock] = useState<TimeControl>("relaxed");
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal onClose={onClose}>
      <h2 className="mb-3 text-lg font-semibold text-stone-100">🏟️ {t.leagueCreate}</h2>
      <div className="flex flex-col gap-4">
        <p className="text-xs text-stone-500">{t.leagueHint}</p>
        <Segmented
          label={t.leagueMode}
          value={mode}
          onChange={setMode}
          options={LEAGUE_MODES.map((m) => ({ value: m, label: t.leagueModes[m] }))}
        />
        <p className="-mt-2 text-xs text-stone-500">{t.leagueModeHint[mode]}</p>
        {mode === "corr" && (
          <Segmented
            label={t.leagueDays}
            value={days}
            onChange={setDays}
            options={CORR_DAYS.map((d) => ({ value: d, label: t.corrDays.replace("{d}", String(d)) }))}
          />
        )}
        <label className="flex flex-col gap-1 text-sm text-stone-400">
          {t.tName}
          <input
            className={input}
            maxLength={CLUB_NAME_MAX}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
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
          options={([1, 3, 5, 7] as const).map((l) => ({ value: l, label: String(l) }))}
        />
        <Segmented
          label={t.leagueDuration}
          value={weeks}
          onChange={setWeeks}
          options={LEAGUE_WEEKS.map((w) => ({
            value: w,
            label: t.leagueWeeks.replace("{n}", String(w)),
          }))}
        />
        <Segmented
          label={t.leagueDivisions}
          value={divisions}
          onChange={setDivisions}
          options={LEAGUE_DIVISIONS.map((d) => ({ value: d, label: String(d) }))}
        />
        {divisions > 1 && <p className="-mt-2 text-xs text-stone-500">{t.leagueDivisionsHint}</p>}
        {mode === "live" && <TimeControlPicker value={clock} onChange={setClock} />}
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-2">
          <Button className="flex-1" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button
            variant="primary"
            className="flex-[2]"
            disabled={!name.trim()}
            onClick={() =>
              void createLeague(clubId, name.trim(), variant, length, weeks, mode, days, divisions, clock)
                .then(onCreated)
                .catch((e: unknown) => setError(errorOf(t, e)))
            }
          >
            {t.leagueCreate}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function LeaguePage({
  id,
  onBack,
  onLeague,
  onCorr,
}: {
  id: string;
  onBack: () => void;
  onLeague: (id: string) => void;
  onCorr: (id: string) => void;
}) {
  const t = useT();
  const me = useOnline((s) => s.profile?.id);
  const status = useOnline((s) => s.status);
  const [league, setLeague] = useState<LeagueView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reload re-runs the fetch
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchLeague(id)
        .then((l) => alive && setLeague(l))
        .catch((e: unknown) => alive && setError(errorOf(t, e)));
    void load();
    const timer = setInterval(load, 10_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [id, reload]);

  const act = (fn: () => Promise<unknown>) =>
    void fn()
      .then(() => setReload((n) => n + 1))
      .catch((e: unknown) => setError(errorOf(t, e)));

  if (!league) return <Back onBack={onBack} text={error ?? t.loading} />;
  const admin = league.myRole === "owner" || league.myRole === "admin";
  const mine = league.matches.filter((m) => m.players.some((p) => p.id === me));
  const minPlayers = LEAGUE_DIVISION_MIN * league.divisions;
  const divisions = Array.from({ length: league.divisions }, (_, d) =>
    league.standings.filter((s) => s.division === d + 1),
  );

  return (
    <div className="flex flex-col gap-4">
      <Button variant="ghost" className="self-start px-3 py-1.5 text-sm" onClick={onBack}>
        ← {t.back}
      </Button>
      {league.mode === "live" && <OutgoingChallenge />}
      <Card className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-amber-100">🏟️ {league.name}</h2>
        <p className="text-sm text-stone-400">
          {variantLabel(league.variant, t.tavliMatch)} · {lengthText(t, league.length)} ·{" "}
          {t.leagueModes[league.mode]}
          {league.mode === "corr" && ` (${t.corrDays.replace("{d}", String(league.days))})`}
          {league.mode === "live" && league.clock !== "relaxed" && ` (${t.timeControls[league.clock]})`} ·{" "}
          {t.leagueWeeks.replace("{n}", String(league.weeks))}
          {league.divisions > 1 && ` · ${league.divisions} ${t.leagueDivisions}`} ·{" "}
          {t.leagueStatus[league.status]}
          {league.endsAt &&
            league.status === "running" &&
            ` · ${t.leagueEnds} ${new Date(league.endsAt).toLocaleDateString(t.locale)}`}
        </p>
        {league.winner && (
          <p className="text-amber-200">
            🥇 {t.leagueChampion}: <b>{league.winner.name}</b>
          </p>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
        {league.status === "open" && (
          <>
            <p className="text-sm text-stone-300">
              {league.entries.length === 0 ? t.leagueNoEntries : league.entries.map((p) => p.name).join(", ")}
            </p>
            {league.divisions > 1 && (
              <p className="text-xs text-stone-500">
                {t.leagueMinPlayers
                  .replace("{n}", String(minPlayers))
                  .replace("{d}", String(LEAGUE_DIVISION_MIN))}{" "}
                {t.leagueDivisionsHint}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {!league.entered && (
                <Button variant="primary" onClick={() => act(() => leagueAction(id, "join"))}>
                  {t.tJoin}
                </Button>
              )}
              {league.entered && (
                <Button variant="ghost" onClick={() => act(() => leagueAction(id, "leave"))}>
                  {t.tLeave}
                </Button>
              )}
              {admin && (
                <Button
                  disabled={league.entries.length < minPlayers}
                  onClick={() => act(() => leagueAction(id, "start"))}
                >
                  ▶ {t.leagueStart}
                </Button>
              )}
            </div>
          </>
        )}
        <div className="flex flex-wrap gap-2">
          {league.previousId && (
            <Button
              variant="ghost"
              className="px-3 py-1 text-sm"
              onClick={() => onLeague(league.previousId!)}
            >
              ← {t.leaguePrevious}
            </Button>
          )}
          {league.nextId && (
            <Button variant="ghost" className="px-3 py-1 text-sm" onClick={() => onLeague(league.nextId!)}>
              {t.leagueNextLink} →
            </Button>
          )}
          {admin && league.status === "finished" && !league.nextId && (
            <Button
              onClick={() =>
                void leagueAction(id, "next")
                  .then((l) => onLeague(l.id))
                  .catch((e: unknown) => setError(errorOf(t, e)))
              }
            >
              ＋ {t.leagueNext}
            </Button>
          )}
        </div>
      </Card>

      {league.status !== "open" &&
        divisions.map((rows, d) => (
          <Card key={rows[0]?.id ?? d}>
            <h3 className="mb-2 font-semibold text-stone-200">
              {league.divisions > 1 ? t.leagueDivision.replace("{n}", String(d + 1)) : t.tStandings}
            </h3>
            <table className="w-full text-sm" data-testid="league-table">
              <thead>
                <tr className="text-xs text-stone-500">
                  <th className="w-6 text-left font-normal">#</th>
                  <th className="text-left font-normal">{t.tName}</th>
                  <th className="w-8 text-right font-normal">{t.tPlayed}</th>
                  <th className="w-12 text-right font-normal">{t.leagueWinsLosses}</th>
                  <th className="w-10 text-right font-normal">±</th>
                  <th className="w-10 text-right font-normal">{t.leaguePoints}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={r.id}
                    className={`${r.id === me ? "text-amber-200" : "text-stone-200"} ${r.move === "up" ? "bg-emerald-500/10" : r.move === "down" ? "bg-red-500/10" : ""}`}
                  >
                    <td className="tabular-nums text-stone-500">
                      {i + 1}
                      {r.move && (
                        <span
                          role="img"
                          className={r.move === "up" ? "text-emerald-300" : "text-red-300"}
                          title={r.move === "up" ? t.leagueUp : t.leagueDown}
                          aria-label={r.move === "up" ? t.leagueUp : t.leagueDown}
                        >
                          {r.move === "up" ? "▲" : "▼"}
                        </span>
                      )}
                    </td>
                    <td className="truncate">
                      <PlayerName name={r.player.name} frame={r.player.frame} />
                    </td>
                    <td className="text-right tabular-nums">{r.played}</td>
                    <td className="text-right tabular-nums text-stone-400">
                      {r.wins}-{r.losses}
                    </td>
                    <td className="text-right tabular-nums text-stone-400">
                      {r.diff > 0 ? `+${r.diff}` : r.diff}
                    </td>
                    <td className="text-right font-semibold tabular-nums">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}

      {league.status !== "open" && mine.length > 0 && (
        <Card>
          <h3 className="mb-1 font-semibold text-stone-200">{t.leagueMyMatches}</h3>
          <p className="mb-2 text-xs text-stone-500">
            {league.mode === "corr" ? t.leagueCorrPlayHint : t.leaguePlayHint}
          </p>
          <ul className="divide-y divide-stone-800">
            {mine.map((m) => {
              const mySide = m.players[0].id === me ? 0 : 1;
              const opp = m.players[mySide === 0 ? 1 : 0];
              const score = m.score && `${m.score[mySide]}:${m.score[mySide === 0 ? 1 : 0]}`;
              return (
                <li key={opp.id} className="flex items-center gap-2 py-2 text-sm">
                  <PlayerName className="min-w-0 flex-1 text-stone-100" name={opp.name} frame={opp.frame} />
                  {m.status === "done" ? (
                    <span className={m.winner === me ? "text-emerald-300" : "text-stone-400"}>
                      {m.winner === me ? `✓ ${t.corrWon}` : t.corrLost} {score}
                    </span>
                  ) : league.mode === "corr" && m.matchId ? (
                    <Button className="px-3 py-1 text-sm" onClick={() => onCorr(m.matchId!)}>
                      ✉ {t.leagueOpenGame}
                    </Button>
                  ) : m.status === "playing" ? (
                    <span className="text-amber-300">{t.tPlaying}</span>
                  ) : league.status === "running" && league.mode === "live" ? (
                    <Button
                      className="px-3 py-1 text-sm"
                      disabled={status !== "ready"}
                      onClick={() =>
                        challengeFriend(opp.id, league.variant, league.length as MatchLength, {
                          leagueId: league.id,
                        })
                      }
                    >
                      ⚔ {t.challenge}
                    </Button>
                  ) : (
                    <span className="text-stone-500">–</span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Back({ onBack, text }: { onBack: () => void; text: string }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center gap-4 p-6 text-center">
      <p className="text-stone-400">{text}</p>
      <Button onClick={onBack}>← {t.back}</Button>
    </div>
  );
}
