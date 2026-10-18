# DienstRadar

ChurchTools-Extension zum Finden von Personen in einer Gruppe, die in einem bestimmten Zeitraum in bestimmten Diensten nicht aktiv waren – und zum Hinzufügen dieser Personen zu einer Follow-up-Gruppe.

DienstRadar ist eine Single-Page-Extension mit Hash-Router. Die Inaktivitäts-Suche ist der erste Funktionsbereich; die Struktur ist auf weitere Seiten (Dashboard, Statistiken, Einstellungen) vorbereitet. **Version: 1.0.0**

## Features

- **Gruppen-Autocomplete** – Texteingabe mit Echtzeit-Filterung und Tastaturnavigation (Pfeiltasten, Enter, Escape), auch im Zielgruppen-Modal
- **Rechtebasierte Dienst-Auswahl** – nur Dienste sichtbar, für die der Nutzer berechtigt ist (auf Ebene der Dienstgruppen ausgewertet)
- **Zeitraum-Filter** – Schnellbuttons (-12M bis +12M bzw. Heute) oder freie Datumswahl, Standard: -6M bis +12M
- **Smarte Suche** – findet Mitglieder, die im Zeitraum **keinen** der gewählten Dienste wahrgenommen haben
- **Sammel-Aktion** – mehrere gefundene Personen gleichzeitig in eine Zielgruppe hinzufügen (per Modal mit Autocomplete)
- **Toast-Benachrichtigungen** – Loading persistent mit Spinner, Erfolg nach 5 s, Fehler nach 10 s, jeweils mit Fortschrittsbalken; Fehler zusätzlich mit Schließen-Button
- **Responsive** – Sidebar wird auf Mobil zum Burger-gesteuerten Drawer
- **Dark Mode** – automatisch über die ChurchTools-Theme-Tokens
- **E-Mail-Anzeige** – gefundene Personen mit klickbarem `mailto:`-Link

## Projektstruktur

```
src/
├── api/                          # Wiederverwendbare ChurchTools-Zugriffe
│   ├── client.ts                 # fetchAllPages mit Pagination-Guards
│   ├── permissions.ts            # Rechte laden (global + gruppenintern)
│   ├── groups.ts                 # Gruppen, Mitglieder, addPersonsToGroup
│   ├── services.ts               # Dienste, Dienstgruppen
│   └── events.ts                 # Termine im Zeitraum (eventServices)
├── components/                   # Geteilte UI-Bausteine (seitenunabhängig)
│   ├── Header.ts                 # Titelzeile, Navigation, Burger-Toggle
│   ├── icons.ts                  # Zentrale SVG-Sammlung
│   ├── toast.ts                  # showStatus / hideStatus / clearStatusToasts
│   ├── autocomplete.ts           # Wiederverwendbare Vorschlagsliste
│   └── form-controls.ts          # Dienst-Checkboxen, Quick-Date-Buttons
├── features/inactivity/          # Fachlogik der Inaktivitäts-Seite
│   ├── state.ts                  # Seiten-State + getElements()
│   ├── visibility.ts             # Rechteauswertung (Sichtbarkeit von Dienstgruppen)
│   ├── data.ts                   # Paralleles Laden der Stammdaten
│   ├── search.ts                 # Suchlogik (inaktive Mitglieder)
│   ├── ui.ts                     # Rendering von Diensten und Ergebnissen
│   ├── listeners.ts              # Verdrahtung + Aufräumfunktion
│   └── index.ts                  # render() / init() / destroy()
├── pages/                        # Dünne Seitenmodule für den Router
│   ├── Dashboard.ts, Inactivity.ts, Statistics.ts, Settings.ts
├── router/router.ts              # Hash-Router mit Seiten-Lebenszyklus
├── styles/                       # CSS auf CT-Tokens, nach Bausteinen getrennt
│   ├── base.css                  # Reset, Badge/Empty-State, Keyframes
│   ├── layout.css                # Root, Header, Nav, Content, Cards
│   ├── form.css                  # Felder, Buttons, Autocomplete, Modal
│   ├── toast.css                 # Toasts (Root-Level, außerhalb .dr-root)
│   └── inactivity.css            # Seitenspezifisches Layout
├── utils/
│   ├── base.ts                   # BASE-URL + routeHref()
│   ├── ct-types.d.ts             # Generierte ChurchTools-API-Typen
│   ├── kv-store.ts               # KV-Store-Zugriff (für künftige Einstellungen)
│   └── reset.css                 # Nur Development (simuliert CT-Umgebung)
└── main.ts                       # Einstiegspunkt: Login, Layout, Router-Start
```

## Architektur-Prinzipien

### Seiten-Lebenszyklus

Der Router erwartet pro Seite drei optionale Exporte:

```ts
export default render;                  // HTML-String für .content
export function init(): Promise<void>;  // nach dem Einsetzen ins DOM
export function destroy(): void;        // vor dem Austausch des Markups
```

- `init()` ist der einzige Zeitpunkt, an dem DOM-Referenzen aufgelöst werden (`getElements()` in `state.ts` ist bewusst eine Funktion, kein eingefrorenes Objekt) – so zeigen Referenzen nach einem Seitenwechsel nie auf abgehängte Knoten.
- `destroy()` räumt alle Listener ab, inklusive der `document`-Handler des Autocomplete. Ohne das würden sich Listener bei jedem Seitenbesuch stapeln.
- Ein Token-Guard im Router verwirft veraltete Rendering-Durchläufe bei schnellem Routenwechsel.

### Logik von Seiten getrennt

Wiederverwendbare Zugriffe liegen in `src/api/`, geteilte UI-Bausteine in `src/components/`. Die Inaktivitäts-Seite ist die erste Konsumentin; künftige Seiten (z. B. Statistiken) nutzen dieselben Bausteine, ohne Code zu duplizieren.

### CSS

Alle Werte stammen aus den ChurchTools-Theme-Tokens (`--color-*`, `--text-*`, `--radius-*`, `--spacing`) mit aufgelösten Tailwind-Fallbacks für den Standalone-Betrieb. Eigene Dark-Mode-Regeln sind nicht nötig – die Tokens schalten selbst um. Die Toasts werden am `<body>` gerendert und sind daher die einzige Ausnahme ohne `.dr-root`-Scope.

## Rechte-Modell

Die Sichtbarkeit wird auf Ebene der **Dienstgruppe** ausgewertet (`visibility.ts`): Wer eine Dienstgruppe sehen darf, sieht alle ihre Dienste. Prüfungen sind additiv (ODER) und in dieser Reihenfolge aktiv:

1. **`edit servicegroup`** (global) – wer eine Dienstgruppe bearbeiten darf, darf sie sehen und nutzen
2. **`+entry all`** (gruppenintern) – der Nutzer muss in mindestens einer Gruppe dieses Rechts besitzen, die einem Dienst der Dienstgruppe zugeordnet ist

**Weiter vorbereitete, aktuell deaktivierte Prüfungen** (als Kommentar an Ort und Stelle):

- `serviceGroup.viewAll` (öffentliche Dienstgruppe) – `visibility.ts`
- Global `view servicegroup` – wird bereits geladen (`globalServiceGroupIds`), aber nicht ausgewertet
- `+view service` / `+edit service` (gruppenintern) – `permissions.ts` (Historie aus der Vorgänger-Extension „Karteileichen")

Dienste ohne `serviceGroupId` gelten als ungültiger Datenzustand und werden ausgeblendet.

## API-Endpunkte

- `GET /groups?only_my_groups=true` – eigene Gruppen für Rechteprüfungen
- `GET /permissions/global` – `view servicegroup`, `edit servicegroup`
- `GET /permissions/internal/groups` – gruppeninterne Rechte (`+entry all`)
- `GET /groups?limit=200&page=X` – alle Gruppen
- `GET /groups/{id}/members?personFields[]=email&personFields[]=firstName&personFields[]=lastName` – Mitglieder
- `GET /servicegroups?limit=200&page=X` – Dienstgruppen
- `GET /services` – Dienste (Endpunkt ohne Pagination)
- `GET /events?from=...&to=...&limit=100&page=X&include=eventServices` – Termine (Limit 100 max.; `to` ist exklusiv, wird intern +1 Tag aufgeschlagen)
- `PUT /groups/{id}/members/{personId}` – Person hinzufügen (mit `only_add: true`; bereits Mitglied → 403 mit sprechender Meldung, wird separat gezählt)

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

1. Gruppe über das Suchfeld wählen (Autocomplete)
2. Dienste auswählen – aufklappbare Dienstgruppen mit Master-Checkbox (alle/keine/teilausgewählt)
3. Zeitraum per Schnellbuttons oder Datumsfelder setzen (Standard: -6M bis +12M)
4. „Inaktive finden" – Ergebnisliste mit Name, E-Mail und Auswahl-Checkbox
5. Personen wählen (oder „Alle auswählen") → „Zu Gruppe hinzufügen" → Zielgruppe im Modal wählen → „Hinzufügen"
6. Ergebnis-Meldung differenziert: erfolgreich / bereits Mitglied / keine Berechtigung / sonstige Fehler

„Zurücksetzen" leert alle Felder und stellt den Standard-Zeitraum wieder her.

## Troubleshooting

| Problem | Ursache/Lösung |
|---|---|
| „Keine Dienste verfügbar" | Der Nutzer hat weder `edit servicegroup` noch in einer Gruppe `+entry all` – Rechte in ChurchTools prüfen |
| Suche liefert keine Mitglieder | Gruppenselektion und Mitgliederrecht der ausgewählten Gruppe prüfen |
| „Keine Berechtigung dieser Gruppe Personen hinzuzufügen" | Recht zum Bearbeiten der **Zielgruppe** fehlt |
| Toasts erscheinen nicht | Prüfen, ob alle fünf CSS-Imports in `main.ts` stehen; Keyframes testen: `[...document.styleSheets].flatMap(s => [...s.cssRules]).filter(r => r instanceof CSSKeyframesRule).map(r => r.name)` |
| Konsole: `Element #… nicht gefunden` | Markup der Seite wurde nicht gerendert – Router/Seitenmodul prüfen |

## Changelog

- **v1.0.0** – Erste Version: Inaktivitäts-Suche (Gruppen-Autocomplete, rechtebasierte Dienst-Auswahl, Zeitraum-Filter, Sammel-Zuweisung über Modal), Router mit Seiten-Lebenszyklus, CSS auf ChurchTools-Theme-Tokens, Toast-Benachrichtigungen

## Support & Ressourcen

- **ChurchTools API-Dokumentation:** https://churchtools.de/api/
- **ChurchTools-Forum:** https://forum.church.tools
- **Vite-Dokumentation:** https://vitejs.dev
- **TypeScript-Handbuch:** https://www.typescriptlang.org/docs