import { showStatus } from '../../components/toast';
import { loadUserPermissions } from '../../api/permissions';
import { loadServiceRequests } from '../../api/servicerequests';
import {
    loadDashboardEvents,
    getPersonId,
    getServiceMetaMap,
    getServices,
} from './data';
import { getUpcomingOwnEvents, getOpenServices } from './derive';
import {
    renderHero,
    renderUpcomingList,
    renderRequests,
    renderOpenServices,
    renderQuickActions,
} from './cards';
import {
    renderStats,
    bindStatsControls,
    bindStatsTooltip,
    bindStatsResize,
    cleanupStats,
} from './stats-ui';
import {
    bindOpenQuickButtons,
    bindUpcomingControls,
    bindRequestActions,
    startPolling,
    stopPolling,
} from './controls';
import { dashboardState, handlers } from './state';

export const title = 'Dashboard';

/** Markup der Seite. IDs nur für JS, Klassen für CSS. */
export function render(): string {
    return `
    <div class="dr-dashboard" id="dashboardRoot">

      <div class="dr-content dr-content-full">
        <div class="dr-dashboard-hero card" id="dashboardHero">
          <h2 class="dr-dashboard-hero-title">Nächster Dienst</h2>
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
            <div class="card dr-dashboard-card dr-stats-card" id="dashboardStats">
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

export async function init(): Promise<void> {
    const id = ++dashboardState.instanceId;

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
        if (id !== dashboardState.instanceId) return;

        dashboardState.personId = personId;
        dashboardState.personIdentifier = personIdentifier;
        dashboardState.serviceNames = serviceNames;
        dashboardState.services = services;
        dashboardState.perms = perms;
        dashboardState.requests = requestList;
        dashboardState.events = events;

        const upcoming = getUpcomingOwnEvents(events, personIdentifier);
        dashboardState.upcomingEntries = upcoming;
        const openEntries = getOpenServices(events, services, perms);
        dashboardState.openEntries = openEntries;

        renderHero(upcoming[0], serviceNames);
        renderUpcomingList(upcoming, serviceNames);
        renderRequests();
        renderOpenServices(openEntries, serviceNames);
        renderStats();
        renderQuickActions();

        bindOpenQuickButtons();
        bindUpcomingControls();
        bindRequestActions();
        bindStatsControls();
        bindStatsTooltip();
        bindStatsResize();

        startPolling();
    } catch (error) {
        if (id !== dashboardState.instanceId) return;

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
    dashboardState.instanceId++;

    stopPolling();
    cleanupStats();

    if (handlers.openQuick) {
        document.getElementById('dashboardOpenServices')
            ?.removeEventListener('click', handlers.openQuick);
    }

    if (handlers.upcoming) {
        document.getElementById('dashboardUpcoming')
            ?.removeEventListener('click', handlers.upcoming);
    }

    if (handlers.requestAction) {
        document.getElementById('dashboardRequests')
            ?.removeEventListener('click', handlers.requestAction);
    }

    if (handlers.stats) {
        document.getElementById('dashboardStats')
            ?.removeEventListener('click', handlers.stats);
    }

    if (handlers.statsTip) {
        document.getElementById('dashboardStats')
            ?.removeEventListener('pointerover', handlers.statsTip);
    }

    if (handlers.statsTipLeave) {
        document.getElementById('dashboardStats')
            ?.removeEventListener('pointerleave', handlers.statsTipLeave);
    }

    if (handlers.statsTipClick) {
        document.removeEventListener('click', handlers.statsTipClick);
    }

    handlers.openQuick = null;
    handlers.upcoming = null;
    handlers.requestAction = null;
    handlers.stats = null;
    handlers.statsTip = null;
    handlers.statsTipLeave = null;
    handlers.statsTipClick = null;

    // Klapp-Zustände zurücksetzen – jeder Besuch startet eingeklappt
    dashboardState.upcomingExpanded = false;
    dashboardState.openExpanded = false;
}