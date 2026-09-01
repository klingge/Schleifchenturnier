import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { NavLink, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  DotsThreeVertical,
  GearSix,
  LockKey,
  Pause,
  Play,
  Plus,
  Shuffle,
  Trophy,
  Users,
  X,
} from "@phosphor-icons/react";

import {
  Alert as UiAlert,
  AlertDescription as UiAlertDescription,
  AlertTitle as UiAlertTitle,
} from "@/components/ui/alert";
import { Badge as UiBadge } from "@/components/ui/badge";
import { Button as UiButton } from "@/components/ui/button";
import {
  Card as UiCard,
  CardAction as UiCardAction,
  CardContent as UiCardContent,
  CardDescription as UiCardDescription,
  CardFooter as UiCardFooter,
  CardHeader as UiCardHeader,
  CardTitle as UiCardTitle,
} from "@/components/ui/card";
import {
  Dialog as UiDialog,
  DialogClose as UiDialogClose,
  DialogContent as UiDialogContent,
  DialogFooter as UiDialogFooter,
  DialogHeader as UiDialogHeader,
  DialogTitle as UiDialogTitle,
} from "@/components/ui/dialog";
import {
  Field as UiField,
  FieldLabel as UiFieldLabel,
} from "@/components/ui/field";
import { Input as UiInput } from "@/components/ui/input";
import {
  DropdownMenu as UiDropdownMenu,
  DropdownMenuContent as UiDropdownMenuContent,
  DropdownMenuGroup as UiDropdownMenuGroup,
  DropdownMenuItem as UiDropdownMenuItem,
  DropdownMenuSeparator as UiDropdownMenuSeparator,
  DropdownMenuTrigger as UiDropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea as UiScrollArea } from "@/components/ui/scroll-area";
import { Skeleton as UiSkeleton } from "@/components/ui/skeleton";
import { Progress as UiProgress } from "@/components/ui/progress";
import { TooltipProvider as UiTooltipProvider } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  matchPlayerIds,
  type EventData,
  type Player,
} from "@/domain/tournament";
import {
  canCompleteRoundWithEntries,
  comparePlayersByName,
  countCompletedResults,
  getInitialSetupTab,
  getSittingOutCount,
  isResultEntryRoundState,
  type MatchEntryStatus,
} from "@/admin-dashboard-state";
import { LogoutMenuItem, type LogoutHandler } from "@/components/app-shell";
import { DeleteEventDialog } from "@/features/admin/DeleteEventDialog";
import { Leaderboard } from "@/features/tournament/Leaderboard";

const eventTabs = [
  "dashboard",
  "teilnehmer",
  "plaetze",
  "bestenliste",
] as const;
type EventTab = (typeof eventTabs)[number];
const isEventTab = (value: string): value is EventTab =>
  eventTabs.includes(value as EventTab);

import {
  Clock,
  CourtManager,
  EventSettingsDialog,
  InitialSetupGuide,
  MatchCard,
  PlayerEditorHeader,
  QR,
  ScoreCorrection,
} from "@/features/admin/TournamentComponents";

export function EventAdmin({ logout }: { logout: LogoutHandler }) {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const routeLocation = useLocation();
  const requestedTab =
    routeLocation.pathname.split("/").filter(Boolean).at(-1) ?? "";
  const [data, setData] = useState<EventData | null>(null),
    [error, setError] = useState("");
  const setupActivePlayers =
    data?.players.filter((player) => player.active).length ?? 0;
  const setupActiveCourts =
    data?.courts.filter((court) => court.active).length ?? 0;
  const defaultTab: EventTab =
    data && data.rounds.length === 0
      ? getInitialSetupTab(setupActivePlayers, setupActiveCourts)
      : "dashboard";
  const activeTab: EventTab = isEventTab(requestedTab)
    ? requestedTab
    : defaultTab;
  const [duration, setDuration] = useState(20);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [participantAddOpen, setParticipantAddOpen] = useState(false);
  const [participantAdding, setParticipantAdding] = useState(false);
  const [correctionPlayerId, setCorrectionPlayerId] = useState("");
  const participantNameRef = useRef<HTMLInputElement>(null);
  const [matchEntryStatuses, setMatchEntryStatuses] = useState<
    Record<string, MatchEntryStatus>
  >({});
  const configurationLocked = Boolean(
    data?.currentRound && data.currentRound.state !== "completed",
  );
  const load = () =>
    api<EventData>(`/admin/events/${id}`)
      .then((x) => {
        setData(x);
        setDuration(x.event.default_round_duration_seconds / 60);
      })
      .catch((x) => setError(x.message));
  useEffect(() => {
    void load();
  }, [id]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [id]);
  useEffect(() => {
    if (data && data.event.id === id && !isEventTab(requestedTab)) {
      void nav(`/admin/events/${id}/${defaultTab}`, { replace: true });
      return;
    }
  }, [data, defaultTab, id, nav, requestedTab]);
  useEffect(() => {
    setMatchEntryStatuses({});
  }, [data?.currentRound?.id, data?.currentRound?.state]);
  useEffect(() => {
    if (activeTab !== "teilnehmer" || configurationLocked) {
      setParticipantAddOpen(false);
      return;
    }
    if (participantAddOpen && !participantAdding)
      participantNameRef.current?.focus();
  }, [activeTab, configurationLocked, participantAddOpen, participantAdding]);
  const updateMatchEntryStatus = useCallback(
    (matchId: string, status: MatchEntryStatus) => {
      setMatchEntryStatuses((current) => {
        const existing = current[matchId];
        if (
          existing &&
          existing.complete === status.complete &&
          existing.valid === status.valid &&
          existing.saved === status.saved &&
          existing.saving === status.saving &&
          existing.failed === status.failed
        ) {
          return current;
        }
        return { ...current, [matchId]: status };
      });
    },
    [],
  );
  async function mutate(path: string, init: RequestInit) {
    setError("");
    try {
      await api(path, init);
      await load();
    } catch (x) {
      const e = x as Error;
      setError(e.message);
      throw e;
    }
  }
  if (!data)
    return error ? (
      <UiAlert variant="destructive">
        <UiAlertTitle>Veranstaltung konnte nicht geladen werden</UiAlertTitle>
        <UiAlertDescription>{error}</UiAlertDescription>
      </UiAlert>
    ) : (
      <div
        className="control-page control-loading"
        aria-label="Veranstaltung lädt"
      >
        <UiCard>
          <UiCardHeader>
            <UiSkeleton className="h-7 w-2/5" />
            <UiSkeleton className="h-4 w-3/5" />
          </UiCardHeader>
        </UiCard>
        <div className="control-desk">
          <UiSkeleton className="h-[560px] w-full rounded-xl" />
          <UiSkeleton className="h-[560px] w-full rounded-xl" />
        </div>
      </div>
    );
  const round = data.currentRound,
    pm = new Map(data.players.map((p) => [p.id, p])),
    correctionPlayer = correctionPlayerId
      ? pm.get(correctionPlayerId)
      : undefined,
    correctionMatches = correctionPlayer
      ? data.rounds
          .filter((item) => item.state === "completed")
          .flatMap((item) =>
            item.matches
              .filter((match) =>
                matchPlayerIds(match).includes(correctionPlayer.id),
              )
              .map((match) => ({ round: item, match })),
          )
          .sort(
            (a, b) =>
              b.round.round_number - a.round.round_number ||
              a.match.court_number - b.match.court_number,
          )
      : [],
    sittingOutPlayers =
      round?.sitting_out_player_ids
        .map((playerId) => pm.get(playerId))
        .filter((player): player is Player => Boolean(player)) ?? [],
    participantCount = data.players.length,
    activePlayers = data.players.filter((p) => p.active).length,
    activeCourts = data.courts.filter((court) => court.active).length,
    nextSitOutCount = getSittingOutCount(activePlayers, activeCourts),
    perfectActiveCount =
      activePlayers >= 4 && activeCourts > 0 && nextSitOutCount === 0,
    initialSetup = data.rounds.length === 0,
    initialSetupReady = activePlayers >= 4 && activeCourts > 0,
    alphabeticalPlayers = [...data.players].sort(comparePlayersByName),
    rankedPlayers = data.leaderboard,
    lobbyOpen = !round || round.state === "completed",
    resultEntryOpen = isResultEntryRoundState(round?.state),
    completedResults = countCompletedResults(round?.matches ?? []),
    roundCanComplete = canCompleteRoundWithEntries(
      round?.state,
      round?.matches ?? [],
      matchEntryStatuses,
    );
  const generate = () =>
    mutate(`/admin/events/${id}/generate`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (participantAdding) return;
    const f = e.currentTarget;
    setParticipantAdding(true);
    try {
      await mutate(`/admin/events/${id}/players`, {
        method: "POST",
        body: JSON.stringify({ name: new FormData(f).get("name") }),
      });
      f.reset();
    } catch {
      // The shared error alert contains the actionable API message.
    } finally {
      setParticipantAdding(false);
    }
  }
  return (
    <UiTooltipProvider>
      <div className="control-page">
        <UiCard className="control-header">
          <UiCardHeader>
            <UiCardTitle>
              <small className="control-event-name">{data.event.name}</small>
              <span
                className={cn(
                  "control-round-title",
                  round?.state === "completed" && "is-completed",
                )}
              >
                {round?.state === "completed" && (
                  <CheckCircle aria-hidden="true" weight="fill" />
                )}
                <span>
                  {round
                    ? `Runde ${round.round_number}${
                        round.state === "completed" ? " abgeschlossen" : ""
                      }`
                    : "Vorbereitung"}
                </span>
              </span>
            </UiCardTitle>
            <UiCardDescription>{participantCount} Teilnehmer</UiCardDescription>
            <UiCardAction>
              <div className="control-header-actions">
                {round?.state !== "completed" &&
                  round?.state !== "published" && (
                    <UiBadge variant={!round ? "outline" : "secondary"}>
                      {!round
                        ? "Vorbereitung"
                        : round.state === "results"
                          ? "Ergebnisse"
                          : round.state === "paused"
                            ? "Pausiert"
                            : "Läuft"}
                    </UiBadge>
                  )}
                <QR
                  url={`${window.location.origin}/event/${data.event.public_slug}`}
                />
                <UiDropdownMenu>
                  <UiDropdownMenuTrigger asChild>
                    <UiButton
                      className="event-actions-trigger"
                      variant="ghost"
                      size="icon-lg"
                      aria-label="Veranstaltungsaktionen öffnen"
                    >
                      <DotsThreeVertical />
                    </UiButton>
                  </UiDropdownMenuTrigger>
                  <UiDropdownMenuContent align="end" className="min-w-52">
                    <UiDropdownMenuGroup>
                      <UiDropdownMenuItem onSelect={() => nav("/admin")}>
                        <ArrowLeft /> Zur Übersicht
                      </UiDropdownMenuItem>
                    </UiDropdownMenuGroup>
                    <UiDropdownMenuSeparator />
                    <UiDropdownMenuGroup>
                      <UiDropdownMenuItem
                        onSelect={() => setSettingsOpen(true)}
                      >
                        <GearSix /> Einstellungen
                      </UiDropdownMenuItem>
                      <UiDropdownMenuItem
                        onSelect={() => {
                          void mutate(`/admin/events/${id}`, {
                            method: "PATCH",
                            body: JSON.stringify({ status: "archived" }),
                          }).catch(() => {});
                        }}
                      >
                        <Archive /> Archivieren
                      </UiDropdownMenuItem>
                      <DeleteEventDialog
                        event={data.event}
                        onDeleted={() => nav("/admin")}
                      />
                    </UiDropdownMenuGroup>
                    <UiDropdownMenuSeparator />
                    <UiDropdownMenuGroup>
                      <LogoutMenuItem logout={logout} />
                    </UiDropdownMenuGroup>
                  </UiDropdownMenuContent>
                </UiDropdownMenu>
              </div>
            </UiCardAction>
          </UiCardHeader>
          {activeTab === "dashboard" &&
            round &&
            ["running", "paused"].includes(round.state) && (
              <UiCardFooter>
                <Clock round={round} mutate={mutate} />
              </UiCardFooter>
            )}
        </UiCard>
        <EventSettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          duration={duration}
          save={(durationMinutes) =>
            mutate(`/admin/events/${id}`, {
              method: "PATCH",
              body: JSON.stringify({ durationMinutes }),
            })
          }
        />
        <nav className="event-tabs" aria-label="Veranstaltungsbereiche">
          <NavLink to={`/admin/events/${id}/dashboard`}>Dashboard</NavLink>
          <NavLink to={`/admin/events/${id}/teilnehmer`}>Teilnehmer</NavLink>
          <NavLink to={`/admin/events/${id}/plaetze`}>Plätze</NavLink>
          <NavLink to={`/admin/events/${id}/bestenliste`}>Bestenliste</NavLink>
        </nav>
        {error && (
          <UiAlert variant="destructive">
            <UiAlertTitle>Anfrage fehlgeschlagen</UiAlertTitle>
            <UiAlertDescription>{error}</UiAlertDescription>
          </UiAlert>
        )}
        {initialSetup && (
          <InitialSetupGuide
            eventId={id}
            activeTab={activeTab}
            activePlayers={activePlayers}
            activeCourts={activeCourts}
          />
        )}
        <div
          className={cn(
            "control-desk",
            activeTab === "dashboard" && "control-dashboard",
          )}
        >
          {activeTab === "dashboard" && (
            <UiCard
              className={cn(
                "control-stage",
                lobbyOpen && "is-draw-stage",
                round?.state === "completed" && "is-recap-stage",
              )}
            >
              <UiCardHeader>
                <UiCardTitle role="heading" aria-level={2}>
                  {!round
                    ? "Erste Runde auslosen"
                    : round.state === "completed"
                      ? "Aktualisierte Bestenliste"
                      : resultEntryOpen
                        ? "Ergebnisse erfassen"
                        : round.state === "published"
                          ? "Doppel veröffentlicht"
                          : "Runde vorbereiten"}
                </UiCardTitle>
                <UiCardDescription>
                  {!round
                    ? "Wer spielt in der ersten Runde zusammen?"
                    : round.state === "completed"
                      ? `Runde ${round.round_number} ist abgeschlossen.`
                      : resultEntryOpen
                        ? "Ergebnisse können eingetragen werden, sobald ein Platz fertig ist."
                        : "Die aktuelle Runde ist für die Teilnehmer sichtbar."}
                </UiCardDescription>
                {round && resultEntryOpen && (
                  <UiCardAction>
                    <UiBadge variant="outline">
                      {completedResults}/{round.matches.length} erfasst
                    </UiBadge>
                  </UiCardAction>
                )}
              </UiCardHeader>
              <UiCardContent>
                {round?.state === "completed" && (
                  <div className="round-recap-leaderboard">
                    <Leaderboard players={rankedPlayers} />
                  </div>
                )}
                {round?.state === "published" && (
                  <div className="control-actions">
                    <UiButton
                      size="lg"
                      data-primary-round-action
                      onClick={() =>
                        mutate(`/admin/rounds/${round.id}/action`, {
                          method: "POST",
                          body: JSON.stringify({ action: "start" }),
                        })
                      }
                    >
                      <Play data-icon="inline-start" weight="fill" />
                      {round.round_number === 1
                        ? "Erste Runde starten"
                        : "Runde starten"}
                    </UiButton>
                    <UiButton
                      className="redraw-action"
                      size="sm"
                      variant="ghost"
                      onClick={generate}
                    >
                      <Shuffle data-icon="inline-start" />
                      Neu auslosen
                    </UiButton>
                  </div>
                )}
                {round && round.state !== "completed" && (
                  <>
                    {sittingOutPlayers.length > 0 && (
                      <UiAlert className="sitting-out">
                        <UiAlertTitle>Setzen diese Runde aus</UiAlertTitle>
                        <UiAlertDescription>
                          {sittingOutPlayers.map((player) => (
                            <UiBadge key={player.id} variant="outline">
                              <i>{player.emoji}</i>
                              {player.display_name}
                            </UiBadge>
                          ))}
                        </UiAlertDescription>
                      </UiAlert>
                    )}
                    <div className="matches dashboard-matches">
                      {round.matches.map((m) => (
                        <MatchCard
                          key={m.id}
                          m={m}
                          players={pm}
                          result={resultEntryOpen}
                          onStatusChange={updateMatchEntryStatus}
                          save={(a, b) =>
                            mutate(`/admin/matches/${m.id}/result`, {
                              method: "PUT",
                              body: JSON.stringify({
                                teamAGames: a,
                                teamBGames: b,
                              }),
                            })
                          }
                        />
                      ))}
                    </div>
                  </>
                )}
              </UiCardContent>
              <UiCardFooter
                className={cn(
                  "control-stage-footer",
                  (round?.state === "completed" || resultEntryOpen) &&
                    "floating-stage-footer",
                  resultEntryOpen && "results-progress-footer",
                )}
              >
                {(!round || round.state === "completed") && (
                  <UiButton
                    className="draw-action"
                    size="lg"
                    disabled={activePlayers < 4 || activeCourts === 0}
                    onClick={generate}
                  >
                    <Shuffle data-icon="inline-start" />
                    <span className="draw-action-label">
                      {round?.state === "completed"
                        ? "Nächste Runde auslosen"
                        : "Erste Runde auslosen"}
                    </span>
                  </UiButton>
                )}
                {round && resultEntryOpen && (
                  <>
                    <div className="result-progress" aria-live="polite">
                      <div>
                        <strong>
                          {completedResults} von {round.matches.length}{" "}
                          Ergebnissen erfasst
                        </strong>
                        <span>
                          {roundCanComplete
                            ? "Alle Ergebnisse sind gespeichert."
                            : "Alle Plätze vollständig eintragen."}
                        </span>
                      </div>
                      <UiProgress
                        value={
                          round.matches.length
                            ? (completedResults / round.matches.length) * 100
                            : 0
                        }
                        aria-label={`${completedResults} von ${round.matches.length} Ergebnissen erfasst`}
                      />
                    </div>
                    <UiButton
                      size="lg"
                      disabled={!roundCanComplete}
                      onClick={() => {
                        void mutate(`/admin/rounds/${round.id}/complete`, {
                          method: "POST",
                          body: JSON.stringify({ allowMissing: false }),
                        }).catch(() => {});
                      }}
                    >
                      <Check data-icon="inline-start" /> Runde abschließen
                    </UiButton>
                  </>
                )}
              </UiCardFooter>
            </UiCard>
          )}
          <section className="control-tab-panel">
            {activeTab === "plaetze" && (
              <CourtManager
                eventId={id}
                courts={data.courts}
                mutate={mutate}
                editable={!configurationLocked}
                showSetupAction={initialSetup}
                setupReady={initialSetupReady}
                onSetupContinue={() => nav(`/admin/events/${id}/dashboard`)}
              />
            )}
            {activeTab === "teilnehmer" && (
              <UiCard className="control-participants">
                <UiCardHeader>
                  <UiCardTitle>Teilnehmer</UiCardTitle>
                  <UiCardDescription>
                    {activePlayers} aktiv von {participantCount}
                  </UiCardDescription>
                  {!configurationLocked && (
                    <UiCardAction>
                      <UiButton
                        className="participant-add-trigger"
                        type="button"
                        variant={participantAddOpen ? "secondary" : "default"}
                        aria-expanded={participantAddOpen}
                        aria-controls="participant-add-form"
                        onClick={() => setParticipantAddOpen((open) => !open)}
                      >
                        {participantAddOpen ? (
                          <>
                            <X data-icon="inline-start" /> Schließen
                          </>
                        ) : (
                          <>
                            <Plus data-icon="inline-start" /> Hinzufügen
                          </>
                        )}
                      </UiButton>
                    </UiCardAction>
                  )}
                </UiCardHeader>
                <UiCardContent>
                  {configurationLocked && (
                    <UiAlert className="configuration-lock" role="status">
                      <LockKey />
                      <UiAlertTitle>Teilnehmer im Lesemodus</UiAlertTitle>
                      <UiAlertDescription>
                        Namen und Spielhistorie bleiben einsehbar. Änderungen
                        sind nach dem Rundenabschluss wieder möglich.
                      </UiAlertDescription>
                    </UiAlert>
                  )}
                  {!configurationLocked && participantAddOpen && (
                    <form
                      id="participant-add-form"
                      className="participant-add-form"
                      onSubmit={add}
                      onKeyDown={(event) => {
                        if (event.key === "Escape" && !participantAdding) {
                          event.preventDefault();
                          setParticipantAddOpen(false);
                        }
                      }}
                    >
                      <UiField>
                        <UiFieldLabel
                          className="sr-only"
                          htmlFor="participant-name"
                        >
                          Vorname oder Spitzname
                        </UiFieldLabel>
                        <UiInput
                          ref={participantNameRef}
                          id="participant-name"
                          name="name"
                          maxLength={40}
                          placeholder="Vorname oder Spitzname"
                          disabled={participantAdding}
                          aria-busy={participantAdding}
                          required
                        />
                      </UiField>
                      <div className="participant-add-actions">
                        <UiButton
                          type="button"
                          variant="outline"
                          disabled={participantAdding}
                          onClick={() => setParticipantAddOpen(false)}
                        >
                          Abbrechen
                        </UiButton>
                        <UiButton type="submit" disabled={participantAdding}>
                          {participantAdding
                            ? "Wird hinzugefügt…"
                            : "Hinzufügen"}
                        </UiButton>
                      </div>
                    </form>
                  )}
                  <div
                    className={cn(
                      "participant-balance",
                      perfectActiveCount && "perfect",
                    )}
                  >
                    {perfectActiveCount ? <Check /> : <Users />}
                    <span>
                      {activePlayers === 0
                        ? "Noch keine aktiven Teilnehmer."
                        : activePlayers < 4
                          ? `${activePlayers} aktiv: mindestens 4 für eine Runde.`
                          : activeCourts === 0
                            ? `${activePlayers} aktiv: Aktiviere mindestens einen Platz für die Auslosung.`
                            : perfectActiveCount
                              ? `Perfekt: ${activePlayers} aktive Teilnehmer, niemand setzt aus.`
                              : `${activePlayers} aktiv: ${nextSitOutCount} ${
                                  nextSitOutCount === 1 ? "setzt" : "setzen"
                                } bei der nächsten Runde aus.`}
                    </span>
                  </div>
                  {alphabeticalPlayers.length ? (
                    <UiScrollArea className="participant-scroll">
                      <div className="players control-players">
                        {alphabeticalPlayers.map((p) => (
                          <div
                            key={p.id}
                            className={
                              !p.active ? "player-row off" : "player-row"
                            }
                          >
                            <button
                              type="button"
                              className="player-open"
                              onClick={() => setCorrectionPlayerId(p.id)}
                              aria-label={
                                configurationLocked
                                  ? `Spielhistorie von ${p.display_name} anzeigen`
                                  : `${p.display_name} bearbeiten`
                              }
                            >
                              <i>{p.emoji}</i>
                              <span>
                                <strong>{p.display_name}</strong>
                              </span>
                              {configurationLocked && (
                                <small className="player-read-status">
                                  {p.active ? "Aktiv" : "Pausiert"}
                                </small>
                              )}
                            </button>
                            {!configurationLocked && (
                              <UiButton
                                type="button"
                                size="sm"
                                variant={p.active ? "secondary" : "outline"}
                                className={cn(
                                  "player-status-button",
                                  p.active && "is-active",
                                )}
                                aria-pressed={Boolean(p.active)}
                                aria-label={`${p.display_name} ${
                                  p.active ? "pausieren" : "aktivieren"
                                }`}
                                onClick={() =>
                                  mutate(`/admin/players/${p.id}`, {
                                    method: "PATCH",
                                    body: JSON.stringify({ active: !p.active }),
                                  }).catch(() => {})
                                }
                              >
                                {p.active ? (
                                  <Check aria-hidden="true" />
                                ) : (
                                  <Pause aria-hidden="true" weight="fill" />
                                )}
                                {p.active ? "Aktiv" : "Pausiert"}
                              </UiButton>
                            )}
                          </div>
                        ))}
                      </div>
                    </UiScrollArea>
                  ) : (
                    <p className="participant-empty">
                      {configurationLocked
                        ? "Noch keine Teilnehmer eingetragen."
                        : "Noch keine Teilnehmer. Über „+ Hinzufügen“ geht es los."}
                    </p>
                  )}
                </UiCardContent>
                {initialSetup && (
                  <UiCardFooter className="setup-continue">
                    <UiButton
                      size="lg"
                      disabled={activePlayers < 4}
                      onClick={() => nav(`/admin/events/${id}/plaetze`)}
                    >
                      Weiter zu den Plätzen{" "}
                      <ArrowRight data-icon="inline-end" />
                    </UiButton>
                  </UiCardFooter>
                )}
                <UiDialog
                  open={Boolean(correctionPlayer)}
                  onOpenChange={(open) => {
                    if (!open) setCorrectionPlayerId("");
                  }}
                >
                  <UiDialogContent className="correction-dialog sm:max-w-3xl">
                    <UiDialogHeader>
                      <UiDialogTitle>
                        {configurationLocked
                          ? "Teilnehmerdetails"
                          : "Teilnehmer bearbeiten"}
                      </UiDialogTitle>
                    </UiDialogHeader>
                    {correctionPlayer && (
                      <>
                        <PlayerEditorHeader
                          player={correctionPlayer}
                          matchCount={correctionMatches.length}
                          editable={!configurationLocked}
                          save={(name) =>
                            mutate(`/admin/players/${correctionPlayer.id}`, {
                              method: "PATCH",
                              body: JSON.stringify({ name }),
                            })
                          }
                        />
                        <div className="correction-section-heading">
                          <div>
                            <h3>Spielhistorie</h3>
                            <p>Abgeschlossene Spiele, neueste Runde zuerst.</p>
                          </div>
                        </div>
                        {correctionMatches.length ? (
                          <div className="correction-list">
                            {correctionMatches.map(({ round, match }) => (
                              <ScoreCorrection
                                key={match.id}
                                round={round}
                                match={match}
                                players={pm}
                                playerId={correctionPlayer.id}
                                save={(a, b) =>
                                  mutate(`/admin/matches/${match.id}/result`, {
                                    method: "PUT",
                                    body: JSON.stringify({
                                      teamAGames: a,
                                      teamBGames: b,
                                    }),
                                  })
                                }
                              />
                            ))}
                          </div>
                        ) : (
                          <p className="correction-empty">
                            Für diesen Teilnehmer gibt es noch keinen früheren
                            Spielstand.
                          </p>
                        )}
                      </>
                    )}
                    <UiDialogFooter>
                      <UiDialogClose asChild>
                        <UiButton variant="outline">Schließen</UiButton>
                      </UiDialogClose>
                    </UiDialogFooter>
                  </UiDialogContent>
                </UiDialog>
              </UiCard>
            )}
            {activeTab === "bestenliste" && (
              <UiCard className="control-leaderboard">
                <UiCardHeader>
                  <UiCardTitle>Bestenliste</UiCardTitle>
                  <UiCardAction>
                    <Trophy />
                  </UiCardAction>
                </UiCardHeader>
                <UiCardContent>
                  <Leaderboard players={data.leaderboard} />
                </UiCardContent>
              </UiCard>
            )}
          </section>
        </div>
      </div>
    </UiTooltipProvider>
  );
}
