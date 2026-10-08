# SGA Sommerfest – Frontend-Designsystem

Dieses Dokument ist die verbindliche visuelle Grundlage für das SGA-Sommerfest-Frontend. Es beschreibt ausschließlich die Oberfläche. API-Verträge, Routen, Formulardaten, Matchmaking und Backend-Verhalten bleiben davon unberührt.

## Designrichtung

Die Anwendung verbindet die klare, freundliche Informationsarchitektur und die kompakte Arbeitsweise eines Sport-Tools. Sie ist für helles Tageslicht, schnelle Bedienung auf dem Turniergelände sowie verständliche Nutzung durch Teilnehmerinnen und Teilnehmer ausgelegt.

- `DESIGN_VARIANCE 5`: eigenständige Vereinsidentität ohne dekorative Überladung
- `MOTION_INTENSITY 4`: kurze, funktionale Rückmeldungen ohne Seiteninszenierung
- `VISUAL_DENSITY 6`: kompakte Admin-Oberflächen, großzügigere öffentliche Ansicht
- ausschließlich heller Modus
- Geist Variable als einzige Schriftfamilie
- Phosphor als einzige Icon-Familie
- echtes SGA-Logo und bestehende Spieleridentitäten bleiben erhalten

## Farben

| Rolle             | Token                            | Wert                   |
| ----------------- | -------------------------------- | ---------------------- |
| Seitenhintergrund | `--bg`                           | `oklch(97% 0.012 250)` |
| Arbeitsfläche     | `--surface` / `--surface-raised` | `oklch(99% 0.004 250)` |
| Vereinsblau       | `--primary`                      | `oklch(42% 0.15 255)`  |
| Dunkelblau        | `--primary-strong`               | `oklch(30% 0.12 255)`  |
| Hellblau          | `--primary-soft`                 | `oklch(93% 0.04 250)`  |
| Primärtext        | `--ink`                          | `oklch(20% 0.04 255)`  |
| Sekundärtext      | `--muted`                        | `oklch(43% 0.04 250)`  |

Rot, Orange und Grün werden nur semantisch für Fehler, Warnungen und bestätigte Ergebnisse verwendet. Schematische Plätze in der Administration sind hellblau mit dunkelblauen Linien. Die persönliche öffentliche Zuordnung nutzt bewusst die vorhandene Terrakotta-Platzgrafik, damit die Spielsituation auf dem Platz unmittelbar erkennbar bleibt. Tennisgrün ist kein Bestandteil der visuellen Identität.

## Typografie

- Admin-Hauptüberschriften: maximal `2rem`
- öffentliche Hauptüberschriften: maximal `2.5rem` in der Standardansicht
- Kartenüberschriften: `1.15–1.55rem`, abhängig von der Hierarchie
- Fließtext: `0.9–1rem`, Zeilenhöhe mindestens `1.5`
- Beschriftungen und Statusangaben: `0.75–0.9rem`, semibold bis bold
- negative Laufweite nur bei großen Überschriften, niemals bei Fließtext

## Abstände und Radien

Das Raster verwendet ausschließlich `4, 8, 12, 16, 24, 32 und 48px`.

- Panels und Dialoge: `14–16px`
- Eingaben und Buttons: `10–12px`
- Badges: vollständig pillenförmig
- Mindestgröße wichtiger Touchziele: `44 × 44px`
- maximale Inhaltsbreite Admin: `1420px`
- maximale Inhaltsbreite Öffentlichkeit: `1040px`
- Vereinsheader: sticky, `72px` hoch

## Komponentenregeln

- Der Vereinsheader enthält Logo, Veranstaltungskontext und eine klar auffindbare Abmeldeaktion.
- Turnierstatus und Hauptaktionen werden in einer dunkelblauen Kontrollleiste gebündelt.
- Tabs behalten ihre Routen und Bezeichnungen; der aktive Tab ist als gefüllte blaue Fläche erkennbar.
- Veranstaltungen erscheinen als scanbare Listenzeilen, nicht als austauschbares Kartenraster.
- Karten dienen der Gruppierung zusammengehöriger Arbeitsinhalte. Verschachtelte Karten werden vermieden.
- Die nächste sinnvolle Turnieraktion ist visuell dominant. Sekundär- und Gefahrenaktionen bleiben erreichbar, konkurrieren aber nicht mit ihr.
- Spieler und Teams stehen auf Tennisplätzen auf gegenüberliegenden Seiten. Platznummer, Namen, Ergebnis und Aussetzerstatus müssen ohne Detailansicht erkennbar sein.
- Die öffentliche Zuordnung bleibt bei `320px` Breite ohne horizontales Scrollen lesbar.
- Fokuszustände nutzen das Vereinsblau und dürfen nicht allein über Farbtonänderung kommunizieren.

## Motion

- Buttons, Tabs und Eingaben: `180ms`
- Dialoge, Speichern, Aktualisieren und Zustandswechsel: `240ms`
- Easing: `cubic-bezier(0.16, 1, 0.3, 1)`
- erlaubte Eigenschaften: `transform`, `opacity`, `background-color`, `border-color`
- keine orchestrierten Seitenanimationen, kein dekoratives Scrollen
- `prefers-reduced-motion: reduce` verkürzt Animationen und Übergänge auf unmittelbare Zustandswechsel
- Auslosung als seltener Turniermoment: maximal `600ms` Emoji-Mischen während der Anfrage. Danach gleiten die vollständigen Admin-Platzkarten jeweils `650ms` von `48px` unterhalb ihrer Position hinein, vollständig nacheinander mit `Kartenindex × 650ms` Startversatz. Öffentlich gleitet die einzelne persönliche Platzkarte `650ms` hinein. Easing für diese Karten: `cubic-bezier(0.25, 1, 0.5, 1)`.
- Der Platz für alle Karten wird sofort reserviert, Folge-Karten bleiben bis zu ihrem Auftritt ausgeblendet. Aktionen sind unabhängig davon sofort verfügbar; beim Rundenstart erscheinen alle Karten unmittelbar. Erstbesuch, Namenswechsel und unveränderte Abrufe wiederholen die Enthüllung nicht; versteckte Tabs und reduzierte Bewegung übernehmen den Zustand unmittelbar.
- Rundenstart: einmaliger `360ms` Impuls am vorhandenen Rundensymbol beim beobachteten Wechsel derselben Runde von veröffentlicht zu laufend. Fortsetzen nach einer Pause bleibt ruhig. Eine neue Zuordnung im selben Abruf erhält ausschließlich ihre Enthüllung.
- Turnierabschluss: einmaliger `700ms` Pokalakzent in beiden Ansichten beim neu beobachteten Abschluss, mit Vorrang vor Auslosung und Start. Der Admin-Pokal ersetzt dann das Häkchen im Veranstaltungskopf. Erstes Laden einer bereits abgeschlossenen Veranstaltung bleibt ruhig. Zeitgesteuerte Bereinigung funktioniert unabhängig von Animationsereignissen.

## Responsive Regeln

- Desktop: vollständige Turnierkontrolle und kompakte Informationsdichte
- Tablet: Aktionen dürfen umbrechen, Status und nächste Aktion bleiben oberhalb der Paarungen sichtbar
- `390px`: einspaltige öffentliche Zuordnung mit mindestens 44px großen Touchzielen
- `320px`: reduzierte Headerbeschriftung, keine horizontale Überbreite, vollständig lesbare Spielerzuweisung

## Technische Grenze

Für die Gestaltung werden die lokalen UI-Komponenten unter `src/components/ui` und Radix-Primitives verwendet. `@radix-ui/themes` ist nicht Teil des Designsystems. Änderungen am Worker, an Migrationen, am Matchmaking, an API-Strukturen oder an React-Routen sind ausdrücklich ausgeschlossen.
