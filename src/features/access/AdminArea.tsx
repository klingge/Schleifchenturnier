import { useCallback, useEffect, useRef, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";
import { Shell, Loading } from "@/components/app-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EventAdmin } from "@/features/admin/EventAdmin";
import { api, clearCsrfToken, onUnauthorized, setCsrfToken } from "@/lib/api";
import { Login } from "./Login";
import { Dashboard } from "./Dashboard";
import { KeyManager } from "./KeyManager";
import { OrganizerSetup } from "./CreateEventForm";
import type { Session, SessionResponse } from "./types";

function OrganizerEvent({
  eventId,
  logout,
}: {
  eventId: string;
  logout: () => Promise<void>;
}) {
  const { id } = useParams();
  return id === eventId ? (
    <EventAdmin logout={logout} operator={false} />
  ) : (
    <Navigate to={`/admin/events/${eventId}`} replace />
  );
}

export function AdminArea() {
  const location = useLocation();
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const generation = useRef(0);
  const accept = useCallback((next: SessionResponse) => {
    generation.current++;
    if (next.authenticated) setCsrfToken(next.csrf);
    else clearCsrfToken();
    setSession(next);
    setError("");
    setNotice("");
  }, []);
  const refreshSession = useCallback(async () => {
    const request = ++generation.current;
    const next = await api<SessionResponse>("/auth/session");
    if (generation.current === request) accept(next);
    return next;
  }, [accept]);
  useEffect(() => {
    const unsubscribe = onUnauthorized(() => {
      accept({ authenticated: false });
      setNotice(
        "Dein Zugang ist nicht mehr gültig. Melde dich bitte erneut an. Bei einem gesperrten oder ersetzten Schlüssel hilft dir der Betreiber.",
      );
    });
    const refresh = () => {
      void refreshSession().catch(() =>
        setError(
          "Die Anmeldung konnte nicht geprüft werden. Bitte versuche es erneut.",
        ),
      );
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      unsubscribe();
      generation.current++;
      window.removeEventListener("focus", refresh);
    };
  }, [refreshSession, accept]);
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
      accept({ authenticated: false });
    } catch {
      setError("Abmelden fehlgeschlagen. Bitte versuche es erneut.");
    }
  }
  if (!session)
    return (
      <Shell>
        {error ? (
          <div className="access-retry">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <Button
              onClick={() => {
                setError("");
                void refreshSession().catch(() =>
                  setError(
                    "Die Anmeldung konnte nicht geprüft werden. Bitte versuche es erneut.",
                  ),
                );
              }}
            >
              Erneut versuchen
            </Button>
          </div>
        ) : (
          <Loading />
        )}
      </Shell>
    );
  if (!session.authenticated)
    return (
      <Login
        key={
          location.pathname === "/admin/betreiber" ? "operator" : "organizer"
        }
        operator={location.pathname === "/admin/betreiber"}
        notice={notice}
        done={(next: Session) => accept(next)}
      />
    );
  const organizer = session.role === "organizer";
  return (
    <Shell logout={logout}>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {organizer ? (
        session.eventId ? (
          <Routes>
            <Route
              path="events/:id/*"
              element={
                <OrganizerEvent eventId={session.eventId} logout={logout} />
              }
            />
            <Route
              path="*"
              element={
                <Navigate to={`/admin/events/${session.eventId}`} replace />
              }
            />
          </Routes>
        ) : (
          <OrganizerSetup refreshSession={refreshSession} />
        )
      ) : (
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="keys" element={<KeyManager />} />
          <Route
            path="events/:id/*"
            element={<EventAdmin logout={logout} operator />}
          />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      )}
    </Shell>
  );
}
