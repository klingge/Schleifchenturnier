import { useRef, useState } from "react";
import { Minus, Plus } from "@phosphor-icons/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getEventPolicy, validRoundPlan } from "@/domain/event-rules";
import type { EventRow, Round } from "@/domain/tournament";
import { RoundPlanFields } from "./RoundPlanFields";

export type LifecycleDialogMode = "settings" | "finish" | "resume" | "archive";

export function EventLifecycleDialog({
  event,
  round,
  mode,
  onClose,
  save,
}: {
  event: EventRow;
  round: Round | null;
  mode: LifecycleDialogMode;
  onClose(): void;
  save(path: string, body: object): Promise<void>;
}) {
  const policy = getEventPolicy(event, round);
  const completed = round?.state === "completed" ? round.round_number : 0;
  const [revision] = useState(event.revision);
  const [duration, setDuration] = useState(
    event.default_round_duration_seconds / 60,
  );
  const [count, setCount] = useState(
    event.planned_round_count === null
      ? null
      : mode === "resume"
        ? Math.max(event.planned_round_count, completed + 1)
        : event.planned_round_count,
  );
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState("");
  const closed = policy.finished || policy.archived;
  const canSubmit =
    mode === "finish"
      ? policy.canFinish
      : mode === "resume"
        ? policy.canResume
        : mode === "archive"
          ? !policy.archived
          : !closed;
  const valid =
    mode === "finish" ||
    mode === "archive" ||
    ((mode === "resume" ||
      (Number.isInteger(duration) && duration >= 1 && duration <= 240)) &&
      ((!policy.canPlan && mode === "settings") ||
        validRoundPlan(count, completed)));
  const title =
    mode === "settings"
      ? "Turniereinstellungen"
      : mode === "finish"
        ? "Turnier beenden"
        : mode === "archive"
          ? "Veranstaltung archivieren"
          : "Turnier fortsetzen";
  async function submit() {
    if (submitting.current || !canSubmit || !valid) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await save(
        `/admin/events/${event.id}${mode === "settings" || mode === "archive" ? "" : `/${mode}`}`,
        {
          expectedRevision: revision,
          ...(mode === "archive" ? { status: "archived" } : {}),
          ...(mode === "settings" ? { durationMinutes: duration } : {}),
          ...(mode === "resume" || (mode === "settings" && policy.canPlan)
            ? { plannedRoundCount: count }
            : {}),
        },
      );
      onClose();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !submitting.current) onClose();
      }}
    >
      <DialogContent
        className="admin-dialog viewport-dialog sm:max-w-md"
        showCloseButton={!busy}
      >
        <DialogHeader className="min-w-0 pr-8">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {mode === "archive"
              ? `„${event.name}“ archivieren? Die öffentliche Teilnehmeransicht wird abgeschaltet. Teilnehmende können ihre Zuordnung und die Endwertung danach nicht mehr aufrufen.`
              : mode === "finish"
                ? `Das Turnier endet nach ${completed === 1 ? "einer abgeschlossenen Runde" : `${completed} abgeschlossenen Runden`}. Die Endwertung bleibt öffentlich erreichbar; du kannst das Turnier später fortsetzen.`
                : mode === "resume"
                  ? "Lege fest, wie das Turnier weitergehen soll."
                  : closed
                    ? "Die Einstellungen eines geschlossenen Turniers sind schreibgeschützt."
                    : "Plane die Dauer des Turniers und der einzelnen Runden."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="event-settings-form dialog-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <DialogBody>
            {(mode === "settings" || mode === "resume") && (
              <FieldGroup>
                {mode === "settings" && (
                  <Field>
                    <FieldLabel htmlFor="default-round-duration">
                      Standard-Rundendauer in Minuten
                    </FieldLabel>
                    <div className="duration-stepper">
                      <Button
                        type="button"
                        size="icon-lg"
                        variant="outline"
                        aria-label="Rundendauer um 5 Minuten verringern"
                        disabled={closed || busy || duration <= 1}
                        onClick={() => setDuration(Math.max(1, duration - 5))}
                      >
                        <Minus />
                      </Button>
                      <Input
                        id="default-round-duration"
                        className="duration-stepper-input"
                        type="number"
                        min={1}
                        max={240}
                        required
                        disabled={closed || busy}
                        value={Number.isNaN(duration) ? "" : duration}
                        onChange={(e) =>
                          setDuration(
                            e.target.value === ""
                              ? NaN
                              : Number(e.target.value),
                          )
                        }
                      />
                      <Button
                        type="button"
                        size="icon-lg"
                        variant="outline"
                        aria-label="Rundendauer um 5 Minuten erhöhen"
                        disabled={closed || busy || duration >= 240}
                        onClick={() => setDuration(Math.min(240, duration + 5))}
                      >
                        <Plus />
                      </Button>
                    </div>
                  </Field>
                )}
                {mode === "settings" && !policy.canPlan ? (
                  <div className="round-plan-summary">
                    <span>Turnierdauer</span>
                    <strong>
                      {event.planned_round_count === null
                        ? "Selbst beenden"
                        : `${event.planned_round_count} Runden`}
                    </strong>
                    {!closed && (
                      <p>
                        Die Rundenanzahl kannst du nach Abschluss der aktuellen
                        Runde ändern.
                      </p>
                    )}
                  </div>
                ) : (
                  <RoundPlanFields
                    value={count}
                    onChange={setCount}
                    completedRounds={completed}
                    disabled={busy}
                  />
                )}
              </FieldGroup>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              {canSubmit ? "Abbrechen" : "Schließen"}
            </Button>
            {canSubmit && (
              <Button type="submit" disabled={busy || !valid}>
                {busy
                  ? "Wird gespeichert…"
                  : mode === "settings"
                    ? "Speichern"
                    : title}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
