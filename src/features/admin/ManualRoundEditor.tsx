import { useEffect, useState } from "react";
import { useBlocker } from "react-router-dom";
import { Plus, Trash } from "@phosphor-icons/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  compareCourtsByName,
  comparePlayersByName,
} from "@/admin-dashboard-state";
import type { Court, EventData, Player, Round } from "@/domain/tournament";

type DraftCourt = {
  courtId: string;
  players: [string, string, string, string];
};
const emptyPlayers = (): DraftCourt["players"] => ["", "", "", ""];

function initialDraft(round: Round | null, courts: Court[]): DraftCourt[] {
  if (round?.state === "published")
    return round.matches.map((match) => ({
      courtId:
        match.court_id ??
        courts.find((court) => court.position === match.court_number)?.id ??
        "",
      players: [
        match.team_a_player_1_id,
        match.team_a_player_2_id,
        match.team_b_player_1_id,
        match.team_b_player_2_id,
      ],
    }));
  return courts.length
    ? [{ courtId: courts[0].id, players: emptyPlayers() }]
    : [];
}

export function ManualRoundEditor({
  data,
  onClose,
  publish,
}: {
  data: EventData;
  onClose(): void;
  publish(body: object): Promise<void>;
}) {
  // Keep the opening snapshot: a failed concurrent save must not erase a draft.
  const [snapshot] = useState(() => ({
    revision: data.event.revision,
    editingPublished: data.currentRound?.state === "published",
    courts: data.courts
      .filter((court) => court.active)
      .sort(compareCourtsByName),
    players: data.players
      .filter((player) => player.active)
      .sort(comparePlayersByName),
    initial: initialDraft(data.currentRound, data.courts),
  }));
  const [draft, setDraft] = useState<DraftCourt[]>(snapshot.initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(snapshot.initial);
  const assigned = new Set(
    draft.flatMap((court) => court.players).filter(Boolean),
  );
  const sittingOut = snapshot.players.filter(
    (player) => !assigned.has(player.id),
  );
  const usedCourts = new Set(draft.map((court) => court.courtId));
  const nextCourt = snapshot.courts.find((court) => !usedCourts.has(court.id));
  const complete =
    draft.length > 0 &&
    draft.every(
      (court) =>
        snapshot.courts.some((item) => item.id === court.courtId) &&
        court.players.every(Boolean),
    ) &&
    assigned.size === draft.length * 4 &&
    usedCourts.size === draft.length;
  const blocker = useBlocker(dirty || busy);

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (busy) {
      blocker.reset();
    } else {
      setDiscardOpen(true);
    }
  }, [blocker, busy]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function cancel() {
    if (busy) return;
    if (dirty) setDiscardOpen(true);
    else onClose();
  }

  function keepDraft() {
    setDiscardOpen(false);
    if (blocker.state === "blocked") blocker.reset();
  }

  function discardDraft() {
    setDiscardOpen(false);
    onClose();
    if (blocker.state === "blocked") blocker.proceed();
  }

  function setPlayer(courtIndex: number, slot: number, playerId: string) {
    setDraft((current) =>
      current.map((court, index) => {
        if (index !== courtIndex) return court;
        const players = [...court.players] as DraftCourt["players"];
        players[slot] = playerId;
        return { ...court, players };
      }),
    );
    setError("");
  }

  async function submit() {
    if (!complete || busy) return;
    setBusy(true);
    setError("");
    try {
      await publish({
        expectedRevision: snapshot.revision,
        matches: draft.map((court) => ({
          courtId: court.courtId,
          teamA: court.players.slice(0, 2),
          teamB: court.players.slice(2, 4),
        })),
      });
      onClose();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) cancel();
      }}
    >
      <DialogContent
        className="manual-round-dialog grid-cols-1 sm:max-w-2xl"
        showCloseButton={!busy}
      >
        <DialogHeader className="min-w-0 pr-8">
          <DialogTitle>
            {snapshot.editingPublished
              ? "Aufstellung bearbeiten"
              : "Runde zusammenstellen"}
          </DialogTitle>
          <DialogDescription>
            {snapshot.editingPublished
              ? "Änderungen ersetzen die bereits veröffentlichte Aufstellung. Bis dahin bleibt sie sichtbar."
              : "Besetze pro Platz zwei Doppel. Erst mit der Veröffentlichung sehen Teilnehmende die Aufstellung."}
          </DialogDescription>
        </DialogHeader>
        <div className="manual-round-body">
          <div className="manual-round-courts">
            {draft.map((court, courtIndex) => (
              <section
                className="manual-round-court"
                key={court.courtId}
                aria-label={`Platz ${courtIndex + 1}`}
              >
                <div className="manual-round-court-header">
                  <label>
                    Platz
                    <select
                      className="manual-select"
                      value={court.courtId}
                      disabled={busy}
                      onChange={(event) => {
                        const courtId = event.target.value;
                        setDraft((current) =>
                          current.map((item, index) =>
                            index === courtIndex ? { ...item, courtId } : item,
                          ),
                        );
                      }}
                    >
                      {snapshot.courts
                        .filter(
                          (item) =>
                            item.id === court.courtId ||
                            !usedCourts.has(item.id),
                        )
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <Button
                    className="manual-round-remove"
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    aria-label={`Platz ${courtIndex + 1} entfernen`}
                    onClick={() =>
                      setDraft((current) =>
                        current.filter((_, index) => index !== courtIndex),
                      )
                    }
                  >
                    <Trash aria-hidden="true" /> <span>Entfernen</span>
                  </Button>
                </div>
                <div className="manual-round-teams">
                  {[0, 1].map((team) => (
                    <fieldset key={team} className="manual-round-team">
                      <legend>Team {team === 0 ? "A" : "B"}</legend>
                      {[0, 1].map((player) => {
                        const slot = team * 2 + player;
                        const value = court.players[slot];
                        return (
                          <label key={slot}>
                            Spieler {player + 1}
                            <select
                              className="manual-select"
                              value={value}
                              disabled={busy}
                              onChange={(event) =>
                                setPlayer(courtIndex, slot, event.target.value)
                              }
                            >
                              <option value="">Bitte wählen</option>
                              {snapshot.players
                                .filter(
                                  (item) =>
                                    item.id === value || !assigned.has(item.id),
                                )
                                .map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.emoji} {item.display_name}
                                  </option>
                                ))}
                            </select>
                          </label>
                        );
                      })}
                    </fieldset>
                  ))}
                </div>
              </section>
            ))}
          </div>
          {nextCourt && (
            <Button
              className="manual-round-add"
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() =>
                setDraft((current) => [
                  ...current,
                  { courtId: nextCourt.id, players: emptyPlayers() },
                ])
              }
            >
              <Plus /> Platz hinzufügen
            </Button>
          )}
          <section
            className={`manual-round-sitting-out${sittingOut.length ? " has-sit-outs" : ""}`}
            aria-live="polite"
          >
            {sittingOut.length > 0 && (
              <strong>Setzen aus ({sittingOut.length})</strong>
            )}
            <p>
              {sittingOut.length
                ? sittingOut
                    .map(
                      (player: Player) =>
                        `${player.emoji} ${player.display_name}`,
                    )
                    .join(" · ")
                : "Alle aktiven Teilnehmer spielen mit."}
            </p>
          </section>
          {!complete && (
            <p className="manual-round-hint">
              Besetze mindestens einen Platz mit vier verschiedenen aktiven
              Teilnehmern.
            </p>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={cancel}
          >
            Abbrechen
          </Button>
          <Button
            type="button"
            disabled={!complete || busy}
            onClick={() => void submit()}
          >
            {busy
              ? "Wird veröffentlicht…"
              : snapshot.editingPublished
                ? "Änderungen veröffentlichen"
                : "Runde veröffentlichen"}
          </Button>
        </DialogFooter>
      </DialogContent>
      <AlertDialog
        open={discardOpen}
        onOpenChange={(open) => {
          if (!open) keepDraft();
        }}
      >
        <AlertDialogContent className="w-[calc(100%-2rem)] sm:w-full sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Aufstellung verwerfen?</AlertDialogTitle>
            <AlertDialogDescription>
              Deine Änderungen sind noch nicht veröffentlicht und gehen
              verloren.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={keepDraft}>
              Entwurf behalten
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={discardDraft}>
              Verwerfen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
