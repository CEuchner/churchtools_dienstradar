# DienstRadar

ChurchTools-Extension zum Finden von Personen in einer Gruppe, die in einem bestimmten Zeitraum in bestimmten Diensten nicht aktiv waren – und zum Hinzufügen dieser Personen zu einer Follow-up-Gruppe.

DienstRadar ist eine Single-Page-Extension mit Hash-Router. Neben der Inaktivitäts-Suche bietet das Dashboard einen Überblick über anstehende und offene Dienste, Dienstanfragen mit direktem Annehmen/Ablehnen (inkl. Undo), eine eigene Dienst-Statistik und rechtegefilterten Schnellzugriff auf die anderen Module. **Version: 1.1.0**

## Features

### Dashboard

- **Hero mit nächstem Event** – großer Datum-Block, Eventname mit Countdown-Badge („heute"/„morgen"/„in X Tagen"), lange Datumszeile und alle zugesagten Dienste als Pills; „Event aufrufen" öffnet das Event in ChurchTools (neuer Tab)
- **Anfragen** – offene Dienstanfragen (dedizierter Endpunkt), mit „Angefragt von …", Annehmen/Ablehnen direkt im Dashboard; nach Erfolg erscheint eine Undo-Meldung mit „Rückgängig"-Button (15 s), danach werden alle Karten frisch geladen; die Karte verschwindet, wenn es keine offenen Anfragen gibt; „Zum Event" als Button im Secondary-Stil, die Ablehnen/Annehmen-Gruppe bricht als Ganzes um
- **Anstehende Dienste** – alle Termine mit eigenen zugesagten Einteilungen, chronologisch, pro Event alle Dienste aufgelistet; der „Event aufrufen"-Button floatet rechts, der Text umfließt ihn; **Auf-/Zuklappen** – ab mehr als drei Events erscheint „Alle anzeigen (X)", der Klapp-Zustand bleibt bei Zeitraum-Wechsel und automatischer Aktualisierung erhalten und setzt sich beim Verlassen der Seite zurück
- **Offene Dienste** – unbesetzte, sichtbare Dienste mit Zeitraum-Quick-Buttons (14/30/60/90 Tage, Default 60); Dienste als hervorgehobene Pills, sortiert nach den Dienst-Stammdaten (`sortKey`); „Zum Event" öffnet ChurchTools in neuem Tab; **derselbe Auf-/Zuklappen-Mechanismus** (nach dem Zeitraum-Filter)
- **Meine Statistik** – eigene vergangene Dienste als Säulen- oder Liniendiagramm mit Zeitraum-Quick-Buttons (4/8/12 W, 6 M, 12 M) und **drei Kumulierungsmodi** (Dienste / Events / Tage); Y-Achse mit Tick-Labels und feinen Gitterlinien (auch im Dark Mode sichtbar); Hover-**und Klick-Fixierung**: das Detail-Tooltip (Datum, Dienst, Event) erscheint beim Hovern und bleibt nach Klick stehen, bis ein Klick irgendwo anders es löst – so funktioniert es auch auf Touch-Geräten; Zeitgrenzen liegen bewusst am Bucket-Anfang, sodass der älteste Monat/die älteste Woche vollständig zählt
- **Schnellzugriff** – Sprungkarten zu den anderen Modulen (Inaktivität, Statistiken, Einstellungen); **rechtegefiltert** über `canAccessPage()` – nicht berechtigte Module erscheinen nicht, und ohne jegliche Berechtigung wird die Karte komplett ausgeblendet
- **Automatische Aktualisierung** – das Dashboard fragt alle 15 s `GET /pollfornews` nach Änderungen an Diensteinteilungen ab und lädt nur bei echten Änderungen die Daten neu; im Hintergrund-Tab wird nicht gepollt, nach der Rückkehr sofort; während eines offenen Undo-Fensters pausiert die Aktualisierung
- **Zwei getrennte Datenquellen** – eigene Events (nur die Events, an denen die Person beteiligt ist, 13 Monate zurück + Zukunft) für Hero, Anstehende Dienste und Statistik; Events mit Einteilungen (3-Monats-Fenster) für die offenen Dienste. Dadurch bleibt das Dashboard auch bei großem Event-Bestand schnell
- **Drei Spalten** (`2fr 2fr 3fr`) – Spalte 3 rutscht bei unter 1000px unter 1+2 (später als der Sidebar-Breakpoint, weil die Sidebar bei 1200px dem Content Platz zurückgibt), darunter alles gestapelt

### Inaktivitäts-Suche

- **Gruppen-Autocomplete** – Texteingabe mit Echtzeit-Filterung und Tastaturnavigation (Pfeiltasten, Enter, Escape); Auswahl per Tastatur **und** Maus schließt die Vorschlagsliste, die beim Öffnen von rechts einslidet
- **Rechtebasierte Dienst-Auswahl** – nur Dienste sichtbar, für die der Nutzer berechtigt ist (auf Ebene der Dienstgruppen ausgewertet)
- **Zeitraum-Filter** – Schnellbuttons (-12M bis +12M bzw. Heute) oder freie Datumswahl, Standard: -6M bis +12M
- **Smarte Suche** – findet Mitglieder, die im Zeitraum **keinen** der gewählten Dienste wahrgenommen haben
- **Sammel-Aktion** – mehrere gefundene Personen gleichzeitig in eine Zielgruppe hinzufügen (per Modal mit Autocomplete)
- **E-Mail-Anzeige** – gefundene Personen mit klickbarem `mailto:`-Link

### Allgemein

- **Seiten-Rechteverwaltung** – der Zugriff auf Inaktivität, Statistiken und Einstellungen wird über die ChurchTools-Rechteverwaltung gesteuert (KV-Kategorien, siehe Rechte-Modell); nicht berechtigte Nutzer sehen die Menüpunkte nicht und erhalten beim direkten URL-Aufruf eine „Kein Zugriff"-Karte
- **Buttons im ChurchTools-Stil** – einheitliches Button-Vokabular über die ganze Extension: neutral-weiß mit Rand und dezentem Schatten für wählbare/sekundäre Aktionen (Dark Mode: eine Stufe dunkler als die Karte), kräftiges Blau für die Hauptaktion bzw. den ausgewählten Zustand der Schnellauswahl-Buttons
- **Toast-Benachrichtigungen** – Loading persistent mit Spinner, Erfolg nach 5 s, Fehler nach 10 s, jeweils mit Fortschrittsbalken in passender Farbe; Aktions-Toasts mit „Rückgängig"-Button (15 s); Toasts kollabieren beim Schließen animiert, sodass die darunterliegenden sanft nachrutschen
- **Tab-Titel** – zeigt Seite und Gemeinde-Namen (z. B. „Inaktivität · DienstRadar · Chris - Testsystem")
- **Content-Breiten** – Seiten wählen ihre Arbeitsbreite (`dr-content-narrow` = 800px zentriert, oder volle Breite)
- **Responsive** – Sidebar wird unter 1200px zum Burger-gesteuerten Drawer; Nav slidet beim Übergang zum Desktop-Layout ein
- **Dark Mode** – automatisch über die ChurchTools-Theme-Tokens

## Projektstruktur

```
src/
├── api/                          # Wiederverwendbare ChurchTools-Zugriffe
│   ├── client.ts                 # fetchAllPages mit Pagination-Guards
│   ├── permissions.ts            # Rechte laden (global + gruppenintern)
│   ├── access-control.ts         # Seiten-Rechteverwaltung (KV-Kategorien)
│   ├── servicerequests.ts        # Dienstanfragen (lesen, accept/decline/undo)
│   ├── pollfornews.ts            # Änderungsabfrage fürs Dashboard-Polling
│   ├── person-events.ts          # Events einer Person (eigene Datenquelle)
│   ├── events.ts                 # Events mit Einteilungen (Normalisierung des
│   │                             #   dokumentierten include=event_services)
│   ├── groups.ts                 # Gruppen, Mitglieder, addPersonsToGroup
│   ├── services.ts               # Dienste, Dienstgruppen
│   └── info.ts                   # Instanz-Info (siteName) für den Tab-Titel
├── components/                   # Geteilte UI-Bausteine (seitenunabhängig)
│   ├── Header.ts                 # Titelzeile, Navigation (rechtegefiltert), Burger-Toggle
│   ├── icons.ts                  # Zentrale SVG-Sammlung
│   ├── toast.ts                  # showStatus / showActionToast / hideStatus / clearStatusToasts
│   ├── autocomplete.ts           # Wiederverwendbare Vorschlagsliste
│   └── form-controls.ts          # Dienst-Checkboxen, Quick-Date-Buttons
├── features/
│   ├── dashboard/                # Fachlogik des Dashboards (modular, < 300 Zeilen/Datei)
│   │   ├── index.ts              # Markup + init/destroy-Orchestrierung
│   │   ├── state.ts              # Gesamter veränderlicher Zustand an einem Ort
│   │   ├── format.ts             # Datum-/Escaping-/URL-Helfer
│   │   ├── data.ts               # Abruf-/Cache-Schicht (zwei Event-Quellen, Services)
│   │   ├── derive.ts             # Ableitungen (eigene Dienste, offene Dienste)
│   │   ├── cards.ts              # Karten-Render-Funktionen
│   │   ├── controls.ts           # Polling, reloadAll, Delegation-Listener, Undo
│   │   ├── statistics.ts         # Aggregation (3 Kumulierungsmodi) + Buckets
│   │   ├── stats-chart.ts        # SVG-Diagramm in echten Pixeln
│   │   └── stats-ui.ts           # renderStats, Tooltip, ResizeObserver
│   └── inactivity/               # Fachlogik der Inaktivitäts-Seite
│       ├── state.ts              # Seiten-State + getElements()
│       ├── visibility.ts         # Adapter auf die geteilte Sichtbarkeitslogik
│       ├── data.ts               # Paralleles Laden der Stammdaten
│       ├── search.ts             # Suchlogik (inaktive Mitglieder)
│       ├── ui.ts                 # Rendering von Diensten und Ergebnissen
│       ├── listeners.ts          # Verdrahtung + Aufräumfunktion
│       └── index.ts              # render() / init() / destroy()
├── pages/                        # Dünne Seitenmodule für den Router
│   ├── Dashboard.ts, Inactivity.ts, Statistics.ts, Settings.ts
├── router/router.ts              # Hash-Router mit Lebenszyklus und Rechteprüfung
├── styles/                       # CSS auf CT-Tokens, nach Bausteinen getrennt
│   ├── base.css                  # Reset, Badge/Empty-State, Keyframes
│   ├── layout.css                # Root, Header, Nav, Content, Cards, Breiten
│   ├── form.css                  # Felder, Buttons, Autocomplete, Modal
│   ├── toast.css                 # Toasts (Root-Level, außerhalb .dr-root)
│   ├── dashboard.css             # Dashboard: Grid, Hero, Responsive
│   ├── dashboard-cards.css       # Dashboard: Karteninhalte, Pills, Anfragen, Quick-Actions
│   ├── dashboard-stats.css       # Dashboard: Statistik-Diagramm, Tooltip, Layout
│   └── inactivity.css            # Seitenspezifisches Layout
├── utils/
│   ├── base.ts                   # BASE-URL + routeHref()
│   ├── service-visibility.ts     # Geteilte Sichtbarkeitslogik (Dienstgruppen)
│   ├── ct-types.d.ts             # Generierte ChurchTools-API-Typen
│   ├── kv-store.ts               # KV-Store-Zugriff (Kategorien, Datenwerte)
│   └── reset.css                 # Nur Development (simuliert CT-Umgebung)
└── main.ts                       # Einstieg: Login, Rechte, Layout, Router-Start
```

## Architektur-Prinzipien

### Seiten-Lebenszyklus

Der Router erwartet pro Seite drei optionale Exporte:

```ts
export const title: string;             // Tab-Titel (optional)
export default render;                  // HTML-String für .content
export function init(): Promise<void>;  // nach dem Einsetzen ins DOM
export function destroy(): void;        // vor dem Austausch des Markups
```

- `init()` ist der einzige Zeitpunkt, an dem DOM-Referenzen aufgelöst werden (`getElements()` ist bewusst eine Funktion, kein eingefrorenes Objekt) – so zeigen Referenzen nach einem Seitenwechsel nie auf abgehängte Knoten.
- `init()` ist **idempotent**: Ein erneuter Aufruf räumt zuerst die vorherige Instanz auf (Listener, State), bevor sie neu aufbaut. Ein `instanceId`-Zähler verhindert zudem, dass ein während des Datenladens veralteter Durchlauf noch Elemente oder State verändert.
- `destroy()` räumt alle Listener, Timer und Observer ab (Delegation-Listener, Polling und der ResizeObserver des Dashboards eingeschlossen).
- Ein Token-Guard im Router verwirft veraltete Rendering-Durchläufe bei schnellem Routenwechsel.

### Logik von Seiten getrennt

Wiederverwendbare Zugriffe liegen in `src/api/`, geteilte UI-Bausteine in `src/components/`, geteilte Fachlogik (z. B. die Sichtbarkeitsauswertung) in `src/utils/`. Die Features konsumieren diese Bausteine, ohne Code zu duplizieren. Das Dashboard folgt demselben Muster wie die Inaktivitäts-Seite: `pages/Dashboard.ts` ist ein dünnes Weiterleitungsmodul, die gesamte Logik liegt in `src/features/dashboard/` – der veränderliche Zustand zentral in `state.ts` als Objekt, damit die Module ohne zirkuläre Importe auf ihn zugreifen können.

### Dashboard-Datenfluss

Das Dashboard lädt **zwei getrennte Quellen parallel**: eigene Events über `GET /persons/{personId}/events` (nur Events, an denen die Person beteiligt ist – klein, camelCase, ohne Pagination; Grundlage für Hero, Anstehende Dienste und Statistik) und Events mit Einteilungen über `GET /events` mit `include=event_services` (nur 3-Monats-Fenster; Grundlage für die offenen Dienste – der Response-Key `event_services` wird in `api/events.ts` auf `eventServices` normalisiert, sodass nur eine Stelle vom Feldnamen abhängt). Nach Annehmen/Ablehnen/Undo und nach einer Änderungs-Meldung des Pollings werden beide Quellen und die Anfragen neu geladen und alle Karten neu gebaut – ein gemeinsamer Weg (`reloadAll()`). Die Abfrage läuft über den dokumentierten Endpunkt `GET /pollfornews` (`domain_types: event_service`) – im Leerlauf winzige Requests, teure Abrufe nur bei echten Änderungen.

### Statistik-Diagramm

Das Diagramm ist ein handgebautes SVG in **echten Pixeln** (`width`/`height`/`viewBox` = gemessene Kartenbreite) – es wird nie vom Browser skaliert. Breitenänderungen rendert ein **ResizeObserver** auf der Karte neu (rAF-Throttle + 8px-Schwelle): Balken halten eine feste angenehme Breite (24px), solange der Platz reicht, rücken sonst enger zusammen (kein Überlappen) und schrumpfen erst bei echtem Breitenmangel – dann erst sinkt auch die Höhe. Die Schrift bleibt immer in Token-Größe. Bei sehr breiten Karten (≥ 800px Innenbreite, Container-Query) stehen die Button-Gruppen **neben** dem Diagramm. Gitterlinien und Achsen nutzen `gray-interactive` mit Opacity, damit sie in beiden Themes sichtbar bleiben.

### CSS

Alle Werte stammen aus den ChurchTools-Theme-Tokens (`--color-*`, `--text-*`, `--radius-*`, `--spacing`) mit aufgelösten Tailwind-Fallbacks für den Standalone-Betrieb. Eigene Dark-Mode-Regeln sind nicht nötig – die Tokens schalten selbst um. Die Toasts werden am `<body>` gerendert und sind daher die einzige Ausnahme ohne `.dr-root`-Scope.

**Breakpoints** sind bewusst entkoppelt und an beiden Stellen kommentiert:

- `48rem` (768px) – Formular-Layout: zweispaltig → gestapelt (`inactivity.css`); Dashboard: alles gestapelt (`dashboard.css`)
- `62.5rem` (1000px) – Dashboard-Grid: Spalte 3 rutscht unter 1+2 (`dashboard.css`)
- `75rem` (1200px) – Sidebar: Spalte → Burger-Drawer (`layout.css`)

## Rechte-Modell

### Seiten-Rechteverwaltung (Zugriff auf die Extension-Seiten)

Der Seitenzugriff wird über die **ChurchTools-Rechteverwaltung** gesteuert – das Extension-Modul legt dafür KV-Kategorien an, die dort berechtigt werden:

| Recht | Wirkung |
|---|---|
| `view` („DienstRadar sehen") | öffnet das Modul überhaupt → Dashboard ist damit für alle berechtigt |
| `view custom category` auf „Inaktivität" | schaltet `#/inactivity` frei |
| `view custom category` auf „Statistiken" | schaltet `#/statistics` frei |
| `view custom category` auf „Einstellungen" | schaltet `#/settings` frei |

Die drei Kategorien sind leere Shells, deren einziger Zweck ist, in der Rechteverwaltung berechtigbar zu sein. Die Prüfung läuft über `GET /permissions/global` → `dienstradar['view custom category']` (Kategorie-ID-Liste) und wird zentral in `api/access-control.ts` ausgewertet (`canAccessPage()`). Dieselbe Prüfung filtert auch die **Schnellzugriff**-Karten im Dashboard.

**Regeln:**

- Das Kategorie-Recht setzt `view` voraus – ohne Modul-Recht geht nichts.
- Fehlgeschlagenes Laden → **fail-closed**: kategorisierte Seiten bleiben zu, das Dashboard geht auf.
- **Kategorien werden nur angelegt**, wenn der Nutzer **beide** Rechte hat: `administer custom modules` (churchcore) **und** `create custom category` (dienstradar). Das verhindert, dass Nutzer ohne Create-Recht sinnlose Requests senden – und dass berechtigte Nutzer über die rechtegefilterte Kategorien-Liste Duplikate anlegen und sich so Rechte erschleichen.
- Die Kategorien-Liste der API ist rechtegefiltert: Eine „fehlende" Kategorie kann auch nur unsichtbar sein. Nicht sichtbare Kategorien sperren die zugehörige Seite (fail-closed) und erzeugen eine Konsole-Warnung.
- Rechte-Änderungen werden einmal pro Session geladen – nach Änderungen in der Rechteverwaltung ist ein Reload nötig.

### Dienst-Sichtbarkeit (Inhalt der Seiten)

Die Sichtbarkeit von Diensten wird auf Ebene der **Dienstgruppe** ausgewertet (`utils/service-visibility.ts`, geteilt zwischen Dashboard und Inaktivität): Wer eine Dienstgruppe sehen darf, sieht alle ihre Dienste. Prüfungen sind additiv (ODER) und in dieser Reihenfolge aktiv:

1. **`edit servicegroup`** (global) – wer eine Dienstgruppe bearbeiten darf, darf sie sehen und nutzen
2. **`+entry all`** (gruppenintern) – der Nutzer muss in mindestens einer Gruppe dieses Rechts besitzen, die einem Dienst der Dienstgruppe zugeordnet ist
3. **`+entry free`** (gruppenintern) – für **offene Dienste** zusätzlich: wer sich in der Dienstgruppe selbst eintragen darf, sieht deren unbesetzte Dienste (ausschließlich gruppenintern – das globale Recht reicht hier bewusst nicht)

**Weiter vorbereitete, aktuell deaktivierte Prüfungen** (als Kommentar an Ort und Stelle):

- `serviceGroup.viewAll` (öffentliche Dienstgruppe) – `utils/service-visibility.ts`
- Global `view servicegroup` – wird bereits geladen (`globalServiceGroupIds`), aber nicht ausgewertet
- `+view service` / `+edit service` (gruppenintern) – `api/permissions.ts` (Historie aus der Vorgänger-Extension „Karteileichen")

Dienste ohne `serviceGroupId` gelten als ungültiger Datenzustand und werden ausgeblendet.

## API-Endpunkte

- `GET /info` – Instanz-Name (`siteName`) für den Tab-Titel
- `GET /whoami` – angemeldete Person (ID als Match-Schlüssel für Einteilungen)
- `GET /persons/{personId}/events?from=...` – alle Events, an denen eine Person beteiligt ist (ab `from`, Vergangenheit + Zukunft; liefert `isAccepted`, paginiert nicht, Einteilungen unter `eventServices` in camelCase) – Datenquelle für Hero, Anstehende Dienste und Statistik
- `GET /events?from=...&to=...&direction=forward&canceled=false&include=event_services` – Termine inkl. Einteilungen (dokumentierter Parameter `event_services`; der Response-Key wird auf `eventServices` normalisiert; Limit 100 pro Seite, `to` ist exklusiv und wird intern +1 Tag aufgeschlagen) – nur 3-Monats-Fenster, Datenquelle der offenen Dienste
- `GET /pollfornews?domain_types[]=event_service&since=...` – Änderungsabfrage fürs Dashboard-Polling (liefert im Leerlauf ein leeres Array; `meta.lastPollDate` als `since` für den nächsten Abruf)
- `GET /groups?only_my_groups=true` – eigene Gruppen für Rechteprüfungen
- `GET /permissions/global` – Modul-Rechte (`view`, `view custom category`), `view servicegroup`, `edit servicegroup`
- `GET /permissions/internal/groups` – gruppeninterne Rechte (`+entry all`, `+entry free`)
- `GET /groups?limit=200&page=X` – alle Gruppen
- `GET /groups/{id}/members?personFields[]=email&personFields[]=firstName&personFields[]=lastName` – Mitglieder
- `GET /servicegroups?limit=200&page=X` – Dienstgruppen
- `GET /services` – Dienste (Endpunkt ohne Pagination)
- `GET /persons/{personId}/servicerequests` – Dienstanfragen einer Person (mit eingebetteten `serviceName` und `event`)
- `POST /events/{eventId}/servicerequests/{requestId}/accept` – Anfrage annehmen
- `POST /events/{eventId}/servicerequests/{requestId}/decline` – Anfrage ablehnen
- `POST /events/{eventId}/servicerequests/{requestId}/undo` – Annahme/Ablehnung zurücknehmen (Body: `{ personId, comment: null }` – `personId` ist Pflicht)
- `PUT /groups/{id}/members/{personId}` – Person hinzufügen (mit `only_add: true`; bereits Mitglied → 403 mit sprechender Meldung, wird separat gezählt)
- `GET/POST /custommodules…` – KV-Store (Modul, Kategorien; Anlage nur mit Admin-Gate, siehe Rechte-Modell)

## Entwicklung

### Setup

```bash
npm install
npm run dev
```

`.env` (nicht in Git):

```
VITE_BASE_URL=https://your-instance.church.tools
VITE_USERNAME=your-username
VITE_PASSWORD=your-password
VITE_KEY=dienstradar
```

Für lokales Development CORS in ChurchTools konfigurieren: *Systemeinstellungen → Integrations → API → Cross-Origin Resource Sharing*, Dev-URL (z. B. `http://localhost:5173`) eintragen. Bei Safari-Problemen: Vite-Proxy + HTTPS via mkcert (Details in der Boilerplate-README).

### Build & Deploy

```bash
npm run build    # Produktion nach dist/
npm run deploy   # Build + ZIP nach releases/ (index.html und assets/ im Archiv-Root)
```

### Typ-Prüfung

```bash
npx tsc --noEmit
```

## Nutzung

### Dashboard

1. Hero zeigt dein nächstes Event mit Countdown und deinen zugesagten Diensten
2. **Anfragen** (Spalte 1, oben): Annehmen oder Ablehnen – danach erscheint eine Undo-Meldung mit „Rückgängig" (15 s); alle Karten aktualisieren sich automatisch; ohne offene Anfragen steht die Karte nicht da
3. **Anstehende Dienste** (Spalte 1, darunter): deine zugesagten Einteilungen, chronologisch – ab mehr als drei Events per „Alle anzeigen (X)" aufklappen
4. **Offene Dienste** (Spalte 2): unbesetzte Dienste im gewählten Zeitraum (Quick-Buttons 14/30/60/90 Tage) – „Zum Event" öffnet ChurchTools zum Eintragen in neuem Tab; ebenfalls aufklappbar
5. **Meine Statistik** (Spalte 3): eigene vergangene Dienste im gewählten Zeitraum – Kumulierung umschalten (Dienste / Events / Tage), Diagrammform (Säulen/Linien); Hover oder Klick auf eine Säule zeigt die einzelnen Einteilungen (Klick fixiert bis zum Klick irgendwo anders – auch für Touch)
6. **Schnellzugriff** (Spalte 3): Sprungkarten zu Inaktivität, Statistiken und Einstellungen – nur die Module, für die du berechtigt bist
7. Die Karten aktualisieren sich **automatisch**, wenn sich in ChurchTools etwas an den Diensteinteilungen ändert (z. B. wer sich in einen offenen Dienst einträgt)

### Inaktivität

1. Gruppe über das Suchfeld wählen (Autocomplete – per Maus oder Tastatur)
2. Dienste auswählen – aufklappbare Dienstgruppen mit Master-Checkbox (alle/keine/teilausgewählt)
3. Zeitraum per Schnellbuttons oder Datumsfelder setzen (Standard: -6M bis +12M)
4. „Inaktive finden" – Ergebnisliste mit Name, E-Mail und Auswahl-Checkbox
5. Personen wählen (oder „Alle auswählen") → „Zu Gruppe hinzufügen" → Zielgruppe im Modal wählen → „Hinzufügen"
6. Ergebnis-Meldung differenziert: erfolgreich / bereits Mitglied / keine Berechtigung / sonstige Fehler

„Zurücksetzen" leert alle Felder und stellt den Standard-Zeitraum wieder her.

## Troubleshooting

| Problem | Ursache/Lösung |
|---|---|
| „Kein Zugriff"-Karte bei einer Seite | Dem Nutzer fehlt `view` oder das `view custom category`-Recht der Seite – Rechte in der ChurchTools-Rechteverwaltung prüfen; danach Reload (Rechte werden einmal pro Session geladen) |
| Menüpunkt fehlt | Gleiches Recht wie oben – nicht berechtigte Seiten werden im Menü ausgeblendet |
| Schnellzugriff-Karte fehlt ganz oder zeigt weniger Module | Dieselbe Rechteprüfung wie oben – nur berechtigte Module erscheinen; ohne jegliche Berechtigung wird die Karte ausgeblendet (gewollt) |
| Anfragen-Karte fehlt | Keine offenen Anfragen – die Karte blendet sich dann bewusst komplett aus; sie erscheint automatisch wieder, sobald eine Anfrage eintrifft (Polling) |
| Konsole: Kategorie „… konnte nicht angelegt werden" | Die Kategorie existiert nicht (oder ist für den Nutzer unsichtbar) und der Nutzer hat nicht beide Setup-Rechte (`administer custom modules` + `create custom category`) – einmalig als Admin ausführen oder Rechte vergeben |
| „Keine Dienste verfügbar" | Der Nutzer hat weder `edit servicegroup` noch in einer Gruppe `+entry all` – Rechte in ChurchTools prüfen |
| Offene Dienste leer, obwohl erwartet | Für die Sichtbarkeit offener Dienste reicht zusätzlich auch `+entry free` – prüfen, ob die Dienstgruppe korrekt berechtigt ist |
| Statistik zeigt keine Daten | Gezählt werden nur eigene **zugesagte** Einteilungen in der **Vergangenheit** innerhalb des gewählten Zeitraums – Zeitraum-Button prüfen und „Tage"/„Events" zum Gegenchecken nutzen |
| Dashboard aktualisiert sich nicht automatisch | Das Polling pausiert bewusst während eines offenen Undo-Fensters und im Hintergrund-Tab; bei anhaltendem Ausfall den `pollfornews`-Request im Netzwerk-Tab prüfen (bei Fehler fällt die Seite auf manuelles Neuladen zurück, funktioniert aber weiterhin) |
| Diagramm reagiert nicht auf Fenstergrößenänderung | Der ResizeObserver rendert bei ≥ 8px Änderung neu – erst nach dem ersten Rendern aktiv; falls dauerhaft tot, Konsole auf Fehler beim Karten-Init prüfen |
| Suche liefert keine Mitglieder | Gruppenselektion und Mitgliederrecht der ausgewählten Gruppe prüfen |
| „Keine Berechtigung dieser Gruppe Personen hinzuzufügen" | Recht zum Bearbeiten der **Zielgruppe** fehlt |
| Toasts erscheinen nicht | Prüfen, ob alle CSS-Imports in `main.ts` stehen; Keyframes testen: `[...document.styleSheets].flatMap(s => [...s.cssRules]).filter(r => r instanceof CSSKeyframesRule).map(r => r.name)` |
| Konsole: `Element #… nicht gefunden` | Markup der Seite wurde nicht gerendert – Router/Seitenmodul prüfen |

## Changelog

- **v1.1.0** – Rechteverwaltung und Dashboard: Seitenzugriff über die ChurchTools-Rechteverwaltung (KV-Kategorien, Router-Sperre mit „Kein Zugriff"-Karte, Menü-Filterung, Setup-Gate über `administer custom modules` + `create custom category`); Dashboard mit Hero (nächstes Event + Countdown), Anfragen mit Annehmen/Ablehnen und Undo-Meldung (15 s, Karte blendet sich ohne Anfragen aus), anstehenden eigenen Diensten und offenen Diensten mit Zeitraum-Quick-Buttons und Auf-/Zuklappen (Klapp-Zustand bleibt bei Aktualisierungen erhalten), eigener Statistik (drei Kumulierungsmodi „Dienste/Events/Tage", Säulen/Linien als 1:1-Pixel-SVG mit Y-Achse, Gitterlinien, Hover-/Klick-Tooltip und ResizeObserver) sowie rechtegefiltertem Schnellzugriff; geteilte Sichtbarkeitslogik (`utils/service-visibility.ts`) um `+entry free` erweitert (offene Dienste ausschließlich gruppenintern); automatische Aktualisierung über `pollfornews` (15 s, pausiert bei Undo-Fenster und im Hintergrund-Tab); Dashboard-Code modularisiert (alle Dateien unter 300 Zeilen); Datenquellen gesplittet (`/persons/{id}/events` für eigene Events, `/events` nur noch 3-Monats-Fenster mit dokumentiertem `include=event_services` und Response-Normalisierung); Event-Deduplizierung gegen Paginierungs-Dubletten; Buttons und Quick-Buttons im ChurchTools-Stil vereinheitlicht; Undo-Endpunkt mit `personId`-Pflichtfeld (API-Befund)
- **v1.0.1** – UI-Feinschliff und Bugfixes: Content-Breiten als wiederverwendbare Utilities (800px zentriert für die Inaktivitäts-Seite), Hintergrund/Karten-Farben vereinheitlicht, Tiefen-Effekte für Inputs und Quick-Buttons, Vorschlagsliste slidet beim Öffnen ein, Maus-Auswahl im Autocomplete schließt die Liste (Fix), Sidebar-Drawer ab 1200px mit Nav-Slide, Toasts kollabieren animiert beim Schließen, Tab-Titel mit Gemeinde-Namen, `init()` idempotent gemacht (Fix gegen doppelte Listener)
- **v1.0.0** – Erste Version: Inaktivitäts-Suche (Gruppen-Autocomplete, rechtebasierte Dienst-Auswahl, Zeitraum-Filter, Sammel-Zuweisung über Modal), Router mit Seiten-Lebenszyklus, CSS auf ChurchTools-Theme-Tokens, Toast-Benachrichtigungen

## Support & Ressourcen

- **ChurchTools API-Dokumentation:** https://churchtools.de/api/
- **ChurchTools-Forum:** https://forum.church.tools
- **Vite-Dokumentation:** https://vitejs.dev
- **TypeScript-Handbuch:** https://www.typescriptlang.org/docs