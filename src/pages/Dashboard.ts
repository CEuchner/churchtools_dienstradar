import { showStatus, showActionToast, hideStatus } from '../components/toast';
import { loadUserPermissions } from '../api/permissions';
import {
    acceptServiceRequest,
    declineServiceRequest,
    undoServiceRequest,
    loadServiceRequests,
    type ServiceRequest,
} from '../api/servicerequests';
import { canAccessPage } from '../api/access-control';
import { routeHref } from '../utils/base';
import { icon } from '../components/icons';
import {
    loadDashboardEvents,
    resetDashboardEvents,
    getPersonId,
    getServiceMetaMap,
    getServices,
    getUpcomingOwnEvents,
    getOpenServices,
    formatEventDateTime,
    formatEventDateLong,
    formatDayOfMonth,
    formatMonthShort,
    formatCountdown,
    eventStartDate,
    buildEventUrl,
    type ServiceMeta,
    type OwnEventEntry,
    type OpenServiceEntry,
} from '../features/dashboard/data';
import type { Service } from '../utils/ct-types';
import { pollForNews } from '../api/pollfornews';

export const title = 'Dashboard';

/** HTML-Escaping für Namen aus der Datenbank (Service-/Eventnamen). */
function esc(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Holt den Dienstnamen aus der Meta-Map (einzige Quelle für alle Karten). */
function serviceNameOf(
    serviceNames: Map<number, ServiceMeta>,
    serviceId: number | undefined
): string {
    return serviceId !== undefined
        ? serviceNames.get(serviceId)?.name ?? 'Dienst'
        : 'Dienst';
}

/** Zugesagte Dienste eines Events als Pill-Badges (Hero). */
function servicePills(
    entry: OwnEventEntry,
    serviceNames: Map<number, ServiceMeta>
): string {
    return entry.services
        .map(service =>
            `<span class="dr-hero-pill">${esc(serviceNameOf(serviceNames, service.serviceId))}</span>`
        )
        .join('');
}

/** Dienste eines Events als einfache Listeneinträge (Anstehende Dienste). */
function serviceListItems(
    entry: OwnEventEntry,
    serviceNames: Map<number, ServiceMeta>
): string {
    return entry.services
        .map(service =>
            `<li>${esc(serviceNameOf(serviceNames, service.serviceId))}</li>`
        )
        .join('');
}

export default function Dashboard() {
  return `
    <div class="dr-dashboard" id="dashboardRoot">

      <div class="dr-content dr-content-full">
        <div class="dr-dashboard-hero card" id="dashboardHero">
          <h2 class="dr-dashboard-hero-title">Nächstes Event</h2>
          <p class="dr-empty">Wird geladen…</p>
        </div>

        <div class="dr-dashboard-grid">

          <section class="dr-dashboard-col dr-dashboard-col--1" aria-label="Anfragen und anstehende Dienste">
            <div class="card dr-dashboard-card" id="dashboardRequests">
              <h2>Anfragen</h2>
              <p class="dr-empty">Wird geladen…</p>
            </div>

            <div class="card dr-dashboard-card" id="dashboardUpcoming">
              <h2>Anstehende Dienste</h2>
              <p class="dr-empty">Wird geladen…</p>
            </div>
          </section>

          <section class="dr-dashboard-col dr-dashboard-col--2" aria-label="Offene Dienste">
            <div class="card dr-dashboard-card" id="dashboardOpenServices">
              <h2>Offene Dienste</h2>
              <p class="dr-empty">Wird geladen…</p>
            </div>
          </section>

          <section class="dr-dashboard-col dr-dashboard-col--3" aria-label="Statistik und Aktionen">
            <div class="card dr-dashboard-card" id="dashboardStats">
              <h2>Meine Statistik</h2>
              <p class="dr-empty">Wird geladen…</p>
            </div>

            <div class="card dr-dashboard-card" id="dashboardQuickActions">
              <h2>Schnellzugriff</h2>
              <p class="dr-empty">Wird geladen…</p>
            </div>
          </section>

        </div>
      </div>

    </div>
  `;
}

let instanceId = 0;

/** Gewählter Zeitraum der Offene-Dienste-Karte (Tage). */
let openWindowDays = 60;

// ── Polling (Phase 6) ────────────────────────────────────────────────

/** Intervall der Änderungsabfrage. CT selbst pollt ca. alle 10 s –
 *  wir nehmen 15 s, der Preis pro Tick ist minimal. */
const POLL_INTERVAL_MS = 15_000;

/** Die Domäne, deren Änderungen uns interessieren: Diensteinteilungen
 *  (Eintragungen, Annahmen, Ablehnungen). */
const POLL_DOMAIN_TYPES = ['event_service'];

let pollTimer: ReturnType<typeof setInterval> | null = null;

/** Basis für den nächsten pollfornews-Abruf (ISO-Zeitstempel). */
let lastPollDate = new Date().toISOString();

/**
 * true, solange ein Undo-Fenster offen ist („Rückgängig" verfügbar).
 * Das Polling pausiert dann – ein Reload könnte die Anzeige verändern,
 * während der Nutzer über Undo entscheidet.
 */
let undoWindowOpen = false;

// ── Modul-Zustand für Neu-Rendern ohne Daten-Argumente ───────────────

let lastPersonId = 0;
let lastPersonIdentifier = '';
let lastServiceNames: Map<number, ServiceMeta> = new Map();
let lastServices: Service[] = [];
let lastPerms = null as Awaited<ReturnType<typeof loadUserPermissions>> | null;
let lastOpenEntries: OpenServiceEntry[] = [];
let lastRequests: ServiceRequest[] = [];

/** Delegation-Listener der Offene-Dienste-Karte (Zeitraum-Buttons). */
let openQuickHandler: ((event: Event) => void) | null = null;

/** Delegation-Listener der Anfragen-Karte (Annehmen/Ablehnen). */
let requestActionHandler: ((event: Event) => void) | null = null;

export async function init(): Promise<void> {
    const id = ++instanceId;

    try {
        // Erst die eigene ID (ein whoami-Aufruf, gecacht)…
        const personId = await getPersonId();
        const personIdentifier = String(personId);

        // …dann alles Weitere parallel – inkl. der Anfragen vom
        // dedizierten Endpunkt
        const [events, serviceNames, services, perms, requestList] = await Promise.all([
            loadDashboardEvents(),
            getServiceMetaMap(),
            getServices(),
            loadUserPermissions(),
            loadServiceRequests(personId),
        ]);

        // Während des Ladens Seite verlassen? Dann nichts mehr anfassen.
        if (id !== instanceId) return;

        lastPersonId = personId;
        lastPersonIdentifier = personIdentifier;
        lastServiceNames = serviceNames;
        lastServices = services;
        lastPerms = perms;
        lastRequests = requestList;

        const upcoming = getUpcomingOwnEvents(events, personIdentifier);
        const openEntries = getOpenServices(events, services, perms);

        renderHero(upcoming[0], serviceNames);
        renderUpcomingList(upcoming, serviceNames);
        renderRequests();
        renderOpenServices(openEntries, serviceNames);
        renderQuickActions();

        bindOpenQuickButtons();
        bindRequestActions();
        startPolling();
    } catch (error) {
        if (id !== instanceId) return;

        showStatus(
            'Fehler beim Laden der Dienste: ' +
                (error instanceof Error ? error.message : 'Unbekannter Fehler'),
            'error'
        );

        const hero = document.getElementById('dashboardHero');
        if (hero) hero.innerHTML = `<h2 class="dr-dashboard-hero-title">Nächstes Event</h2><p class="dr-empty">Konnte nicht geladen werden</p>`;
    }
}

export function destroy(): void {
    stopPolling();
    instanceId++;

    if (openQuickHandler) {
        document.getElementById('dashboardOpenServices')
            ?.removeEventListener('click', openQuickHandler);
        openQuickHandler = null;
    }

    if (requestActionHandler) {
        document.getElementById('dashboardRequests')
            ?.removeEventListener('click', requestActionHandler);
        requestActionHandler = null;
    }
}

/** Setzt den EINEN Delegation-Listener für die Quick-Buttons der Karte. */
function bindOpenQuickButtons(): void {
    const card = document.getElementById('dashboardOpenServices');
    if (!card) return;

    openQuickHandler = (event: Event) => {
        const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('.dr-quick-open');
        if (!btn?.dataset.days) return;

        openWindowDays = parseInt(btn.dataset.days, 10);

        // Neu-Rendern setzt die Buttons samt aktiver Markierung neu –
        // der Listener hängt an der Karte und bleibt erhalten (Delegation).
        renderOpenServices(lastOpenEntries, lastServiceNames);
    };

    card.addEventListener('click', openQuickHandler);
}

/**
 * Lädt Events und Anfragen frisch und baut ALLE Karten neu – der gemeinsame
 * Weg nach Annehmen, Ablehnen UND Undo. Dadurch stimmen auch die offenen
 * Dienste (z. B. nach einer Absage) wieder mit dem Stand in ChurchTools.
 */
async function reloadAll(): Promise<void> {
    resetDashboardEvents();

    const [events, requestList] = await Promise.all([
        loadDashboardEvents(),
        loadServiceRequests(lastPersonId),
    ]);
    lastRequests = requestList;

    const upcoming = getUpcomingOwnEvents(events, lastPersonIdentifier);
    const openEntries = lastPerms
        ? getOpenServices(events, lastServices, lastPerms)
        : [];

    renderHero(upcoming[0], lastServiceNames);
    renderUpcomingList(upcoming, lastServiceNames);
    renderRequests();
    renderOpenServices(openEntries, lastServiceNames);
}

/**
 * Delegation-Listener der Anfragen-Karte: Annehmen/Ablehnen direkt im
 * Dashboard. Nach Erfolg erscheint eine Undo-Meldung („Zugesagt"/„Abgesagt"
 * + „Rückgängig", 15 s), und ALLE Ansichten werden frisch geladen.
 */
function bindRequestActions(): void {
    const card = document.getElementById('dashboardRequests');
    if (!card) return;

    requestActionHandler = async (event: Event) => {
        const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('.dr-request-btn');
        if (!btn) return;

        const action = btn.dataset.action;
        const requestId = parseInt(btn.dataset.requestId || '', 10);
        const eventId = parseInt(btn.dataset.eventId || '', 10);
        if (!action || Number.isNaN(requestId) || Number.isNaN(eventId)) return;

        btn.disabled = true;
        showStatus(
            action === 'accept' ? '🔄 Anfrage wird angenommen…' : '🔄 Anfrage wird abgelehnt…',
            'loading'
        );

        try {
            if (action === 'accept') {
                await acceptServiceRequest(eventId, requestId);
            } else {
                await declineServiceRequest(eventId, requestId);
            }

            undoWindowOpen = true;

            // Frischer Stand für ALLE Karten – inkl. Offene Dienste
            await reloadAll();

            showActionToast(
                action === 'accept' ? '✓ Zugesagt' : '✓ Abgesagt',
                'Rückgängig',
                () => undoRequest(eventId, requestId)
            );

            // Undo-Fenster automatisch schließen, wenn der Toast ohne Klick
            // abläuft. Muss mit UNDO_TIMEOUT_MS in toast.ts übereinstimmen.
            // Klickt der Nutzer vorher: undoRequest() setzt die Variable
            // schon auf false – das doppelte Zurücksetzen ist harmlos.
            setTimeout(() => { undoWindowOpen = false; }, 15_000);
        } catch (error) {
            showStatus(
                'Fehler: ' +
                    (error instanceof Error ? error.message : 'Unbekannter Fehler'),
                'error'
            );
            btn.disabled = false;
        }
    };

    card.addEventListener('click', requestActionHandler);
}

/**
 * Nimmt eine Annahme/Ablehnung zurück und lädt alles frisch.
 * Läuft im Kontext des Undo-Toasts – Fehler erscheinen als Toast.
 */
async function undoRequest(eventId: number, requestId: number): Promise<void> {
    undoWindowOpen = false;
    showStatus('🔄 Aktion wird zurückgenommen…', 'loading');

    try {
        await undoServiceRequest(eventId, requestId, lastPersonId);
        await reloadAll();
        hideStatus();
        showStatus('✓ Zurückgenommen', 'success');
    } catch (error) {
        hideStatus();
        showStatus(
            'Fehler beim Zurücknehmen: ' +
                (error instanceof Error ? error.message : 'Unbekannter Fehler'),
            'error'
        );
    }
}

// ── Hero ─────────────────────────────────────────────────────────────

/**
 * Hero mit dem NÄCHSTEN EVENT:
 * Datum-Block links (große Tageszahl), Titel + Countdown daneben,
 * darunter das lange Datum und die zugesagten Dienste als Pills,
 * rechts der Button „Event aufrufen" (neuer Tab).
 */
function renderHero(
    entry: OwnEventEntry | undefined,
    serviceNames: Map<number, ServiceMeta>
): void {
    const hero = document.getElementById('dashboardHero');
    if (!hero) return;

    if (!entry) {
        hero.innerHTML = `
            <h2 class="dr-dashboard-hero-title">Nächstes Event</h2>
            <p class="dr-empty">Du bist für kein anstehendes Event eingeteilt.</p>
        `;
        return;
    }

    const date = eventStartDate(entry.event);
    const countdown = formatCountdown(date);
    const url = buildEventUrl(entry.event.id);

    hero.innerHTML = `
        <div class="dr-hero">
            <div class="dr-hero-date">
                <span class="dr-hero-date-day">${esc(formatDayOfMonth(date))}</span>
                <span class="dr-hero-date-month">${esc(formatMonthShort(date))}</span>
            </div>
            <div class="dr-hero-main">
                <div class="dr-hero-title-row">
                    <h2 class="dr-dashboard-hero-title">${esc(entry.event.name ?? 'Unbenanntes Event')}</h2>
                    <span class="dr-dashboard-hero-countdown">${esc(countdown)}</span>
                </div>
                <p class="dr-hero-date-long">${esc(formatEventDateLong(entry.event))}</p>
                <div class="dr-hero-services">${servicePills(entry, serviceNames)}</div>
            </div>
            ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener" class="dr-btn dr-btn--secondary dr-hero-btn">Event aufrufen</a>` : ''}
        </div>
    `;
}

// ── Spalte 1: Anstehende Dienste ─────────────────────────────────────

/**
 * Der Button floatet rechts, Datum + Titel fließen als Text um ihn herum;
 * Zeilen unter der Button-Unterkante laufen bis an den rechten Rand.
 * Darunter ALLE zugesagten Dienste – bewusst ohne „+1 weitere"-Kürzung.
 */
function renderUpcomingList(
    upcoming: OwnEventEntry[],
    serviceNames: Map<number, ServiceMeta>
): void {
    const card = document.getElementById('dashboardUpcoming');
    if (!card) return;

    if (upcoming.length === 0) {
        card.innerHTML = `
            <h2>Anstehende Dienste</h2>
            <p class="dr-empty">Keine anstehenden eigenen Dienste gefunden.</p>
        `;
        return;
    }

    const items = upcoming.map(entry => {
        const url = buildEventUrl(entry.event.id);

        return `
            <li class="dr-dashboard-entry">
                <div class="dr-dashboard-entry-head">
                    ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener" class="dr-btn dr-btn--secondary dr-entry-btn">Event aufrufen</a>` : ''}
                    <span class="dr-dashboard-entry-date">${esc(formatEventDateTime(entry.event))}</span>
                    <span class="dr-dashboard-entry-event">${esc(entry.event.name ?? 'Unbenanntes Event')}</span>
                </div>
                <ul class="dr-dashboard-entry-services">${serviceListItems(entry, serviceNames)}</ul>
            </li>
        `;
    }).join('');

    card.innerHTML = `
        <h2>Anstehende Dienste</h2>
        <ul class="dr-dashboard-list">${items}</ul>
    `;
}

// ── Spalte 2b: Offene Dienste ────────────────────────────────────────

/**
 * Unbesetzte, sichtbare Dienste im gewählten Zeitraum
 * (Quick-Buttons 14/30/60/90 Tage, Default 60). Kein direktes Eintragen
 * hier – der Button öffnet das Event in ChurchTools in einem neuen Tab.
 * Die Dienste-Pills sind nach den Dienst-Stammdaten sortiert
 * (Service.sortKey = Reihenfolge im Dienst-Modul).
 */
function renderOpenServices(
    openEntries: OpenServiceEntry[],
    serviceNames: Map<number, ServiceMeta>
): void {
    lastOpenEntries = openEntries;

    const card = document.getElementById('dashboardOpenServices');
    if (!card) return;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + openWindowDays);
    const cutoffTime = cutoff.getTime();

    const filtered = openEntries.filter(
        entry => eventStartDate(entry.event).getTime() <= cutoffTime
    );

    const buttons = [14, 30, 60, 90].map(days => `
        <button type="button" class="dr-quick dr-quick-open${days === openWindowDays ? ' active' : ''}"
                data-days="${days}">${days} T</button>
    `).join('');

    if (filtered.length === 0) {
        card.innerHTML = `
            <h2>Offene Dienste</h2>
            <div class="dr-quick-buttons" role="group" aria-label="Zeitraum">${buttons}</div>
            <p class="dr-empty">Keine offenen Dienste in den nächsten ${openWindowDays} Tagen.</p>
        `;
        return;
    }

    const items = filtered.map(entry => {
        const url = buildEventUrl(entry.event.id);
        const services = entry.services
            .map(service => ({
                serviceId: service.serviceId,
                name: serviceNameOf(serviceNames, service.serviceId),
                sortKey: service.serviceId !== undefined
                    ? serviceNames.get(service.serviceId)?.sortKey ?? Number.MAX_SAFE_INTEGER
                    : Number.MAX_SAFE_INTEGER,
            }))
            // Sortierung nach den Stammdaten: Service.sortKey = die Reihenfolge,
            // wie sie im Dienst-Modul unter Stammdaten hinterlegt ist
            .sort((a, b) => a.sortKey - b.sortKey)
            .map(item => `<span class="dr-open-pill">${esc(item.name)}</span>`)
            .join('');

        return `
            <li class="dr-dashboard-entry">
                <div class="dr-dashboard-entry-head">
                    ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener" class="dr-btn dr-btn--secondary dr-entry-btn">Zum Event</a>` : ''}
                    <span class="dr-dashboard-entry-date">${esc(formatEventDateTime(entry.event))}</span>
                    <span class="dr-dashboard-entry-event">${esc(entry.event.name ?? 'Unbenanntes Event')}</span>
                </div>
                <div class="dr-dashboard-entry-services dr-open-services">${services}</div>
            </li>
        `;
    }).join('');

    card.innerHTML = `
        <h2>Offene Dienste</h2>
        <div class="dr-quick-buttons" role="group" aria-label="Zeitraum">${buttons}</div>
        <ul class="dr-dashboard-list">${items}</ul>
    `;
}

// ── Spalte 2a: Anfragen (dedizierter Endpunkt + Annehmen/Ablehnen) ───

/**
 * Offene Anfragen an die angemeldete Person, aus dem dedizierten Endpunkt
 * GET /persons/{id}/servicerequests. Gefiltert auf isAccepted === false
 * und zukünftige Events; sortiert nach Event-Datum.
 */
function renderRequests(): void {
    const card = document.getElementById('dashboardRequests');
    if (!card) return;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const open = lastRequests
        .filter(request =>
            request.isAccepted === false
            && request.isValid !== false
            && request.event !== null
        )
        .filter(request =>
            new Date(request.event!.startDate).getTime() >= todayStart.getTime()
        )
        .sort((a, b) =>
            new Date(a.event!.startDate).getTime() - new Date(b.event!.startDate).getTime()
        );

    if (open.length === 0) {
        card.innerHTML = `
            <h2>Anfragen</h2>
            <p class="dr-empty">Keine offenen Anfragen.</p>
        `;
        return;
    }

    const items = open.map(request => {
        const url = buildEventUrl(request.event!.id);
        const serviceName = request.serviceName ?? 'Dienst';

        return `
            <li class="dr-dashboard-entry">
                <div class="dr-dashboard-entry-head">
                    <span class="dr-dashboard-entry-date">${esc(formatEventDateTime(request.event!))}</span>
                    <span class="dr-dashboard-entry-event">${esc(serviceName)} · ${esc(request.event!.name ?? '')}</span>
                </div>
                ${request.requesterPerson
                    ? `<p class="dr-request-requester">Angefragt von ${esc(request.requesterPerson.title)}</p>`
                    : ''}
                <div class="dr-request-actions">
                    ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener" class="dr-request-link">Zum Event</a>` : ''}
                    <button type="button" class="dr-btn dr-btn--secondary dr-request-btn"
                            data-action="decline"
                            data-request-id="${request.id}"
                            data-event-id="${request.event!.id}">Ablehnen</button>
                    <button type="button" class="dr-btn dr-btn--primary dr-request-btn"
                            data-action="accept"
                            data-request-id="${request.id}"
                            data-event-id="${request.event!.id}">Annehmen</button>
                </div>
            </li>
        `;
    }).join('');

    card.innerHTML = `
        <h2>Anfragen</h2>
        <ul class="dr-dashboard-list">${items}</ul>
    `;
}

// ── Spalte 3b: Quick-Actions (rechtegefiltert) ───────────────────────

/**
 * Sprungkarten zu den anderen Modulen der Extension. Interne
 * Hash-Navigation (kein neuer Tab – dieselbe App-Instanz).
 *
 * Rechtegefiltert über canAccessPage(): nur Module, die der Nutzer
 * über die ChurchTools-Rechteverwaltung (view custom category) sehen
 * darf, erscheinen als Karte. Ist KEINE erlaubt, wird die Karte
 * komplett ausgeblendet – eine leere „Schnellzugriff"-Karte wäre
 * nur Sperrmüll.
 */
function renderQuickActions(): void {
    const card = document.getElementById('dashboardQuickActions');
    if (!card) return;

    const actions = [
        {
            route: '/inactivity',
            icon: 'magnificant_glass',
            label: 'Inaktivität finden',
            description: 'Wer war in welchem Zeitraum in keinen Diensten?',
        },
        {
            route: '/statistics',
            icon: 'chart',
            label: 'Statistiken',
            description: 'Dienste pro Person im Detail',
        },
        {
            route: '/settings',
            icon: 'settings',
            label: 'Einstellungen',
            description: 'Konfiguration der Extension',
        },
    ].filter(action => canAccessPage(action.route));

    // Nichts erlaubt → Karte komplett ausblenden
    if (actions.length === 0) {
        card.style.display = 'none';
        return;
    }
    card.style.display = '';

    const items = actions.map(action => `
        <a href="${routeHref(action.route)}" class="dr-quick-action">
            <span class="dr-quick-action-icon">${icon(action.icon)}</span>
            <span class="dr-quick-action-text">
                <span class="dr-quick-action-label">${esc(action.label)}</span>
                <span class="dr-quick-action-description">${esc(action.description)}</span>
            </span>
        </a>
    `).join('');

    card.innerHTML = `
        <h2>Schnellzugriff</h2>
        <div class="dr-quick-action-list">${items}</div>
    `;
}

// ── Polling ──────────────────────────────────────────────────────────

/**
 * Ein Poll-Tick: Fragment-Anfrage nach Änderungen, nur bei Treffern
 * wird reloadAll() ausgeführt. Wird vom Intervall UND vom
 * visibilitychange genutzt (Rückkehr in den Tab → sofort ein Tick).
 */
async function pollTick(): Promise<void> {
    if (undoWindowOpen) return;
    if (document.visibilityState !== 'visible') return;

    try {
        const result = await pollForNews(POLL_DOMAIN_TYPES, lastPollDate);
        lastPollDate = result.lastPollDate;

        if (result.hasChanges) {
            await reloadAll();
        }
    } catch {
        // Still: Ein fehlgeschlagener Poll-Zyklus ist kein Nutzerfehler –
        // der nächste Tick versucht es erneut. Die Seite funktioniert
        // ohne Auto-Refresh weiterhin voll.
    }
}

function startPolling(): void {
    stopPolling();   // kein doppeltes Intervall bei erneutem init()

    pollTimer = setInterval(() => { void pollTick(); }, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', handleVisibilityChange);
}

function stopPolling(): void {
    if (pollTimer !== null) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
    document.removeEventListener('visibilitychange', handleVisibilityChange);
}

/** Bei Rückkehr in den sichtbaren Tab: sofort ein Poll-Tick. */
function handleVisibilityChange(): void {
    if (document.visibilityState !== 'visible') return;
    void pollTick();
}