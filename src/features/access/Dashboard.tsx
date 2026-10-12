import { useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Archive,
  CalendarBlank,
  DotsThreeVertical,
  Key,
  Plus,
  TennisBall,
  Timer,
} from "@phosphor-icons/react";
import { Badge as UiBadge } from "@/components/ui/badge";
import { Button as UiButton } from "@/components/ui/button";
import {
  Dialog as UiDialog,
  DialogClose as UiDialogClose,
  DialogContent as UiDialogContent,
  DialogHeader as UiDialogHeader,
  DialogTitle as UiDialogTitle,
  DialogTrigger as UiDialogTrigger,
  DialogDescription as UiDialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu as UiDropdownMenu,
  DropdownMenuContent as UiDropdownMenuContent,
  DropdownMenuGroup as UiDropdownMenuGroup,
  DropdownMenuTrigger as UiDropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, Loading } from "@/components/app-shell";
import { DeleteEventDialog } from "@/features/admin/DeleteEventDialog";
import { api } from "@/lib/api";
import type { EventRow } from "@/domain/tournament";
import { CreateEventForm } from "./CreateEventForm";

export function Dashboard() {
  const [items, setItems] = useState<EventRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const load = () =>
    api<{ events: EventRow[] }>("/admin/events")
      .then((x) => setItems(x.events))
      .catch((x) => setError(x.message));
  useEffect(() => {
    void load();
  }, []);
  return (
    <div className="overview-page">
      <div className="heading">
        <div>
          <p className="kicker">Veranstaltungen</p>
          <h1>Turnierübersicht</h1>
        </div>
        <div className="overview-actions">
          <UiButton variant="outline" size="lg" asChild>
            <RouterLink to="/admin/keys">
              <Key data-icon="inline-start" /> Turnierschlüssel
            </RouterLink>
          </UiButton>
          <UiDialog
            open={open}
            onOpenChange={(next) => {
              if (!creating) {
                setOpen(next);
                if (next) {
                  setError("");
                }
              }
            }}
          >
            <UiDialogTrigger asChild>
              <UiButton size="lg">
                <Plus /> Veranstaltung
              </UiButton>
            </UiDialogTrigger>
            <UiDialogContent className="max-h-[calc(100dvh-2rem)] grid-cols-1 overflow-y-auto sm:max-w-[520px]">
              <UiDialogHeader>
                <UiDialogTitle>Neue Veranstaltung</UiDialogTitle>
                <UiDialogDescription>
                  Name und Rundenplanung für dein Turnier festlegen.
                </UiDialogDescription>
              </UiDialogHeader>
              <CreateEventForm
                onPending={setCreating}
                cancel={(pending) => (
                  <UiDialogClose asChild>
                    <UiButton
                      type="button"
                      variant="outline"
                      disabled={pending}
                    >
                      Abbrechen
                    </UiButton>
                  </UiDialogClose>
                )}
              />
            </UiDialogContent>
          </UiDialog>
        </div>
      </div>
      {error && <p className="notice error">{error}</p>}
      {items === null ? (
        error ? (
          <Empty
            icon={<Archive />}
            title="Veranstaltungen konnten nicht geladen werden"
            text={
              "Pr\u00fcfe die lokale Datenbankverbindung und versuche es erneut."
            }
          />
        ) : (
          <Loading />
        )
      ) : items.length === 0 ? (
        <Empty
          icon={<TennisBall />}
          title="Noch keine Veranstaltung"
          text="Lege das erste Turnier an und öffne danach die Lobby."
        />
      ) : (
        <div className="events" aria-label="Veranstaltungen">
          {items.map((x) => (
            <div className="event-row" key={x.id}>
              <RouterLink className="event-open" to={`/admin/events/${x.id}`}>
                <span className="event-main">
                  <strong>{x.name}</strong>
                  <span className="event-meta">
                    <small>
                      <CalendarBlank aria-hidden="true" />
                      {new Intl.DateTimeFormat("de-DE").format(
                        new Date(`${x.event_date}T12:00:00`),
                      )}
                    </small>
                    <small>
                      <TennisBall aria-hidden="true" />
                      {x.court_count ?? 0} Plätze
                    </small>
                    <small>
                      <Timer aria-hidden="true" />
                      {x.default_round_duration_seconds / 60} Minuten
                    </small>
                  </span>
                </span>
                <UiBadge
                  variant={x.status === "archived" ? "outline" : "secondary"}
                >
                  {x.status === "archived"
                    ? "Archiviert"
                    : x.finished_at
                      ? "Beendet"
                      : x.status === "lobby"
                        ? "Lobby"
                        : "Aktiv"}
                </UiBadge>
              </RouterLink>
              <UiDropdownMenu>
                <UiDropdownMenuTrigger asChild>
                  <UiButton
                    variant="ghost"
                    size="icon-lg"
                    aria-label={`Aktionen für ${x.name}`}
                  >
                    <DotsThreeVertical />
                  </UiButton>
                </UiDropdownMenuTrigger>
                <UiDropdownMenuContent align="end" className="min-w-52">
                  <UiDropdownMenuGroup>
                    <DeleteEventDialog
                      event={x}
                      onDeleted={() =>
                        setItems(
                          (current) =>
                            current?.filter((item) => item.id !== x.id) ?? null,
                        )
                      }
                    />
                  </UiDropdownMenuGroup>
                </UiDropdownMenuContent>
              </UiDropdownMenu>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
