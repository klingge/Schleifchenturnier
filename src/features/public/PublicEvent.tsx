import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Archive,
  ArrowClockwise,
  Check,
  TennisBall,
  Timer,
  Trophy,
  Users,
} from "@phosphor-icons/react";
import { Button as UiButton } from "@/components/ui/button";
import { Input as UiInput } from "@/components/ui/input";
import { Empty, Loading, Shell } from "@/components/app-shell";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { courtName, type EventData, type Player } from "@/domain/tournament";
import { Leaderboard } from "@/features/tournament/Leaderboard";
import {
  getPublicRoundStatus,
  getVisiblePlayers,
} from "@/features/public/public-event-view";
import {
  getBrowserPlayerStorage,
  readPublicPlayerSelection,
  writePublicPlayerSelection,
} from "@/public-player-selection";

export function PublicEvent() {
  const { slug = "" } = useParams();
  const [data, setData] = useState<EventData | null>(null),
    [fatalError, setFatalError] = useState(""),
    [connectionError, setConnectionError] = useState(false),
    [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null),
    [selected, setSelected] = useState(() =>
      readPublicPlayerSelection(getBrowserPlayerStorage(), slug),
    ),
    [chooserOpen, setChooserOpen] = useState(
      () => !readPublicPlayerSelection(getBrowserPlayerStorage(), slug),
    ),
    [refreshing, setRefreshing] = useState(false),
    [completionAccent, setCompletionAccent] = useState(false);
  const detailRef = useRef<HTMLElement>(null);
  const dataRef = useRef<EventData | null>(null);
  const refreshingRef = useRef(false);
  const scrollAfterSelectionRef = useRef(false);
  const previousFinishedRef = useRef<boolean | null>(null);
  const load = useCallback(async () => {
    try {
      const next = await api<EventData>(`/public/events/${slug}`);
      dataRef.current = next;
      setData(next);
      setFatalError("");
      setConnectionError(false);
      setLastUpdatedAt(Date.now());
      return true;
    } catch (reason) {
      const requestError = reason as Error & { status?: number };
      const unavailable =
        requestError.status === 404 || requestError.status === 410;

      if (unavailable) {
        dataRef.current = null;
        setData(null);
        setConnectionError(false);
        setFatalError(requestError.message || "Veranstaltung nicht verfügbar.");
      } else if (dataRef.current) {
        setConnectionError(true);
      } else {
        setFatalError(
          requestError.message ||
            "Die Veranstaltung konnte nicht geladen werden.",
        );
      }
      return false;
    }
  }, [slug]);
  const refresh = async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      await load();
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  };
  useEffect(() => {
    dataRef.current = null;
    setData(null);
    setFatalError("");
    setConnectionError(false);
    setLastUpdatedAt(null);
    setCompletionAccent(false);
    previousFinishedRef.current = null;
    void load();
  }, [load]);
  useEffect(() => {
    const storedSelection = readPublicPlayerSelection(
      getBrowserPlayerStorage(),
      slug,
    );
    setSelected(storedSelection);
    setChooserOpen(!storedSelection);
  }, [slug]);
  const hasData = Boolean(data);
  useEffect(() => {
    if (!hasData) return;
    const timer = window.setInterval(() => {
      void load();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [hasData, load]);
  useEffect(() => {
    if (
      !data ||
      data.event.public_slug !== slug ||
      !selected ||
      data.players.some((player) => player.id === selected)
    )
      return;

    setSelected("");
    setChooserOpen(true);
    writePublicPlayerSelection(getBrowserPlayerStorage(), slug, "");
  }, [data, selected, slug]);
  useEffect(() => {
    if (!data) return;
    const finished = Boolean(data.event.finished_at);
    if (previousFinishedRef.current === false && finished) {
      setCompletionAccent(true);
    }
    previousFinishedRef.current = finished;
  }, [data]);
  useEffect(() => {
    if (!selected || !scrollAfterSelectionRef.current) return;
    scrollAfterSelectionRef.current = false;
    detailRef.current?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, [selected]);
  const match = useMemo(
    () =>
      data?.currentRound?.matches.find((m) =>
        [
          m.team_a_player_1_id,
          m.team_a_player_2_id,
          m.team_b_player_1_id,
          m.team_b_player_2_id,
        ].includes(selected),
      ),
    [data, selected],
  );
  if (fatalError)
    return (
      <Shell>
        <section className="public-fatal-error" aria-live="assertive">
          <h1 className="sr-only">Veranstaltung nicht verfügbar</h1>
          <Empty icon={<Archive />} title="Nicht verfügbar" text={fatalError} />
          <UiButton onClick={() => void refresh()} disabled={refreshing}>
            <ArrowClockwise aria-hidden="true" />
            {refreshing ? "Versuche erneut…" : "Erneut versuchen"}
          </UiButton>
        </section>
      </Shell>
    );
  if (!data)
    return (
      <Shell>
        <Loading />
      </Shell>
    );
  const currentRound = data.currentRound;
  const selectedPlayer = data.players.find((x) => x.id === selected);
  const p = (id: string) => data.players.find((x) => x.id === id)!;
  const selectPlayer = (playerId: string) => {
    scrollAfterSelectionRef.current = true;
    setSelected(playerId);
    setChooserOpen(false);
    writePublicPlayerSelection(getBrowserPlayerStorage(), slug, playerId);
  };
  let detail = null;
  if (selectedPlayer && !currentRound)
    detail = (
      <div className="public-state calm">
        <b>
          <Timer />
        </b>
        <p className="public-playerline">
          <i>{selectedPlayer.emoji}</i>
          <strong>{selectedPlayer.display_name}</strong>
        </p>
        <h2>Noch keine Paarung</h2>
        <p>Die Turnierleitung bereitet die nächste Runde vor.</p>
      </div>
    );
  if (selectedPlayer && currentRound && !match)
    detail = (
      <div className="public-state rest">
        <b>
          <Timer />
        </b>
        <p className="public-playerline">
          <i>{selectedPlayer.emoji}</i>
          <strong>{selectedPlayer.display_name}</strong>
        </p>
        <h2>Du setzt diese Runde aus</h2>
        <p>Kurz durchatmen. Bei der nächsten Runde wieder reinschauen.</p>
      </div>
    );
  if (match) {
    const ids = [
        match.team_a_player_1_id,
        match.team_a_player_2_id,
        match.team_b_player_1_id,
        match.team_b_player_2_id,
      ],
      a = ids.slice(0, 2).includes(selected),
      partner = p(
        (a ? ids.slice(0, 2) : ids.slice(2)).find((x) => x !== selected)!,
      ),
      opps = (a ? ids.slice(2) : ids.slice(0, 2)).map(p);
    detail = (
      <article className="assignment public-court-card">
        <header className="public-assignment-summary">
          <div className="public-assignment-court">
            <div className="public-assignment-court-copy">
              <span>Du spielst auf</span>
              <strong>{courtName(match)}</strong>
            </div>
            <div className="public-assignment-court-meta">
              <TennisBall aria-hidden="true" />
            </div>
          </div>
        </header>
        <div
          className="public-court-board"
          aria-label={`${courtName(match)}: ${p(selected).display_name} und ${partner.display_name} gegen ${opps[0].display_name} und ${opps[1].display_name}`}
        >
          <section
            className="public-court-team public-court-team-own"
            aria-label="Dein Team"
          >
            <div className="public-court-players">
              <div className="public-court-player is-partner">
                <i>{partner.emoji}</i>
                <strong>{partner.display_name}</strong>
                <small>Partner</small>
              </div>
              <div className="public-court-player is-you">
                <i>{p(selected).emoji}</i>
                <strong>{p(selected).display_name}</strong>
                <small>Du</small>
              </div>
            </div>
          </section>
          <section
            className="public-court-team public-court-team-opponents"
            aria-label="Gegner"
          >
            <div className="public-court-players">
              {opps.map((opponent) => (
                <div className="public-court-player" key={opponent.id}>
                  <i>{opponent.emoji}</i>
                  <strong>{opponent.display_name}</strong>
                </div>
              ))}
            </div>
          </section>
        </div>
      </article>
    );
  }
  const publicStatus = getPublicRoundStatus(currentRound?.state);
  const lastUpdatedLabel = lastUpdatedAt
    ? new Intl.DateTimeFormat("de-DE", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(lastUpdatedAt)
    : "";
  const selectionPanel = chooserOpen || !selectedPlayer;
  const detailKey = `${selected || "none"}:${currentRound?.id ?? "lobby"}:${currentRound?.state ?? "preparing"}:${match?.id ?? "rest"}`;
  const detailPanel = (
    <section className="panel detail" ref={detailRef} aria-live="polite">
      {selectionPanel ? (
        <PlayerChooser
          players={data.players}
          selected={selected}
          onSelect={selectPlayer}
        />
      ) : (
        <>
          <div className="public-selected-player">
            <span>
              <i aria-hidden="true">{selectedPlayer.emoji}</i>
              <strong>{selectedPlayer.display_name}</strong>
            </span>
            <UiButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setChooserOpen(true)}
            >
              Name wechseln
            </UiButton>
          </div>
          <div className="public-detail-transition" key={detailKey}>
            {detail}
          </div>
        </>
      )}
    </section>
  );
  return (
    <Shell>
      <div className="public-screen">
        <div className="public-page-bar">
          <div className="public-page-heading">
            <h1>{data.event.name}</h1>
            <p
              className="public-round-status"
              key={`${currentRound?.id ?? "lobby"}:${currentRound?.state ?? "preparing"}`}
            >
              {currentRound && `Runde ${currentRound.round_number} · `}
              {publicStatus}
            </p>
          </div>
          <div className="public-refresh-dock">
            <span
              className={cn(
                "public-refresh-status",
                connectionError && "is-interrupted",
              )}
              role="status"
            >
              <i aria-hidden="true" />
              {connectionError
                ? `Aktualisierung unterbrochen${lastUpdatedLabel ? ` · Stand ${lastUpdatedLabel}` : ""}`
                : "Auto-Update aktiv"}
            </span>
            <UiButton
              className={cn("public-refresh", refreshing && "is-refreshing")}
              variant="secondary"
              disabled={refreshing}
              aria-busy={refreshing}
              aria-label={refreshing ? "Aktualisierung läuft" : "Aktualisieren"}
              onClick={() => void refresh()}
            >
              <ArrowClockwise
                className="public-refresh-icon"
                aria-hidden="true"
              />
              <span className="public-refresh-label-desktop">
                {refreshing ? "Aktualisiere…" : "Aktualisieren"}
              </span>
              <span className="public-refresh-label-mobile">
                {refreshing ? "Aktualisiere…" : "Jetzt aktualisieren"}
              </span>
            </UiButton>
          </div>
        </div>
        {data.event.finished_at ? (
          <section className="panel public-rank-panel" aria-live="polite">
            <div className="title">
              <div>
                <h2>Turnier beendet</h2>
                <span className="title-note">
                  Endwertung · {data.event.name}
                </span>
              </div>
              <Trophy
                className={cn(completionAccent && "public-finish-icon")}
                onAnimationEnd={() => setCompletionAccent(false)}
              />
            </div>
            <Leaderboard players={data.leaderboard} selected={selected} />
          </section>
        ) : !currentRound ? (
          detailPanel
        ) : (
          <div className="public">
            {detailPanel}
            <section className="panel public-rank-panel">
              <div className="title">
                <div>
                  <h2>Bestenliste</h2>
                  <span className="title-note">
                    Siege · Spieldifferenz aus gewonnenen und verlorenen Spielen
                  </span>
                </div>
                <Trophy />
              </div>
              <Leaderboard players={data.leaderboard} selected={selected} />
            </section>
          </div>
        )}
      </div>
    </Shell>
  );
}

function PlayerChooser({
  players,
  selected,
  onSelect,
}: {
  players: Player[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const visiblePlayers = useMemo(
    () => getVisiblePlayers(players, query),
    [players, query],
  );

  return (
    <div className="public-player-picker">
      <div className="public-player-picker-heading">
        <div>
          <h2>Wer bist du?</h2>
          <p>Wähle deinen Namen für deine persönliche Spielzuordnung.</p>
        </div>
        <span>{players.length} Namen</span>
      </div>
      <label className="public-player-search" htmlFor="public-player-search">
        <span>Name suchen</span>
        <UiInput
          id="public-player-search"
          type="search"
          value={query}
          placeholder="Name eingeben"
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {visiblePlayers.length ? (
        <ul className="public-player-list">
          {visiblePlayers.map((player) => (
            <li key={player.id}>
              <button
                type="button"
                className={selected === player.id ? "selected" : ""}
                aria-pressed={selected === player.id}
                onClick={() => onSelect(player.id)}
              >
                <i aria-hidden="true">{player.emoji}</i>
                <strong>{player.display_name}</strong>
                {selected === player.id && <Check aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      ) : players.length ? (
        <p className="public-player-empty">
          Kein Name passt zu „{query.trim()}“. Prüfe die Schreibweise oder
          lösche die Suche.
        </p>
      ) : (
        <div className="public-lobby-empty">
          <Users aria-hidden="true" />
          <strong>Noch niemand eingetragen</strong>
          <p>Neue Teilnehmer erscheinen hier automatisch.</p>
        </div>
      )}
    </div>
  );
}
