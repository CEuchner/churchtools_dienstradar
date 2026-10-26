import type { Event as CtEvent, Service } from '../../utils/ct-types';
import type { UserPermissions } from '../../api/permissions';
import type { ServiceRequest } from '../../api/servicerequests';
import type { ServiceMeta } from './data';
import type { OwnEventEntry, OpenServiceEntry } from './derive';
import type { StatsMode, StatsChart, StatsPoint } from './statistics';

/**
 * Gesamter veränderlicher Zustand des Dashboards an einem Ort.
 *
 * Die Feature-Module (format/data/derive/cards/controls/stats-ui)
 * lesen und schreiben hier – so brauchen sie keine zirkulären Importe
 * untereinander. Als Objekt statt einzelner `let`s, weil exportierte
 * let-Variablen in ES-Modulen von außen nicht beschreibbar sind.
 */
export const dashboardState = {
    /** Zählt jeden init()-Durchlauf; veraltete Durchläufe brechen ab. */
    instanceId: 0,

    /** Gewählter Zeitraum der Offene-Dienste-Karte (Tage). */
    openWindowDays: 60,

    /** Listen eingeklappt (nur 3 Events) oder ausgeklappt – überlebt
     *  Zeitraum-Wechsel und reloadAll(), wird in destroy() zurückgesetzt. */
    upcomingExpanded: false,
    openExpanded: false,

    // ── Zuletzt geladene Daten (Basis aller Karten) ──────────────────
    personId: 0,
    personIdentifier: '',
    serviceNames: new Map<number, ServiceMeta>(),
    services: [] as Service[],
    perms: null as UserPermissions | null,
    events: [] as CtEvent[],
    upcomingEntries: [] as OwnEventEntry[],
    openEntries: [] as OpenServiceEntry[],
    requests: [] as ServiceRequest[],

    // ── Statistik ────────────────────────────────────────────────────
    /** Default-Zeitraum (eine der IDs aus STATS_WINDOWS). */
    statsWindowId: '8w',
    statsMode: 'individual' as StatsMode,
    statsChart: 'bars' as StatsChart,
    /** Punkte des aktuell gerenderten Diagramms – Datenquelle des Tooltips. */
    statsPoints: [] as StatsPoint[],
    /** Index der per Klick fixierten Diagramm-Spalte – null = nichts fixiert. */
    pinnedStatsIndex: null as number | null,

    // ── Polling ──────────────────────────────────────────────────────
    /** true, solange ein Undo-Fenster offen ist – Polling pausiert dann. */
    undoWindowOpen: false,
    lastPollDate: new Date().toISOString(),
};

/** Click-Handler-Typ für die Delegation-Listener. */
export type ClickHandler = (event: Event) => void;

/**
 * Alle registrierten Listener – destroy() entfernt sie an ihren
 * bekannten Elementen und leert dieses Objekt.
 */
export const handlers = {
    openQuick: null as ClickHandler | null,     // Offene Dienste: Zeitraum + Klappen
    upcoming: null as ClickHandler | null,      // Anstehende Dienste: Klappen
    requestAction: null as ClickHandler | null, // Anfragen: Annehmen/Ablehnen
    stats: null as ClickHandler | null,         // Statistik: Button-Gruppen
    statsTip: null as ClickHandler | null,      // Statistik: pointerover (Tooltip)
    statsTipLeave: null as (() => void) | null, // Statistik: pointerleave
    statsTipClick: null as ClickHandler | null, // Statistik: Klick-Fixierung (document)
};

/** ResizeObserver-Runtime der Statistik-Karte. */
export const statsRuntime = {
    observer: null as ResizeObserver | null,
    lastWidth: 0,
    rafId: null as number | null,
};