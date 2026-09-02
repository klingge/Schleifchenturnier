# SGA-Codebase Resources

## Knowledge

- [Technische Architektur des Repositorys](docs/ARCHITEKTUR.md)
  Aktuelle, codebasisspezifische Übersicht über Modulgrenzen, HTTP-API, Datenmodell, Sicherheit und Ergebnisführung. Verwenden für: den Einstieg in jeden projektweiten Datenfluss.
- [React: Managing State](https://react.dev/learn/managing-state)
  Offizielle Einführung in Zustandsmodellierung und Reducer. Verwenden für: Entwurf, gespeicherten Stand, Actions und die private Ergebnis-Zustandsmaschine.
- [Cloudflare: React + Vite](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/)
  Offizielle Beschreibung einer React-SPA mit Worker-API und gemeinsamem Vite-Deployment. Verwenden für: die Systemgrenze zwischen Browser, statischen Dateien und Worker.
- [Hono: Middleware](https://hono.dev/docs/concepts/middleware)
  Offizielle Erklärung des Middleware-Ablaufs. Verwenden für: Anmeldung, CSRF-Prüfung und die Reihenfolge vor einem Routen-Handler.
- [Cloudflare D1: Workers Binding API](https://developers.cloudflare.com/d1/worker-api/)
  Offizielle Referenz für vorbereitete SQL-Anweisungen, Bindings und Batch-Schreibvorgänge. Verwenden für: Datenzugriff und atomare Änderungen im Worker.
- [Zod: Basic usage](https://zod.dev/basics)
  Offizielle Einführung in Schemas und `safeParse`. Verwenden für: die Validierung nicht vertrauenswürdiger HTTP-Eingaben.
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
  Primärquelle für verhaltensorientierte React-Tests. Verwenden für: öffentliche Hook-Interfaces statt privater Hilfsfunktionen testen.
- [Vitest: Getting Started](https://vitest.dev/guide/)
  Offizielle Dokumentation des im Repository eingesetzten Test-Runners. Verwenden für: Testaufbau, asynchrone Tests und Konfiguration.

## Wisdom (Communities)

- [Hono GitHub Discussions](https://github.com/orgs/honojs/discussions)
  Projektnahe Diskussionen mit Maintainer- und Nutzererfahrung. Verwenden für: ungewöhnliche Routing- oder Middleware-Fragen, die über die Referenz hinausgehen.
- [Cloudflare Workers SDK Discussions](https://github.com/cloudflare/workers-sdk/discussions)
  Praxiswissen rund um Wrangler, das Vite-Plugin und lokale Worker-Laufzeiten. Verwenden für: reale Integrations- und Deployment-Probleme.

## Gaps

- Codebasisspezifische Erklärungen entstehen in `lessons/` und `reference/`; sie müssen bei späteren Architekturänderungen gemeinsam mit dem Code aktualisiert werden.
- Eine Community für projektbezogenes Review ist noch nicht ausgewählt. Das wird erst relevant, wenn eine konkrete Architekturentscheidung extern geprüft werden soll.
