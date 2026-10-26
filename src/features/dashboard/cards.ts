import { canAccessPage } from '../../api/access-control';
import { routeHref } from '../../utils/base';
import { icon } from '../../components/icons';
import {
    esc,
    serviceNameOf,
    eventStartDate,
    formatEventDateTime,
    formatEventDateLong,
    formatDayOfMonth,
    formatMonthShort,
    formatCountdown,
    buildEventUrl,
} from './format';
import type { OwnEventEntry, OpenServiceEntry } from './derive';
import { dashboardState } from './state';
import type { ServiceMeta } from './data';

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

// ── Hero ─────────────────────────────────────────────────────────────

/**
 * Hero mit dem NÄCHSTEN EVENT:
 * Datum-Block links (große Tageszahl), Titel + Countdown daneben,
 * darunter das lange Datum und die zugesagten Dienste als Pills,
 * rechts der Button „Event aufrufen" (neuer Tab).
 */
export function renderHero(
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
 * Einklappen: ohne Zustand nur die ersten drei Events.
 */
export function renderUpcomingList(
    upcoming: OwnEventEntry[],
    serviceNames: Map<number, ServiceMeta>
): void {
    const card = document.getElementById('dashboardUpcoming');
    if (!card) return;
    dashboardState.upcomingEntries = upcoming;

    if (upcoming.length === 0) {
        card.innerHTML = `
            <h2>Anstehende Dienste</h2>
            <p class="dr-empty">Keine anstehenden eigenen Dienste gefunden.</p>
        `;
        return;
    }

    const visible = dashboardState.upcomingExpanded ? upcoming : upcoming.slice(0, 3);

    const items = visible.map(entry => {
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

    // Toggle nur zeigen, wenn es überhaupt etwas umzuklappen gibt
    const toggle = upcoming.length > 3
        ? `<button type="button" class="dr-quick dr-expand-upcoming dr-expand">
               ${dashboardState.upcomingExpanded ? 'Weniger anzeigen' : `Alle anzeigen (${upcoming.length})`}
           </button>`
        : '';

    card.innerHTML = `
        <h2>Anstehende Dienste</h2>
        <ul class="dr-dashboard-list">${items}</ul>
        ${toggle}
    `;
}

// ── Spalte 2b: Offene Dienste ────────────────────────────────────────

/**
 * Unbesetzte, sichtbare Dienste im gewählten Zeitraum
 * (Quick-Buttons 14/30/60/90 Tage, Default 60). Kein direktes Eintragen
 * hier – der Button öffnet das Event in ChurchTools in einem neuen Tab.
 * Die Dienste-Pills sind nach den Dienst-Stammdaten sortiert
 * (Service.sortKey = Reihenfolge im Dienst-Modul).
 * Einklappen: ohne Zustand nur die ersten drei Events (nach Zeitraum-Filter).
 */
export function renderOpenServices(
    openEntries: OpenServiceEntry[],
    serviceNames: Map<number, ServiceMeta>
): void {
    dashboardState.openEntries = openEntries;

    const card = document.getElementById('dashboardOpenServices');
    if (!card) return;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + dashboardState.openWindowDays);
    const cutoffTime = cutoff.getTime();

    const filtered = openEntries.filter(
        entry => eventStartDate(entry.event).getTime() <= cutoffTime
    );

    const visible = dashboardState.openExpanded ? filtered : filtered.slice(0, 3);

    const buttons = [14, 30, 60, 90].map(days => `
        <button type="button" class="dr-quick dr-quick-open${days === dashboardState.openWindowDays ? ' active' : ''}"
                data-days="${days}">${days} T</button>
    `).join('');

    if (filtered.length === 0) {
        card.innerHTML = `
            <h2>Offene Dienste</h2>
            <div class="dr-quick-buttons" role="group" aria-label="Zeitraum">${buttons}</div>
            <p class="dr-empty">Keine offenen Dienste in den nächsten ${dashboardState.openWindowDays} Tagen.</p>
        `;
        return;
    }

    const items = visible.map(entry => {
        const url = buildEventUrl(entry.event.id);
        const services = entry.services
            .map(service => ({
                serviceId: service.serviceId,
                name: serviceNameOf(serviceNames, service.serviceId),
                sortKey: service.serviceId !== undefined
                    ? serviceNames.get(service.serviceId)?.sortKey ?? Number.MAX_SAFE_INTEGER
                    : Number.MAX_SAFE_INTEGER,
            }))
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

    const toggle = filtered.length > 3
        ? `<button type="button" class="dr-quick dr-expand-open dr-expand">
               ${dashboardState.openExpanded ? 'Weniger anzeigen' : `Alle anzeigen (${filtered.length})`}
           </button>`
        : '';

    card.innerHTML = `
        <h2>Offene Dienste</h2>
        <div class="dr-quick-buttons" role="group" aria-label="Zeitraum">${buttons}</div>
        <ul class="dr-dashboard-list">${items}</ul>
        ${toggle}
    `;
}

// ── Spalte 2a: Anfragen ──────────────────────────────────────────────

/**
 * Offene Anfragen an die angemeldete Person, aus dem dedizierten Endpunkt
 * GET /persons/{id}/servicerequests. Gefiltert auf isAccepted === false
 * und zukünftige Events; sortiert nach Event-Datum.
 * Leer → Karte komplett ausblenden (wie die Schnellzugriff-Karte).
 */
export function renderRequests(): void {
    const card = document.getElementById('dashboardRequests');
    if (!card) return;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const open = dashboardState.requests
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
        card.style.display = 'none';
        return;
    }
    card.style.display = '';

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
                    ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener" class="dr-btn dr-btn--secondary dr-request-link dr-request-btn">Zum Event</a>` : ''}
                    <div class="dr-request-buttons">
                        <button type="button" class="dr-btn dr-btn--secondary dr-request-btn"
                                data-action="decline"
                                data-request-id="${request.id}"
                                data-event-id="${request.event!.id}">Ablehnen</button>
                        <button type="button" class="dr-btn dr-btn--primary dr-request-btn"
                                data-action="accept"
                                data-request-id="${request.id}"
                                data-event-id="${request.event!.id}">Annehmen</button>
                    </div>
                </div>
            </li>
        `;
    }).join('');

    card.innerHTML = `
        <h2>Anfragen</h2>
        <ul class="dr-dashboard-list">${items}</ul>
    `;
}

// ── Spalte 3b: Quick-Actions ─────────────────────────────────────────

/**
 * Sprungkarten zu den anderen Modulen der Extension. Interne
 * Hash-Navigation (kein neuer Tab – dieselbe App-Instanz).
 * Rechtegefiltert über canAccessPage(); ohne jegliche Berechtigung
 * wird die Karte komplett ausgeblendet.
 */
export function renderQuickActions(): void {
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