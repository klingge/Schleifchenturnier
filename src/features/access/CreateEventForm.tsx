import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RoundPlanFields } from "@/features/admin/RoundPlanFields";
import { validRoundPlan } from "@/domain/event-rules";
import type { EventData } from "@/domain/tournament";
import { api } from "@/lib/api";
import type { RefreshSession } from "./types";

export function CreateEventForm({
  refreshSession,
  cancel,
  onPending,
}: {
  refreshSession?: RefreshSession;
  cancel?: (pending: boolean) => ReactNode;
  onPending?: (pending: boolean) => void;
}) {
  const nav = useNavigate();
  const [count, setCount] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || !validRoundPlan(count)) return;
    const fields = new FormData(e.currentTarget);
    setPending(true);
    onPending?.(true);
    setError("");
    try {
      const data = await api<EventData>("/admin/events", {
        method: "POST",
        body: JSON.stringify({
          name: fields.get("name"),
          durationMinutes: Number(fields.get("durationMinutes")),
          plannedRoundCount: count,
        }),
      });
      if (refreshSession) await refreshSession();
      void nav(`/admin/events/${data.event.id}`, { replace: !!refreshSession });
    } catch (cause) {
      // Another device may already have consumed the key, or the creation response
      // may have been lost. Re-read the assignment before offering another attempt.
      if (refreshSession) {
        try {
          const session = await refreshSession();
          if (!session.authenticated) return;
          if (session.role === "organizer" && session.eventId) {
            void nav(`/admin/events/${session.eventId}`, { replace: true });
            return;
          }
        } catch {
          /* Keep the form available for retry after connection failure. */
        }
      }
      setError((cause as Error).message);
    } finally {
      setPending(false);
      onPending?.(false);
    }
  }
  return (
    <form className="form" onSubmit={create}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="new-event-name">Name</FieldLabel>
          <Input
            id="new-event-name"
            name="name"
            required
            maxLength={100}
            disabled={pending}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="new-event-duration">
            Rundendauer in Minuten
          </FieldLabel>
          <Input
            id="new-event-duration"
            name="durationMinutes"
            type="number"
            defaultValue="20"
            min="1"
            max="240"
            required
            disabled={pending}
          />
        </Field>
        <RoundPlanFields value={count} onChange={setCount} disabled={pending} />
      </FieldGroup>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="access-form-actions">
        {cancel?.(pending)}
        <Button type="submit" disabled={pending || !validRoundPlan(count)}>
          {pending ? "Wird erstellt…" : "Turnier erstellen"}
        </Button>
      </div>
    </form>
  );
}

export function OrganizerSetup({
  refreshSession,
}: {
  refreshSession: RefreshSession;
}) {
  return (
    <div className="organizer-setup panel">
      <h1>Dein Turnier anlegen</h1>
      <p>
        Dieser Schlüssel gilt für ein Turnier. Danach könnt ihr es mit demselben
        Schlüssel auf mehreren Geräten organisieren.
      </p>
      <CreateEventForm refreshSession={refreshSession} />
    </div>
  );
}
