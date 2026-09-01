import { useEffect, useMemo, useRef, useState } from "react";
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
import { Empty, Loading, Shell } from "@/components/app-shell";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { courtName, type EventData } from "@/domain/tournament";
import { Leaderboard } from "@/features/tournament/Leaderboard";
import {
  getBrowserPlayerStorage,
  readPublicPlayerSelection,
  writePublicPlayerSelection,
} from "@/public-player-selection";

export function PublicEvent() {
  const { slug = "" } = useParams();
  const [data, setData] = useState<EventData | null>(null),
    [error, setError] = useState(""),
    [selected, setSelected] = useState(() =>
      readPublicPlayerSelection(getBrowserPlayerStorage(), slug),
    ),
    [refreshing, setRefreshing] = useState(false);
  const detailRef = useRef<HTMLElement>(null);
  const refreshingRef = useRef(false);
  const load = (background = false) =>
    api<EventData>(`/public/events/${slug}`)
      .then((next) => {
        setData(next);
        setError("");
      })
      .catch((x) => {
        if (!background) setError(x.message);
      });
  const refresh = async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      await Promise.all([
        load(),
        new Promise<void>((resolve) => window.setTimeout(resolve, 450)),
      ]);
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  };
  useEffect(() => {
    void load();
  }, [slug]);
  useEffect(() => {
    setSelected(readPublicPlayerSelection(getBrowserPlayerStorage(), slug));
  }, [slug]);
  useEffect(() => {
    if (!data) return;
    const timer = window.setInterval(() => {
      void load(true);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [slug, Boolean(data)]);
  useEffect(() => {
    if (
      !data ||
      data.event.public_slug !== slug ||
      !selected ||
      data.players.some((player) => player.id === selected)
    )
      return;

    setSelected("");
    writePublicPlayerSelection(getBrowserPlayerStorage(), slug, "");
  }, [data, selected, slug]);
  useEffect(() => {
    if (!selected) return;
    detailRef.current?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, [selected, data?.currentRound?.id]);
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
  if (error)
    return (
      <Shell>
        <Empty icon={<Archive />} title="Nicht verfügbar" text={error} />
      </Shell>
    );
  if (!data)
    return (
      <Shell>
        <Loading />
      </Shell>
    );
  const currentRound = data.currentRound;
  const initialLobby = data.rounds.length === 0;
  const lobbyPlayers = data.players.filter((player) => player.active);
  const selectedPlayer = data.players.find((x) => x.id === selected);
  const p = (id: string) => data.players.find((x) => x.id === id)!;
  const selectPlayer = (playerId: string) => {
    setSelected(playerId);
    writePublicPlayerSelection(getBrowserPlayerStorage(), slug, playerId);
  };
  let detail = (
    <div className="public-state">
      <b>
        <TennisBall />
      </b>
      <h2>Wer bist du?</h2>
      <p>
        Tippe unten deinen Namen an. Danach siehst du sofort Platz, Partner und
        Gegner.
      </p>
    </div>
  );
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
              <span
                className="public-assignment-round-badge"
                aria-label={`Runde ${currentRound?.round_number ?? "–"}`}
              >
                <small aria-hidden="true">Runde</small>
                <b aria-hidden="true">{currentRound?.round_number ?? "–"}</b>
              </span>
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
  return (
    <Shell>
      <div className="public-screen">
        <div className="public-refresh-dock">
          <span className="public-refresh-status">
            <i aria-hidden="true" /> Auto-Update aktiv
          </span>
          <UiButton
            className={cn("public-refresh", refreshing && "is-refreshing")}
            variant="secondary"
            disabled={refreshing}
            aria-busy={refreshing}
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
        {initialLobby ? (
          <section className="public-lobby-roster" aria-live="polite">
            <header>
              <div>
                <h2>Lobby geöffnet</h2>
                <p>
                  {lobbyPlayers.length === 1
                    ? "1 Teilnehmer ist dabei"
                    : `${lobbyPlayers.length} Teilnehmer sind dabei`}
                </p>
              </div>
            </header>
            {lobbyPlayers.length ? (
              <div className="public-lobby-grid">
                {lobbyPlayers.map((player) => (
                  <button
                    type="button"
                    key={player.id}
                    className={selected === player.id ? "selected" : ""}
                    aria-pressed={selected === player.id}
                    onClick={() => selectPlayer(player.id)}
                  >
                    <i>{player.emoji}</i>
                    <span className="public-lobby-player-copy">
                      <strong>{player.display_name}</strong>
                      {selected === player.id && <span>· Du</span>}
                    </span>
                    {selected === player.id && (
                      <Check
                        className="public-lobby-selection-check"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="public-lobby-empty">
                <Users aria-hidden="true" />
                <strong>Noch niemand eingetragen</strong>
                <p>Neue Teilnehmer erscheinen hier automatisch.</p>
              </div>
            )}
          </section>
        ) : (
          <div className="public">
            <section
              className="panel detail"
              ref={detailRef}
              aria-live="polite"
            >
              {detail}
            </section>
            <section className="panel public-rank-panel">
              <div className="title">
                <div>
                  <h2>Bestenliste</h2>
                  <span className="title-note">Tippe deinen Namen an</span>
                </div>
                <Trophy />
              </div>
              <Leaderboard
                players={data.leaderboard}
                selected={selected}
                onSelect={selectPlayer}
              />
            </section>
          </div>
        )}
      </div>
    </Shell>
  );
}
