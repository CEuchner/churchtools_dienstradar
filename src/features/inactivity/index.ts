import { clearStatusToasts, showStatus } from '../../components/toast';
import { getElements, resetState } from './state';
import { resetServiceGroupIndex } from './visibility';
import { loadInactivityData } from './data';
import { populateServiceCheckboxes, setDefaultDates } from './ui';
import { initInactivityListeners } from './listeners';

/** Markup der Seite. IDs nur für JS, Klassen für CSS. */
export function render(): string {
    return `
      <div class="dr-inactivity" id="inactivityRoot">
        <div class="dr-content dr-content-narrow">

          <div class="dr-inactivity-form">
            <div class="dr-inactivity-col">
              <div class="dr-inactivity-panel">
                <div class="dr-field">
                  <label for="inactivityGroupSearch" class="dr-field-heading">Gruppe *</label>
                  <div class="dr-autocomplete">
                    <input type="text" id="inactivityGroupSearch" class="dr-input"
                          placeholder="Gruppe suchen..." autocomplete="off" disabled />
                    <div id="inactivityGroupSuggestions" class="dr-autocomplete-list" role="listbox"></div>
                  </div>
                </div>
              </div>

              <div class="dr-inactivity-panel">
                <div class="dr-field">
                  <label id="inactivityServicesLabel" class="dr-field-heading">Dienste *</label>
                  <div id="inactivityServiceCheckboxes" class="dr-service-checkboxes"
                      role="group" aria-labelledby="inactivityServicesLabel">
                    <p class="dr-empty">Dienste werden geladen...</p>
                  </div>
                </div>
              </div>
            </div>

            <div class="dr-inactivity-col">
              <div class="dr-inactivity-panel">
                <div class="dr-field">
                  <span class="dr-label dr-field-heading">Zeitraum</span>

                  <div class="dr-field dr-field--nested">
                    <label for="inactivityDateFrom">Von</label>
                    <input type="date" id="inactivityDateFrom" class="dr-input" />
                    <div class="dr-quick-buttons">
                      <button type="button" class="dr-quick dr-quick-from" data-months="0">Heute</button>
                      <button type="button" class="dr-quick dr-quick-from" data-months="1">- 1M</button>
                      <button type="button" class="dr-quick dr-quick-from" data-months="2">- 2M</button>
                      <button type="button" class="dr-quick dr-quick-from" data-months="3">- 3M</button>
                      <button type="button" class="dr-quick dr-quick-from" data-months="6">- 6M</button>
                      <button type="button" class="dr-quick dr-quick-from" data-months="12">- 12M</button>
                    </div>
                  </div>

                  <div class="dr-field dr-field--nested">
                    <label for="inactivityDateTo">Bis</label>
                    <input type="date" id="inactivityDateTo" class="dr-input" />
                  <div class="dr-quick-buttons">
                      <button type="button" class="dr-quick dr-quick-to" data-months="0">Heute</button>
                      <button type="button" class="dr-quick dr-quick-to" data-months="1">+1M</button>
                      <button type="button" class="dr-quick dr-quick-to" data-months="2">+2M</button>
                      <button type="button" class="dr-quick dr-quick-to" data-months="3">+3M</button>
                      <button type="button" class="dr-quick dr-quick-to" data-months="6">+6M</button>
                      <button type="button" class="dr-quick dr-quick-to" data-months="12">+12M</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="dr-actions">
            <button type="button" id="inactivitySearchBtn" class="dr-btn dr-btn--primary" disabled>
              Inaktive finden
            </button>
            <button type="button" id="inactivityResetBtn" class="dr-btn dr-btn--secondary">
              Zurücksetzen
            </button>
          </div>

          <section id="inactivityResultsSection" class="dr-results">
            <div class="dr-results-header">
              <h2>Ergebnisse</h2>
              <div class="dr-results-meta">
                <span class="dr-badge"><span id="inactivityResultCount">0</span> Personen</span>
                <label class="dr-checkbox-label" for="inactivitySelectAll">
                  <input type="checkbox" id="inactivitySelectAll" disabled />
                  <span>Alle auswählen</span>
                </label>
              </div>
            </div>

            <div id="inactivityPersonList" class="dr-person-list"></div>

            <div class="dr-actions">
              <button type="button" id="inactivityAddToGroupBtn" class="dr-btn dr-btn--primary">
                Zu Gruppe hinzufügen
              </button>
            </div>
          </section>
        </div>
      </div>

      <div id="inactivityGroupModal" class="dr-modal" role="dialog" aria-modal="true"
           aria-labelledby="inactivityModalTitle">
        <div class="dr-modal-content">
          <h3 id="inactivityModalTitle">Zu Gruppe hinzufügen</h3>

          <div class="dr-field">
            <label for="inactivityTargetGroupSearch">Zielgruppe auswählen:</label>
            <div class="dr-autocomplete">
              <input type="text" id="inactivityTargetGroupSearch" class="dr-input"
                     placeholder="Zielgruppe suchen..." autocomplete="off" />
              <div id="inactivityTargetGroupSuggestions" class="dr-autocomplete-list" role="listbox"></div>
            </div>
          </div>

          <div class="dr-modal-actions">
            <button type="button" id="inactivityModalCancelBtn" class="dr-btn dr-btn--secondary">
              Abbrechen
            </button>
            <button type="button" id="inactivityModalConfirmBtn" class="dr-btn dr-btn--primary">
              Hinzufügen
            </button>
          </div>
        </div>
      </div>
    `;
}

let cleanupListeners: (() => void) | null = null;
let instanceId = 0;

export async function init(): Promise<void> {
    const id = ++instanceId;
    const elements = getElements();

    // IDEMPOTENZ: Läuft init erneut (doppeltes Rendern, schneller Wechsel),
    // zuerst die vorherige Instanz aufräumen – sonst stapeln sich Listener
    // und die alte Aufräumfunktion geht verloren.
    cleanupListeners?.();
    cleanupListeners = null;

    resetState();
    resetServiceGroupIndex();

    cleanupListeners = initInactivityListeners(elements);

    try {
        await loadInactivityData();

        // Während des Ladens verlassen/erneuert? Dann ist dieser Durchlauf veraltet.
        if (id !== instanceId) return;

        populateServiceCheckboxes(elements);
        setDefaultDates(elements);

        elements.groupSearch.disabled = false;
        elements.searchBtn.disabled = false;
    } catch (error) {
        if (id !== instanceId) return;

        showStatus(
            'Fehler beim Laden der Daten: ' +
                (error instanceof Error ? error.message : 'Unbekannter Fehler'),
            'error'
        );
    }
}

export function destroy(): void {
    instanceId++;
    cleanupListeners?.();
    cleanupListeners = null;

    resetState();
    resetServiceGroupIndex();
    clearStatusToasts();
}