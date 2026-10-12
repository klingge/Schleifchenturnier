import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LockKey } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shell } from "@/components/app-shell";
import { api } from "@/lib/api";
import type { Session } from "./types";

export function Login({
  operator,
  notice,
  done,
}: {
  operator: boolean;
  notice: string;
  done: (session: Session) => void;
}) {
  const nav = useNavigate();
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const session = await api<Session>(
        operator ? "/auth/login" : "/auth/key-login",
        {
          method: "POST",
          body: JSON.stringify(
            operator ? { password: secret } : { key: secret.trim() },
          ),
        },
      );
      setSecret("");
      done(session);
      void nav(
        session.role === "organizer" && session.eventId
          ? `/admin/events/${session.eventId}`
          : "/admin",
        { replace: true },
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <Shell>
      <div className="login">
        <section>
          <Badge variant="secondary">Turnierleitung</Badge>
          <h1>SGA Schleifchen&shy;turnier</h1>
          <p>
            Spieler eintragen, Doppel auslosen oder selbst zusammenstellen und
            Ergebnisse direkt festhalten.
          </p>
          <p className="login-note">
            Eine zentrale Oberfläche für den gesamten Turniertag.
          </p>
        </section>
        <form className="panel" onSubmit={submit}>
          <LockKey aria-hidden="true" />
          <h2>
            {operator ? "Betreiber anmelden" : "Mit Turnierschlüssel anmelden"}
          </h2>
          {notice && (
            <Alert>
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          )}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="login-secret">
                {operator ? "Betreiberpasswort" : "Turnierschlüssel"}
              </FieldLabel>
              <Input
                id="login-secret"
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                required
                autoFocus
                disabled={pending}
                autoComplete={operator ? "current-password" : "off"}
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
                aria-describedby={operator ? undefined : "key-login-help"}
              />
              {!operator && (
                <FieldDescription id="key-login-help">
                  Dein Schlüssel öffnet dein Turnier – auch auf weiteren
                  Geräten.
                </FieldDescription>
              )}
            </Field>
          </FieldGroup>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button size="lg" type="submit" disabled={pending}>
            {pending ? "Wird angemeldet…" : "Anmelden"}
          </Button>
          <Link
            className="login-switch"
            to={operator ? "/admin" : "/admin/betreiber"}
          >
            {operator ? "Mit Turnierschlüssel anmelden" : "Betreiber anmelden"}
          </Link>
        </form>
      </div>
    </Shell>
  );
}
