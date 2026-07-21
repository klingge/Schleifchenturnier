# Stitch-Redesign

## Prompt

Diesen Prompt mit dem **Thinking-Modell** und den aktuellen Screenshots in der
Funktion **Redesign** verwenden:

```text
Redesign the admin interface of “SGA Sommerfest”, a German web application for
running a timed tennis doubles tournament at SG Arheilgen.

The organizer uses this interface on a laptop or tablet during a live local
summer event. They register and manage participants, create doubles pairings,
set the number of courts and round duration, publish pairings, run or pause the
round timer, enter results, and monitor the leaderboard. The interface must
help the organizer understand the current tournament state and the next
important action immediately, including when used outdoors and under time
pressure.

Use the uploaded screenshots as the source of truth for the existing
functionality, information, German copy, and tournament states. Preserve this
product scope. Do not remove functions and do not invent new product
functionality.

Before designing, reason about the organizer’s workflow, information
priorities, and the difference between the lobby/preparation state and a
published or running round.

Develop three genuinely different design concepts. They should explore
different information architectures and interaction approaches, not merely
different colors or surface styling. For each concept, establish one clear
design idea and carry it consistently across the relevant screens.

The experience should feel sportlich, klar, vereinsnah und eventtauglich. Use
the club logo, the real German content, and the setting of a friendly local
tennis event as context. Beyond that, you have broad creative freedom: you may
rethink the page structure, navigation, visual hierarchy, typography, color
system, spacing, components, and presentation of actions and states. Avoid
simply reskinning the current layout.

One requirement is fixed: whenever court assignments or matches are shown,
each physical court must be represented as a functional, stylized top-down
tennis court. Place the two players of Team A together on one half of the court
and the two players of Team B on the opposite half. Player names and existing
identity cues must be readable directly on or clearly attached to their
positions. The court number, team relationship, players sitting out, and the
score when relevant must remain easy to understand. You are free to decide the
court’s visual style, proportions, detail level, surrounding controls, and
responsive behavior. On tablet it may become more compact, but it must remain
recognizable as a tennis court rather than turning into a generic match card.

Show each concept for:
- the lobby and preparation state,
- a published or running round with multiple courts,
- desktop and tablet layouts.

Keep the concepts realistic and implementable as a responsive React web
application. Briefly explain the central idea, workflow benefit, and signature
element of each concept. Compare the three results, recommend the strongest
direction, and check that it remains consistent, readable in daylight, and
usable with touch input.
```

Der Prompt ist absichtlich auf Englisch formuliert, die Oberfläche und alle
Beispielinhalte bleiben jedoch deutsch.

## Empfohlener Ablauf in Stitch

1. Das **Thinking-Modell** auswählen und die aktuellen Screenshots für Lobby
   und Platzdarstellung als Kontext bereitstellen.
2. Den Prompt in **Redesign** verwenden und zunächst alle drei Konzepte
   vergleichen.
3. Die empfohlene oder bevorzugte Richtung auswählen und konsequent auf die
   übrigen Zustände übertragen:
   Lobby, veröffentlichte Paarungen, laufende oder pausierte Runde,
   Ergebniserfassung und Bestenliste.
4. Erst danach Detailkorrekturen an Typografie, Abständen, responsivem Verhalten
   und Interaktionszuständen anfordern.
5. Wenn verfügbar, zusätzlich `DESIGN.md` aus dem finalen Projekt exportieren.

## Stitch MCP mit Codex verbinden

Die Projektkonfiguration liegt in `.codex/config.toml`. Sie enthält keinen
API-Schlüssel, sondern liest ihn aus der lokalen Umgebungsvariable
`STITCH_API_KEY`.

1. Den Stitch-API-Schlüssel in den Stitch-Einstellungen erzeugen.
2. Unter Windows die Umgebungsvariable lokal setzen:

   ```powershell
   setx STITCH_API_KEY "DEIN_STITCH_API_KEY"
   ```

3. Codex vollständig beenden und neu starten, damit die neue Umgebungsvariable
   und die projektlokale MCP-Konfiguration geladen werden.
4. Das Projekt in Codex als vertrauenswürdig öffnen.
5. In der neuen Sitzung prüfen, ob der MCP-Server `stitch` und seine Tools
   verfügbar sind.

Den echten Schlüssel niemals in dieses Repository, einen Prompt oder den Chat
kopieren.

## Übergabe zur Umsetzung

Nach Auswahl des Designs reichen:

- die Stitch-Projekt-ID,
- die Namen oder IDs der finalen Screens,
- die bevorzugte Designrichtung,
- optional die exportierte `DESIGN.md`.

Über den MCP werden Screenliste, Vorschaubilder und HTML als Designreferenz
abgerufen. Das generierte HTML wird nicht ungeprüft übernommen. Die Gestaltung
wird auf die vorhandenen React-Komponenten und die bestehende
Turnier-Zustandslogik übertragen; API, Datenbank und Matchmaking bleiben
unverändert.

Falls der MCP nicht verfügbar ist, stattdessen `DESIGN.md`, vollständige
Screenshots aller Zustände und den HTML-Export gemeinsam bereitstellen.
