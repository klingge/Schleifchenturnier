# Entwicklung, Qualität und Betrieb

## Lokale Einrichtung

Voraussetzungen sind Node.js 22 oder neuer und npm. Nach dem Klonen:

```powershell
npm install
Copy-Item .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

In `.dev.vars` werden ein lokales `ADMIN_PASSWORD` und ein mindestens 32 Zeichen langes `SESSION_SECRET` gesetzt. Die Datei ist ignoriert und darf nicht versioniert werden.

## Optionale Demo-Daten

```powershell
npm run db:seed:demo
```

Das Seed-Skript ist wiederholbar und betrifft ausschließlich die lokale D1-Instanz. Es ersetzt nur die Veranstaltung mit der festen ID `portfolio-demo-event` und verwendet erfundene Namen. Die öffentliche Ansicht ist anschließend unter `/event/sommerfest-demo` erreichbar.

## Typischer Entwicklungsworkflow

1. Aktuellen Branch prüfen und lokale Änderungen respektieren.
2. Bei einer Schemaänderung eine neue nummerierte Datei unter `migrations/` ergänzen; bestehende Migrationen nicht umschreiben.
3. Verhalten zuerst mit Unit- oder Charakterisierungstests festhalten.
4. Kleine fachliche Änderungen innerhalb der bestehenden Modulgrenzen implementieren.
5. Worker-Bindings nach Konfigurationsänderungen mit `npm run types:worker` neu erzeugen.
6. `npm run check` und `npm run audit:production` ausführen.
7. Änderungen erst nach Review committen; Deployment ist ein eigener, bewusster Schritt.

## Skripte

| Befehl                            | Zweck                                               |
| --------------------------------- | --------------------------------------------------- |
| `npm run dev`                     | gemeinsamer lokaler React-/Worker-Server            |
| `npm run db:migrate:local`        | Migrationen auf lokale D1 anwenden                  |
| `npm run db:seed:demo`            | lokale, erfundene Demo-Veranstaltung anlegen        |
| `npm run types:worker`            | Bindings und Runtime-Typen aus Wrangler erzeugen    |
| `npm run format` / `format:check` | Prettier anwenden / prüfen                          |
| `npm run lint`                    | TypeScript-, Promise- und React-Hooks-Regeln prüfen |
| `npm run typecheck`               | Client, Config und Worker strikt typprüfen          |
| `npm run test:unit`               | schnelle Unit- und Charakterisierungstests in Node  |
| `npm run test:worker`             | Worker und echte D1-Migrationen in Workerd testen   |
| `npm test`                        | beide Teststufen ausführen                          |
| `npm run audit:production`        | bekannte Lücken in Produktionsabhängigkeiten prüfen |
| `npm run build`                   | optimierten Client und Worker bauen                 |
| `npm run check`                   | Format, Lint, Typen, Tests und Build zusammenfassen |

## Teststrategie

- reine Unit-Tests prüfen Matchmaking, Statusrichtlinien, Emoji-Vergabe und lokale Auswahlzustände.
- Charakterisierungstests sichern bestehende HTTP-Formate, Login/Session, manipulierte Cookies, CSRF-Grenzen, Ergebniskorrekturen und Rundenstatus.
- Worker-Integrationstests laufen mit der Cloudflare-Vitest-Integration in Workerd. Vor den Tests werden dieselben SQL-Migrationen wie im Deployment auf eine isolierte D1-Datenbank angewendet.
- visuelle QA verwendet identische Demo-Daten bei 1440, 390 und 320 Pixel Breite; maßgeblich sind Bedienabläufe und relevante sichtbare Abweichungen, keine fragile pixelgenaue Momentaufnahme.

## Continuous Integration

`.github/workflows/ci.yml` startet bei Pushes und Pull Requests. `npm ci` verwendet den Lockfile-Stand; anschließend laufen Formatprüfung, Lint, Typprüfung, Unit- und Worker-Tests, Produktions-Audit und Build als getrennt sichtbare Schritte. Ein Fehler beendet die Pipeline. CI deployt nicht.

## Eigenes Cloudflare-Deployment

1. Mit `npx wrangler login` am gewünschten Cloudflare-Konto anmelden.
2. Eine D1-Datenbank anlegen und deren ID in `wrangler.jsonc` eintragen.
3. `ADMIN_PASSWORD` und `SESSION_SECRET` über `npx wrangler secret put …` setzen.
4. Vor der Migration ein D1-Backup beziehungsweise einen Export nach den aktuellen Cloudflare-Verfahren erstellen.
5. `npm run db:migrate:remote` ausführen.
6. `npm run deploy` ausführen und die ausgegebene Version prüfen.

Produktive IDs, Secrets und Daten werden nicht im Repository dokumentiert. Das vorhandene Portfolio-Repo führt keinen dieser Schritte automatisch aus.

## Rollback

Code wird über die Cloudflare-Versions-/Deployment-Historie auf eine zuvor geprüfte Worker-Version zurückgesetzt. D1-Migrationen werden nicht rückwärts editiert: Bei einem Schemafehler folgt eine neue Vorwärtsmigration. Für Datenfehler wird der vor dem Deployment erzeugte Export in eine kontrollierte Datenbank zurückgespielt. Deshalb werden Schema-Migration und Worker-Rollout getrennt beobachtet und nicht mit ungeprüften Produktivdaten automatisiert.

## Review-Checkliste

- bleibt die öffentliche HTTP-API kompatibel?
- bleiben Statusübergänge und atomare Schreibgrenzen erhalten?
- enthält kein Commit `.dev.vars`, Secrets oder produktive Daten?
- wurden neue Bindings aus Wrangler generiert statt handgeschrieben?
- decken Tests den veränderten Pfad und mindestens einen Fehlerfall ab?
- funktionieren Admin- und Teilnehmeransicht bei 1440, 390 und 320 Pixeln?
- sind Dokumentation und Demo-Daten frei von privaten Namen und Zugangsdaten?
