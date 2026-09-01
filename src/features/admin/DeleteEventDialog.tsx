import { useState } from "react";
import { Trash } from "@phosphor-icons/react";
import {
  AlertDialog as UiAlertDialog,
  AlertDialogAction as UiAlertDialogAction,
  AlertDialogCancel as UiAlertDialogCancel,
  AlertDialogContent as UiAlertDialogContent,
  AlertDialogDescription as UiAlertDialogDescription,
  AlertDialogFooter as UiAlertDialogFooter,
  AlertDialogHeader as UiAlertDialogHeader,
  AlertDialogMedia as UiAlertDialogMedia,
  AlertDialogTitle as UiAlertDialogTitle,
  AlertDialogTrigger as UiAlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { DropdownMenuItem as UiDropdownMenuItem } from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import type { EventRow } from "@/domain/tournament";

export function DeleteEventDialog({
  event,
  onDeleted,
}: {
  event: Pick<EventRow, "id" | "name">;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setDeleting(true);
    setError("");
    try {
      await api(`/admin/events/${event.id}`, {
        method: "DELETE",
        body: JSON.stringify({ confirmation: event.name }),
      });
      setOpen(false);
      onDeleted();
    } catch (x) {
      setError((x as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <UiAlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!deleting) setOpen(next);
        if (!next) setError("");
      }}
    >
      <UiAlertDialogTrigger asChild>
        <UiDropdownMenuItem
          variant="destructive"
          onSelect={(selectEvent) => selectEvent.preventDefault()}
        >
          <Trash /> Veranstaltung löschen
        </UiDropdownMenuItem>
      </UiAlertDialogTrigger>
      <UiAlertDialogContent>
        <UiAlertDialogHeader>
          <UiAlertDialogMedia>
            <Trash />
          </UiAlertDialogMedia>
          <UiAlertDialogTitle>Veranstaltung löschen?</UiAlertDialogTitle>
          <UiAlertDialogDescription>
            „{event.name}“ sowie alle Teilnehmer, Runden und Ergebnisse werden
            dauerhaft gelöscht. Diese Aktion kann nicht rückgängig gemacht
            werden.
          </UiAlertDialogDescription>
        </UiAlertDialogHeader>
        {error && <p className="delete-event-error">{error}</p>}
        <UiAlertDialogFooter>
          <UiAlertDialogCancel disabled={deleting}>
            Abbrechen
          </UiAlertDialogCancel>
          <UiAlertDialogAction
            variant="destructive"
            disabled={deleting}
            onClick={(e) => {
              e.preventDefault();
              void remove();
            }}
          >
            <Trash data-icon="inline-start" />
            {deleting ? "Wird gelöscht…" : "Endgültig löschen"}
          </UiAlertDialogAction>
        </UiAlertDialogFooter>
      </UiAlertDialogContent>
    </UiAlertDialog>
  );
}
