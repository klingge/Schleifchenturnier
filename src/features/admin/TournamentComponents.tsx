import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  ArrowClockwise,
  ArrowRight,
  Check,
  Copy,
  Link as LinkIcon,
  LockKey,
  Minus,
  Pause,
  PencilSimple,
  Play,
  Plus,
  TennisBall,
  Timer,
  WarningCircle,
} from "@phosphor-icons/react";
import courtPreview from "@/assets/court-preview.png";

import {
  Alert as UiAlert,
  AlertDescription as UiAlertDescription,
  AlertTitle as UiAlertTitle,
} from "@/components/ui/alert";
import { Badge as UiBadge } from "@/components/ui/badge";
import { Button as UiButton } from "@/components/ui/button";
import {
  Card as UiCard,
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
  DialogTrigger as UiDialogTrigger,
} from "@/components/ui/dialog";
import {
  Field as UiField,
  FieldGroup as UiFieldGroup,
  FieldLabel as UiFieldLabel,
} from "@/components/ui/field";
import { Input as UiInput } from "@/components/ui/input";

import { Skeleton as UiSkeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  courtName,
  type Court,
  type Match,
  type Player,
  type Round,
} from "@/domain/tournament";
import {
  compareCourtsByName,
  getRoundSecondsLeft,
  type MatchEntryStatus,
  shouldAutoSaveScore,
} from "@/admin-dashboard-state";

const scoreValues = [0, 1, 2, 3, 4, 5, 6];
type EventTab = "dashboard" | "teilnehmer" | "plaetze" | "bestenliste";

export function QR({ url }: { url: string }) {
  const [img, setImg] = useState("");
  return (
    <UiDialog
      onOpenChange={(open) => {
        if (!open) return;
        void import("qrcode")
          .then(({ default: QRCode }) =>
            QRCode.toDataURL(url, {
              width: 420,
              margin: 2,
              color: { dark: "#000000", light: "#ffffff" },
            }),
          )
          .then(setImg);
      }}
    >
      <UiDialogTrigger asChild>
        <UiButton variant="outline">
          <LinkIcon data-icon="inline-start" /> Teilnehmeransicht
        </UiButton>
      </UiDialogTrigger>
      <UiDialogContent className="sm:max-w-md">
        <UiDialogHeader>
          <UiDialogTitle>Teilnehmeransicht</UiDialogTitle>
        </UiDialogHeader>
        <div className="qr">
          {img ? (
            <img
              src={img}
              alt="QR-Code zur Teilnehmeransicht"
              width="420"
              height="420"
            />
          ) : (
            <UiSkeleton className="size-72" />
          )}
        </div>
        <UiDialogFooter>
          <UiDialogClose asChild>
            <UiButton variant="outline">Schließen</UiButton>
          </UiDialogClose>
          <UiButton onClick={() => navigator.clipboard.writeText(url)}>
            <Copy data-icon="inline-start" /> Link kopieren
          </UiButton>
        </UiDialogFooter>
      </UiDialogContent>
    </UiDialog>
  );
}

export function MatchCard({
  m,
  players,
  result,
  save,
  onStatusChange,
}: {
  m: Match;
  players: Map<string, Player>;
  result: boolean;
  save: (a: number, b: number) => Promise<void>;
  onStatusChange?: (matchId: string, status: MatchEntryStatus) => void;
}) {
  const initialSaved =
    m.result_type === "played" &&
    m.team_a_games !== null &&
    m.team_b_games !== null
      ? `${m.team_a_games}:${m.team_b_games}`
      : "";
  const [a, setA] = useState<number | null>(m.team_a_games),
    [b, setB] = useState<number | null>(m.team_b_games),
    [saving, setSaving] = useState(false),
    [failedKey, setFailedKey] = useState(""),
    [lastSaved, setLastSaved] = useState(initialSaved);
  const currentKey = a !== null && b !== null ? `${a}:${b}` : "";
  const canSave = a !== null && b !== null && a !== b;
  const saved = canSave && currentKey === lastSaved;
  const failed = currentKey !== "" && currentKey === failedKey;
  const complete = saved && !saving && !failed;
  const saveState = saved
    ? "Gespeichert"
    : failed
      ? "Speichern fehlgeschlagen"
      : saving
        ? "Speichert…"
        : canSave
          ? "Speichert automatisch"
          : "Offen";
  useEffect(() => {
    setA(m.team_a_games);
    setB(m.team_b_games);
    setLastSaved(
      m.result_type === "played" &&
        m.team_a_games !== null &&
        m.team_b_games !== null
        ? `${m.team_a_games}:${m.team_b_games}`
        : "",
    );
    setFailedKey("");
  }, [m.id, m.team_a_games, m.team_b_games, m.result_type]);
  useEffect(() => {
    if (
      !shouldAutoSaveScore({
        resultMode: result,
        a,
        b,
        currentKey,
        lastSaved,
        failedKey,
        saving,
      })
    )
      return;
    if (a === null || b === null) return;
    setSaving(true);
    save(a, b)
      .then(() => {
        setLastSaved(currentKey);
        setFailedKey("");
      })
      .catch(() => setFailedKey(currentKey))
      .finally(() => setSaving(false));
  }, [a, b, currentKey, failedKey, lastSaved, result, save, saving]);
  useEffect(() => {
    if (!result) return;
    onStatusChange?.(m.id, {
      complete,
      valid: canSave,
      saved,
      saving,
      failed,
    });
  }, [canSave, complete, failed, m.id, onStatusChange, result, saved, saving]);
  const n = (id: string) => (
    <span className="player-pill">
      <i>{players.get(id)?.emoji}</i>
      <span className="player-name">{players.get(id)?.display_name}</span>
    </span>
  );
  return (
    <article
      className={cn(
        "match court-card",
        saved && "is-saved",
        saving && "is-saving",
        failed && "is-save-failed",
      )}
    >
      <header className="court-label">
        <b>{courtName(m)}</b>
        {result && (
          <span
            className={cn(
              "court-save-status",
              saved && "saved",
              saving && "saving",
              failed && "failed",
            )}
            role="status"
            aria-live="polite"
          >
            {saved ? (
              <Check aria-hidden="true" />
            ) : failed ? (
              <WarningCircle aria-hidden="true" />
            ) : saving || canSave ? (
              <ArrowClockwise
                className={cn(saving && "is-spinning")}
                aria-hidden="true"
              />
            ) : (
              <PencilSimple aria-hidden="true" />
            )}
            {saveState}
          </span>
        )}
      </header>
      <div className="match-board court-board-surface">
        <div className="score-team">
          <div className="team-players">
            {n(m.team_a_player_1_id)}
            {n(m.team_a_player_2_id)}
          </div>
        </div>
        <div
          className="score-versus"
          aria-label={`Spielstand ${a ?? "-"} zu ${b ?? "-"}`}
        >
          <strong>
            {a ?? "-"}:{b ?? "-"}
          </strong>
        </div>
        <div className="score-team">
          <div className="team-players">
            {n(m.team_b_player_1_id)}
            {n(m.team_b_player_2_id)}
          </div>
        </div>
      </div>
      {result && (
        <footer>
          <ScorePicker label="Team links" value={a} onChange={setA} />
          <b className="score-divider">:</b>
          <ScorePicker label="Team rechts" value={b} onChange={setB} />
        </footer>
      )}
    </article>
  );
}

function ScorePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const [customOpen, setCustomOpen] = useState((value ?? 0) > 6);
  useEffect(() => {
    if ((value ?? 0) > 6) setCustomOpen(true);
  }, [value]);
  return (
    <div
      className={cn(
        "score-entry",
        label.includes("links") && "is-left",
        label.includes("rechts") && "is-right",
      )}
      role="group"
      aria-label={label}
    >
      <div className="score-picker">
        {scoreValues.map((score) => (
          <button
            key={score}
            type="button"
            className={
              value === score ? "score-number selected" : "score-number"
            }
            aria-pressed={value === score}
            onClick={() => onChange(score)}
          >
            {score}
          </button>
        ))}
        <button
          type="button"
          className={
            (value ?? 0) > 6 ? "score-number selected" : "score-number"
          }
          aria-label={`${label}: mehr als 6 eintragen`}
          aria-expanded={customOpen}
          onClick={() => setCustomOpen((open) => !open)}
        >
          <Plus weight="bold" />
        </button>
      </div>
      {customOpen && (
        <UiInput
          type="number"
          min="7"
          inputMode="numeric"
          placeholder="7+"
          value={value !== null && value > 6 ? String(value) : ""}
          onChange={(event) => {
            const next = event.target.value;
            if (!next) {
              onChange(null);
              return;
            }
            const parsed = Number(next);
            if (!Number.isFinite(parsed)) return;
            onChange(Math.max(7, Math.floor(parsed)));
          }}
        />
      )}
    </div>
  );
}

export function ScoreCorrection({
  round,
  match,
  players,
  playerId,
  save,
}: {
  round: Round;
  match: Match;
  players: Map<string, Player>;
  playerId: string;
  save: (a: number, b: number) => Promise<void>;
}) {
  const savedKey =
    match.team_a_games !== null && match.team_b_games !== null
      ? `${match.team_a_games}:${match.team_b_games}`
      : "";
  const [a, setA] = useState<number | null>(match.team_a_games),
    [b, setB] = useState<number | null>(match.team_b_games),
    [editing, setEditing] = useState(false),
    [saving, setSaving] = useState(false),
    [failed, setFailed] = useState(false),
    [saved, setSaved] = useState(false);
  const currentKey = a !== null && b !== null ? `${a}:${b}` : "";
  const changed = currentKey !== "" && currentKey !== savedKey;
  const canSave = changed && a !== null && b !== null && a !== b;
  useEffect(() => {
    setA(match.team_a_games);
    setB(match.team_b_games);
    setEditing(false);
    setFailed(false);
    setSaved(false);
  }, [match.id, match.team_a_games, match.team_b_games]);
  const playerPill = (id: string) => {
    const player = players.get(id);
    return (
      <span className={id === playerId ? "selected-player" : ""}>
        <i>{player?.emoji}</i>
        {player?.display_name}
      </span>
    );
  };
  return (
    <article className="score-correction">
      <header>
        <div>
          <strong>
            Runde {round.round_number}
            {" \u00b7 "}
            {courtName(match)}
          </strong>
          <small>
            {match.result_type === "missing"
              ? "Als fehlend gewertet"
              : "Gespeichertes Ergebnis"}
          </small>
        </div>
        <div className="correction-match-actions">
          <UiBadge
            variant={
              match.result_type === "missing" ? "destructive" : "secondary"
            }
          >
            {saved
              ? "Aktualisiert"
              : match.result_type === "missing"
                ? "0:0"
                : savedKey}
          </UiBadge>
          {!editing && (
            <UiButton
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Ergebnis aus Runde ${round.round_number} bearbeiten`}
              onClick={() => {
                setEditing(true);
                setFailed(false);
                setSaved(false);
              }}
            >
              <PencilSimple />
            </UiButton>
          )}
        </div>
      </header>
      <div className="correction-teams">
        <div>
          {playerPill(match.team_a_player_1_id)}
          {playerPill(match.team_a_player_2_id)}
        </div>
        <b>
          {a ?? "-"}:{b ?? "-"}
        </b>
        <div>
          {playerPill(match.team_b_player_1_id)}
          {playerPill(match.team_b_player_2_id)}
        </div>
      </div>
      {editing && (
        <footer>
          <ScorePicker label="Team links" value={a} onChange={setA} />
          <ScorePicker label="Team rechts" value={b} onChange={setB} />
          <div className="correction-editor-actions">
            <UiButton
              disabled={!canSave || saving}
              onClick={() => {
                if (a === null || b === null || !canSave) return;
                setSaving(true);
                setFailed(false);
                void save(a, b)
                  .then(() => {
                    setSaved(true);
                    setEditing(false);
                  })
                  .catch(() => setFailed(true))
                  .finally(() => setSaving(false));
              }}
            >
              <Check data-icon="inline-start" />
              {saving ? "Speichert\u2026" : "Speichern"}
            </UiButton>
            <UiButton
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={() => {
                setA(match.team_a_games);
                setB(match.team_b_games);
                setEditing(false);
                setFailed(false);
              }}
            >
              Abbrechen
            </UiButton>
          </div>
          <small className={failed ? "save-state failed" : "save-state"}>
            {failed
              ? "Speichern fehlgeschlagen. Bitte erneut versuchen."
              : canSave
                ? "Bereit zum Speichern"
                : a === b && a !== null
                  ? "Kein Unentschieden möglich"
                  : "Spielstand wählen"}
          </small>
        </footer>
      )}
    </article>
  );
}

export function PlayerEditorHeader({
  player,
  matchCount,
  save,
  editable = true,
}: {
  player: Player;
  matchCount: number;
  save: (name: string) => Promise<void>;
  editable?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(player.display_name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setName(player.display_name);
    setEditing(false);
    setError("");
  }, [player.id, player.display_name]);
  const trimmedName = name.trim();
  const valid =
    trimmedName.length > 0 &&
    trimmedName.length <= 40 &&
    trimmedName !== player.display_name;

  return (
    <div className="correction-player">
      <i>{player.emoji}</i>
      <div className="correction-player-details">
        {editing ? (
          <form
            className="player-name-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!valid) return;
              setSaving(true);
              setError("");
              void save(trimmedName)
                .then(() => setEditing(false))
                .catch((reason) =>
                  setError(
                    reason instanceof Error
                      ? reason.message
                      : "Name konnte nicht gespeichert werden.",
                  ),
                )
                .finally(() => setSaving(false));
            }}
          >
            <UiField data-invalid={Boolean(error)}>
              <UiFieldLabel className="sr-only" htmlFor="player-display-name">
                Teilnehmername
              </UiFieldLabel>
              <UiInput
                id="player-display-name"
                value={name}
                minLength={1}
                maxLength={40}
                required
                autoFocus
                aria-invalid={Boolean(error)}
                onChange={(event) => {
                  setName(event.target.value);
                  setError("");
                }}
              />
            </UiField>
            <div className="player-name-actions">
              <UiButton type="submit" size="sm" disabled={!valid || saving}>
                <Check data-icon="inline-start" />
                {saving ? "Speichert\u2026" : "Speichern"}
              </UiButton>
              <UiButton
                type="button"
                size="sm"
                variant="ghost"
                disabled={saving}
                onClick={() => {
                  setName(player.display_name);
                  setEditing(false);
                  setError("");
                }}
              >
                Abbrechen
              </UiButton>
            </div>
            {error && <small className="player-name-error">{error}</small>}
          </form>
        ) : (
          <div className="player-name-display">
            <strong>{player.display_name}</strong>
            {editable && (
              <UiButton
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Name von ${player.display_name} bearbeiten`}
                onClick={() => setEditing(true)}
              >
                <PencilSimple />
              </UiButton>
            )}
          </div>
        )}
        <span>
          {matchCount
            ? `${matchCount} abgeschlossene Spiele`
            : "Noch keine abgeschlossenen Spiele"}
        </span>
      </div>
    </div>
  );
}

export function Clock({
  round,
  mutate,
}: {
  round: Round;
  mutate: (p: string, i: RequestInit) => Promise<void>;
}) {
  const [left, setLeft] = useState(() => getRoundSecondsLeft(round));
  useEffect(() => {
    setLeft(getRoundSecondsLeft(round));
    if (round.state !== "running" || !round.expires_at) return;
    const tick = () => {
      setLeft(getRoundSecondsLeft(round));
    };
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [
    round.id,
    round.state,
    round.duration_seconds,
    round.expires_at,
    round.paused_at,
  ]);
  if (["published", "results"].includes(round.state))
    return (
      <UiBadge
        variant={round.state === "results" ? "destructive" : "secondary"}
      >
        {round.state === "results" ? "Ergebnisse" : "Bereit"}
      </UiBadge>
    );
  return (
    <div className={cn("clock", left === 0 && "is-expired")}>
      <div className="clock-readout">
        <Timer aria-hidden="true" />
        <b role="timer" aria-label={`${left} Sekunden verbleibend`}>
          {String(Math.floor(left / 60)).padStart(2, "0")}:
          {String(left % 60).padStart(2, "0")}
        </b>
      </div>
      <span aria-live="polite">
        {left === 0
          ? "Zeit abgelaufen"
          : round.state === "paused"
            ? "Pausiert"
            : "Läuft"}
      </span>
      <div className="clock-actions">
        {round.state === "running" ? (
          <UiButton
            size="icon"
            variant="outline"
            aria-label="Runde pausieren"
            onClick={() =>
              mutate(`/admin/rounds/${round.id}/action`, {
                method: "POST",
                body: JSON.stringify({ action: "pause" }),
              })
            }
          >
            <Pause />
          </UiButton>
        ) : (
          <UiButton
            size="icon"
            variant="outline"
            aria-label="Runde fortsetzen"
            onClick={() =>
              mutate(`/admin/rounds/${round.id}/action`, {
                method: "POST",
                body: JSON.stringify({ action: "resume" }),
              })
            }
          >
            <Play />
          </UiButton>
        )}
      </div>
    </div>
  );
}

export function EventSettingsDialog({
  open,
  onOpenChange,
  duration,
  save,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  duration: number;
  save: (durationMinutes: number) => Promise<void>;
}) {
  const [draft, setDraft] = useState(duration);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setDraft(duration);
  }, [duration, open]);
  const valid = Number.isInteger(draft) && draft >= 1 && draft <= 240;

  return (
    <UiDialog open={open} onOpenChange={onOpenChange}>
      <UiDialogContent className="sm:max-w-md">
        <UiDialogHeader>
          <UiDialogTitle>Veranstaltungseinstellungen</UiDialogTitle>
        </UiDialogHeader>
        <form
          className="event-settings-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!valid || saving) return;
            setSaving(true);
            void save(draft)
              .then(() => onOpenChange(false))
              .catch(() => {})
              .finally(() => setSaving(false));
          }}
        >
          <UiFieldGroup>
            <UiField>
              <UiFieldLabel htmlFor="default-round-duration">
                Standard-Rundendauer
              </UiFieldLabel>
              <div className="duration-stepper">
                <UiButton
                  type="button"
                  size="icon-lg"
                  variant="outline"
                  aria-label="Rundendauer um 5 Minuten verringern"
                  disabled={draft <= 1 || saving}
                  onClick={() =>
                    setDraft((current) => Math.max(1, current - 5))
                  }
                >
                  <Minus />
                </UiButton>
                <UiInput
                  id="default-round-duration"
                  className="duration-stepper-input"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="240"
                  value={draft}
                  aria-invalid={!valid}
                  onChange={(event) => setDraft(Number(event.target.value))}
                />
                <UiButton
                  type="button"
                  size="icon-lg"
                  variant="outline"
                  aria-label="Rundendauer um 5 Minuten erhöhen"
                  disabled={draft >= 240 || saving}
                  onClick={() =>
                    setDraft((current) => Math.min(240, current + 5))
                  }
                >
                  <Plus />
                </UiButton>
              </div>
            </UiField>
          </UiFieldGroup>
          <UiDialogFooter>
            <UiDialogClose asChild>
              <UiButton type="button" variant="outline" disabled={saving}>
                Abbrechen
              </UiButton>
            </UiDialogClose>
            <UiButton type="submit" disabled={!valid || saving}>
              Speichern
            </UiButton>
          </UiDialogFooter>
        </form>
      </UiDialogContent>
    </UiDialog>
  );
}

export function InitialSetupGuide({
  eventId,
  activeTab,
  activePlayers,
  activeCourts,
}: {
  eventId: string;
  activeTab: EventTab;
  activePlayers: number;
  activeCourts: number;
}) {
  const participantsReady = activePlayers >= 4;
  const courtsReady = activeCourts >= 1;
  const tournamentReady = participantsReady && courtsReady;
  const instructions: Record<EventTab, string> = {
    teilnehmer: "Trage mindestens vier aktive Teilnehmer ein.",
    plaetze: "Lege die verfügbaren Plätze an und aktiviere mindestens einen.",
    dashboard: tournamentReady
      ? "Alles bereit: Jetzt kann die erste Runde ausgelost werden."
      : "Teilnehmer und Plätze müssen bereit sein, bevor du auslosen kannst.",
    bestenliste: "Die Bestenliste füllt sich nach der ersten gespielten Runde.",
  };
  const steps = [
    {
      tab: "teilnehmer" as const,
      label: "Teilnehmer",
      status: `${activePlayers} aktiv`,
      complete: participantsReady,
    },
    {
      tab: "plaetze" as const,
      label: "Plätze",
      status: `${activeCourts} aktiv`,
      complete: courtsReady,
    },
    {
      tab: "dashboard" as const,
      label: "Erste Runde",
      status: tournamentReady ? "Bereit" : "Offen",
      complete: false,
    },
  ];

  return (
    <section
      className="initial-setup-guide"
      aria-labelledby="setup-guide-title"
    >
      <div className="setup-guide-copy">
        <p className="kicker">Turniervorbereitung</p>
        <h2 id="setup-guide-title">In drei Schritten zur ersten Runde</h2>
        <p>{instructions[activeTab]}</p>
      </div>
      <ol className="setup-steps">
        {steps.map((step, index) => (
          <li key={step.tab}>
            <RouterLink
              className={cn(
                "setup-step",
                step.complete && "is-complete",
                activeTab === step.tab && "is-current",
              )}
              to={`/admin/events/${eventId}/${step.tab}`}
              aria-current={activeTab === step.tab ? "step" : undefined}
            >
              <span className="setup-step-marker" aria-hidden="true">
                {step.complete ? <Check weight="bold" /> : index + 1}
              </span>
              <span className="setup-step-copy">
                <strong>{step.label}</strong>
                <small>{step.status}</small>
              </span>
            </RouterLink>
          </li>
        ))}
      </ol>
    </section>
  );
}

function CourtPreview() {
  return (
    <img
      className="court-preview-image"
      src={courtPreview}
      alt=""
      width="384"
      height="512"
      aria-hidden="true"
    />
  );
}

export function CourtManager({
  eventId,
  courts,
  mutate,
  editable = true,
  showSetupAction = false,
  setupReady = false,
  onSetupContinue,
}: {
  eventId: string;
  courts: Court[];
  mutate: (path: string, init: RequestInit) => Promise<void>;
  editable?: boolean;
  showSetupAction?: boolean;
  setupReady?: boolean;
  onSetupContinue?: () => void;
}) {
  const [courtAdding, setCourtAdding] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [editingName, setEditingName] = useState("");
  const editingCourt = courts.find((court) => court.id === editingId);
  const activeCount = courts.filter((court) => court.active).length;
  const atCourtLimit = courts.length >= 13;
  const sortedCourts = useMemo(
    () => [...courts].sort(compareCourtsByName),
    [courts],
  );

  async function addCourt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setCourtAdding(true);
    try {
      await mutate(`/admin/events/${eventId}/courts`, {
        method: "POST",
        body: JSON.stringify({ name: new FormData(form).get("name") }),
      });
      form.reset();
    } finally {
      setCourtAdding(false);
    }
  }

  return (
    <UiCard className="control-courts">
      <UiCardHeader>
        <UiCardTitle>Plätze</UiCardTitle>
        <UiCardDescription>
          {activeCount} aktiv von {courts.length}
        </UiCardDescription>
      </UiCardHeader>
      <UiCardContent>
        {!editable && (
          <UiAlert className="configuration-lock" role="status">
            <LockKey />
            <UiAlertTitle>Plätze im Lesemodus</UiAlertTitle>
            <UiAlertDescription>
              Während der offenen Runde bleiben die aktiven Plätze sichtbar.
              Änderungen sind nach dem Rundenabschluss wieder möglich.
            </UiAlertDescription>
          </UiAlert>
        )}
        {editable && (
          <form className="court-add-form" onSubmit={addCourt}>
            <UiField>
              <UiFieldLabel className="sr-only" htmlFor="court-name">
                Platzname
              </UiFieldLabel>
              <UiInput
                id="court-name"
                name="name"
                placeholder="z. B. Halle 1"
                maxLength={40}
                disabled={courtAdding || atCourtLimit}
                aria-busy={courtAdding}
                required
              />
            </UiField>
            <div className="court-add-actions">
              <UiButton type="submit" disabled={courtAdding || atCourtLimit}>
                {courtAdding ? "Wird hinzugefügt…" : "Hinzufügen"}
              </UiButton>
            </div>
          </form>
        )}
        <div className={cn("court-balance", activeCount > 0 && "ready")}>
          {activeCount > 0 ? <Check /> : <TennisBall />}
          <span>
            {activeCount > 0
              ? `${activeCount} ${activeCount === 1 ? "Platz ist" : "Plätze sind"} für die nächste Auslosung aktiv.`
              : "Aktiviere mindestens einen Platz für die nächste Auslosung."}
          </span>
        </div>
        <div className="court-visual-grid">
          {sortedCourts.map((court) => (
            <div
              key={court.id}
              className={cn("court-visual-card", !court.active && "off")}
            >
              {editable ? (
                <button
                  type="button"
                  className="court-open"
                  aria-label={`${court.name} umbenennen`}
                  onClick={() => {
                    setEditingId(court.id);
                    setEditingName(court.name);
                  }}
                >
                  <CourtPreview />
                  <span className="court-card-label">
                    <strong>{court.name}</strong>
                  </span>
                  <PencilSimple aria-hidden="true" />
                </button>
              ) : (
                <div className="court-open">
                  <CourtPreview />
                  <span className="court-card-label">
                    <strong>{court.name}</strong>
                  </span>
                </div>
              )}
              {editable ? (
                <UiButton
                  type="button"
                  size="sm"
                  variant={court.active ? "secondary" : "outline"}
                  className={cn(
                    "court-status-button",
                    court.active && "is-active",
                  )}
                  aria-pressed={Boolean(court.active)}
                  aria-label={`${court.name} ${
                    court.active ? "deaktivieren" : "aktivieren"
                  }`}
                  onClick={() =>
                    mutate(`/admin/courts/${court.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({ active: !court.active }),
                    }).catch(() => {})
                  }
                >
                  {court.active && <Check aria-hidden="true" />}
                  {court.active ? "Aktiv" : "Aus"}
                </UiButton>
              ) : (
                <span
                  className={cn(
                    "court-read-status",
                    court.active && "is-active",
                  )}
                >
                  {court.active && <Check aria-hidden="true" />}
                  {court.active ? "Aktiv" : "Aus"}
                </span>
              )}
            </div>
          ))}
          {courts.length === 0 && (
            <p className="court-empty">
              Noch keine Plätze. Füge den ersten Spielort hinzu.
            </p>
          )}
        </div>
      </UiCardContent>
      {showSetupAction && (
        <UiCardFooter className="setup-continue">
          <UiButton size="lg" disabled={!setupReady} onClick={onSetupContinue}>
            Weiter zum Dashboard <ArrowRight data-icon="inline-end" />
          </UiButton>
        </UiCardFooter>
      )}
      <UiDialog
        open={Boolean(editingCourt)}
        onOpenChange={(open) => {
          if (!open) setEditingId("");
        }}
      >
        <UiDialogContent className="sm:max-w-md">
          <UiDialogHeader>
            <UiDialogTitle>Platz umbenennen</UiDialogTitle>
          </UiDialogHeader>
          {editingCourt && (
            <form
              className="court-edit-form"
              onSubmit={(event) => {
                event.preventDefault();
                void mutate(`/admin/courts/${editingCourt.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ name: editingName }),
                }).then(() => setEditingId(""));
              }}
            >
              <UiField>
                <UiFieldLabel htmlFor="court-edit-name">Platzname</UiFieldLabel>
                <UiInput
                  id="court-edit-name"
                  value={editingName}
                  maxLength={40}
                  onChange={(event) => setEditingName(event.target.value)}
                  autoFocus
                  required
                />
              </UiField>
              <UiDialogFooter>
                <UiDialogClose asChild>
                  <UiButton type="button" variant="outline">
                    Abbrechen
                  </UiButton>
                </UiDialogClose>
                <UiButton type="submit">Speichern</UiButton>
              </UiDialogFooter>
            </form>
          )}
        </UiDialogContent>
      </UiDialog>
    </UiCard>
  );
}
