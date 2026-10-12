import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Copy, Key, Plus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, Loading } from "@/components/app-shell";
import { api } from "@/lib/api";
import type { OrganizerKey } from "./types";

type KeyReply = { key: string; organizerKey: OrganizerKey };
type Action = { mode: "rotate" | "revoke"; item: OrganizerKey };

export function KeyManager() {
  const [items, setItems] = useState<OrganizerKey[] | null>(null);
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [actionError, setActionError] = useState("");
  // Secrets exist only in this mounted view and are discarded on dialog close.
  const [issued, setIssued] = useState<KeyReply | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const load = useCallback(async () => {
    try {
      const response = await api<{ keys: OrganizerKey[] }>("/admin/keys");
      setItems(response.keys);
      setError("");
    } catch (cause) {
      setError((cause as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function generate(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const reply = await api<KeyReply>("/admin/keys", {
        method: "POST",
        body: JSON.stringify({ label: label.trim() }),
      });
      setIssued(reply);
      setCopyState("idle");
      setLabel("");
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setPending(false);
    }
  }
  async function confirmAction() {
    if (!action || pending) return;
    setPending(true);
    setActionError("");
    try {
      const reply = await api<KeyReply | { ok: true }>(
        `/admin/keys/${action.item.id}/${action.mode}`,
        { method: "POST", body: "{}" },
      );
      setAction(null);
      if ("key" in reply) {
        setIssued(reply);
        setCopyState("idle");
      }
      await load();
    } catch (cause) {
      setActionError((cause as Error).message);
    } finally {
      setPending(false);
    }
  }
  async function copy() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.key);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }
  function openAction(next: Action) {
    setActionError("");
    setAction(next);
  }
  return (
    <div className="overview-page key-management">
      <Button variant="ghost" asChild>
        <Link to="/admin">
          <ArrowLeft data-icon="inline-start" /> Turnierübersicht
        </Link>
      </Button>
      <div className="heading">
        <div>
          <h1>Turnierschlüssel</h1>
          <p>
            Ein Schlüssel erlaubt ein eigenes Turnier und bleibt danach der
            gemeinsame Zugang für das Organisationsteam.
          </p>
        </div>
      </div>
      <form className="key-create" onSubmit={generate}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="key-label">
              Bezeichnung <span className="optional-label">(optional)</span>
            </FieldLabel>
            <Input
              id="key-label"
              placeholder="z. B. TC Musterverein"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={100}
              disabled={pending}
            />
            <FieldDescription>
              Hilft dir, den Schlüssel später wiederzufinden.
            </FieldDescription>
          </Field>
        </FieldGroup>
        <Button type="submit" size="lg" disabled={pending}>
          <Plus data-icon="inline-start" />
          {pending ? "Bitte warten…" : "Schlüssel erzeugen"}
        </Button>
      </form>
      {error && (
        <div className="access-retry">
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button
            variant="outline"
            onClick={() => void load()}
            disabled={pending}
          >
            Liste neu laden
          </Button>
        </div>
      )}
      {items === null ? (
        !error && <Loading />
      ) : items.length === 0 ? (
        <Empty
          icon={<Key />}
          title="Noch keine Turnierschlüssel"
          text="Erzeuge einen Schlüssel und gib ihn an das Organisationsteam weiter."
        />
      ) : (
        <ul className="key-list" aria-label="Turnierschlüssel">
          {items.map((item) => {
            const deleted = item.used_at !== null && item.event_id === null;
            return (
              <li className="key-row" key={item.id}>
                <div className="key-details">
                  <strong>{item.label || "Ohne Bezeichnung"}</strong>
                  <p>
                    {deleted ? (
                      "Turnier gelöscht · Zugang dauerhaft deaktiviert"
                    ) : item.event_id ? (
                      <Link to={`/admin/events/${item.event_id}`}>
                        {item.event_name || "Turnier öffnen"}
                      </Link>
                    ) : (
                      "Noch unbenutzt · kann ein Turnier erstellen"
                    )}
                  </p>
                  <small>
                    Erzeugt am{" "}
                    {new Intl.DateTimeFormat("de-DE", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(item.created_at))}
                  </small>
                </div>
                <div className="key-row-actions">
                  <Badge
                    variant={
                      item.revoked_at || deleted ? "outline" : "secondary"
                    }
                  >
                    {deleted
                      ? "Deaktiviert"
                      : item.revoked_at
                        ? "Gesperrt"
                        : "Aktiv"}
                  </Badge>
                  {!deleted && (
                    <>
                      <Button
                        variant="outline"
                        disabled={pending}
                        onClick={() => openAction({ mode: "rotate", item })}
                        aria-label={`Schlüssel für ${item.label || "Ohne Bezeichnung"} ersetzen`}
                      >
                        Ersetzen
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={pending || !!item.revoked_at}
                        onClick={() => openAction({ mode: "revoke", item })}
                        aria-label={`Schlüssel für ${item.label || "Ohne Bezeichnung"} sperren`}
                      >
                        Sperren
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Dialog
        open={!!action}
        onOpenChange={(open) => {
          if (!open && !pending) setAction(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action?.mode === "rotate"
                ? "Schlüssel ersetzen?"
                : "Schlüssel sperren?"}
            </DialogTitle>
            <DialogDescription>
              {action?.mode === "rotate"
                ? "Der bisherige Schlüssel und laufende Anmeldungen werden ungültig. Der neue Schlüssel gibt den Zugang wieder frei; ein zugeordnetes Turnier bleibt erhalten."
                : "Das Organisationsteam verliert bei der nächsten Anfrage den Zugang. Dein Betreiberzugriff und der öffentliche Teilnehmerlink bleiben erhalten."}
            </DialogDescription>
          </DialogHeader>
          <p>{action?.item.label || "Ohne Bezeichnung"}</p>
          {actionError && (
            <Alert variant="destructive">
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setAction(null)}
            >
              Abbrechen
            </Button>
            <Button
              variant={action?.mode === "revoke" ? "destructive" : "default"}
              disabled={pending}
              onClick={() => void confirmAction()}
            >
              {pending
                ? "Bitte warten…"
                : action?.mode === "rotate"
                  ? "Schlüssel ersetzen"
                  : "Schlüssel sperren"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!issued}
        onOpenChange={(open) => {
          if (!open) {
            setIssued(null);
            setCopyState("idle");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dein Turnierschlüssel</DialogTitle>
            <DialogDescription>
              Wird nur jetzt angezeigt. Kopiere ihn und bewahre ihn sicher auf,
              bevor du dieses Fenster schließt. Wer ihn besitzt, kann das
              Turnier organisieren.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="issued-key">
                {issued?.organizerKey.label || "Turnierschlüssel"}
              </FieldLabel>
              <Input
                id="issued-key"
                className="issued-key"
                readOnly
                value={issued?.key || ""}
                autoComplete="off"
                spellCheck={false}
                onFocus={(e) => e.target.select()}
                onClick={(e) => e.currentTarget.select()}
              />
            </Field>
          </FieldGroup>
          <Button variant="outline" onClick={() => void copy()}>
            <Copy data-icon="inline-start" />
            {copyState === "copied" ? "Kopiert" : "Schlüssel kopieren"}
          </Button>
          <p role="status" className="copy-feedback">
            {copyState === "copied"
              ? "Der Schlüssel ist in deiner Zwischenablage."
              : copyState === "failed"
                ? "Kopieren nicht möglich. Markiere den Schlüssel im Feld und kopiere ihn von Hand."
                : "Du kannst denselben Schlüssel auf mehreren Geräten verwenden."}
          </p>
          <DialogFooter>
            <Button
              onClick={() => {
                setIssued(null);
                setCopyState("idle");
              }}
            >
              Fertig
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
