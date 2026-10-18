import { showStatus, hideStatus } from '../../components/toast';
import { createAutocomplete, type AutocompleteInstance } from '../../components/autocomplete';
import {
    clearServiceCheckboxes,
    getSelectedServiceIds,
    initQuickDateButtons,
} from '../../components/form-controls';
import { searchInactiveMembers } from './search';
import { addPersonsToGroup } from '../../api/groups';
import { state, type InactivityElements } from './state';
import {
    displayResults,
    getGroupSuggestions,
    hideResults,
    updateSelectAllState,
} from './ui';

/**
 * Verdrahtet alle Interaktionen der Seite und gibt eine Aufräumfunktion
 * zurück. Diese entfernt sämtliche Listener – inklusive der document-Handler
 * des Autocomplete, die sonst bei jedem Seitenbesuch erneut dazukämen.
 */
export function initInactivityListeners(elements: InactivityElements): () => void {
    const autocompletes: AutocompleteInstance[] = [];

    // ── Gruppensuche ─────────────────────────────────────────────────────
    autocompletes.push(
        createAutocomplete({
            input: elements.groupSearch,
            list: elements.groupSuggestions,
            getSuggestions: filterText => getGroupSuggestions(filterText),
            emptyText: 'Keine Gruppen gefunden',
            onInput: () => { state.selectedGroupId = ''; },
            onSelect: (id, label) => {
                state.selectedGroupId = id;
                elements.groupSearch.value = label;
            },
        })
    );

    // ── Zielgruppensuche (Modal) ─────────────────────────────────────────
    autocompletes.push(
        createAutocomplete({
            input: elements.targetGroupSearch,
            list: elements.targetGroupSuggestions,
            // Die Suchgruppe wird ausgeschlossen – niemand soll sich selbst hinzufügen
            getSuggestions: filterText => getGroupSuggestions(filterText, state.selectedGroupId),
            emptyText: 'Keine Zielgruppen gefunden',
            onInput: () => { state.selectedTargetGroupId = ''; },
            onSelect: (id, label) => {
                state.selectedTargetGroupId = id;
                elements.targetGroupSearch.value = label;
            },
        })
    );

    function clearGroupSelection(): void {
        state.selectedGroupId = '';
        elements.groupSearch.value = '';
        autocompletes[0].close();
    }

    function clearTargetGroupSelection(): void {
        state.selectedTargetGroupId = '';
        elements.targetGroupSearch.value = '';
        autocompletes[1].close();
    }

    function openModal(): void {
        elements.groupModal.classList.add('is-open');
        elements.targetGroupSearch.focus();
    }

    function closeModal(): void {
        elements.groupModal.classList.remove('is-open');
        clearTargetGroupSelection();
    }

    // ── Schnelldatum-Buttons ─────────────────────────────────────────────
    const cleanupQuickDates = initQuickDateButtons(elements.root, {
        fromInput: elements.dateFrom,
        toInput: elements.dateTo,
    });

    // Manuelle Datumsänderung hebt die Schnellauswahl auf
    const clearQuickFrom = () => {
        elements.root.querySelectorAll('.dr-quick-from').forEach(btn => btn.classList.remove('active'));
    };
    const clearQuickTo = () => {
        elements.root.querySelectorAll('.dr-quick-to').forEach(btn => btn.classList.remove('active'));
    };

    elements.dateFrom.addEventListener('change', clearQuickFrom);
    elements.dateTo.addEventListener('change', clearQuickTo);

    // ── Alle auswählen ───────────────────────────────────────────────────
    const handleSelectAll = () => {
        const shouldSelect = elements.selectAllResults.checked;

        state.inactivePersons.forEach(person => { person.selected = shouldSelect; });
        elements.personList
            .querySelectorAll<HTMLInputElement>('.dr-inactivity-person-checkbox')
            .forEach(checkbox => { checkbox.checked = shouldSelect; });

        updateSelectAllState(elements);   // ← statt: elements.selectAllResults.indeterminate = false;
    };

    elements.selectAllResults.addEventListener('change', handleSelectAll);

    // ── Suche ────────────────────────────────────────────────────────────
    const handleSearch = async () => {
        const groupId = state.selectedGroupId;
        const selectedServices = getSelectedServiceIds(elements.serviceCheckboxes);
        const fromDate = elements.dateFrom.value;
        const toDate = elements.dateTo.value;

        if (!groupId) {
            showStatus('Bitte wähle eine Gruppe', 'error');
            return;
        }
        if (selectedServices.length === 0) {
            showStatus('Bitte wähle mindestens einen Dienst', 'error');
            return;
        }
        if (!fromDate || !toDate) {
            showStatus('Bitte gebe einen vollständigen Zeitraum ein', 'error');
            return;
        }

        elements.searchBtn.disabled = true;
        showStatus('🔄 Lade Gruppenmitglieder...', 'loading');

        try {
            showStatus('🔄 Analysiere Daten...', 'loading');
            const results = await searchInactiveMembers(groupId, selectedServices, fromDate, toDate);

            displayResults(elements, results);

            if (results.length === 0) {
                showStatus('✓ Alle Gruppenmitglieder haben die ausgewählten Dienste gemacht', 'success');
            } else {
                showStatus(
                    `✓ ${results.length} inaktive Person${results.length !== 1 ? 'en' : ''} gefunden`,
                    'success'
                );
            }
        } catch (error) {
            showStatus(
                'Fehler bei der Suche: ' +
                    (error instanceof Error ? error.message : 'Unbekannter Fehler'),
                'error'
            );
        } finally {
            elements.searchBtn.disabled = false;
        }
    };

    elements.searchBtn.addEventListener('click', handleSearch);

    // ── Zurücksetzen ─────────────────────────────────────────────────────
    const handleReset = () => {
        clearGroupSelection();
        clearTargetGroupSelection();
        clearServiceCheckboxes(elements.serviceCheckboxes);

        // Standard-Zeitraum wiederherstellen (6 Monate zurück, 12 Monate voraus)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const twelveMonthsAhead = new Date();
        twelveMonthsAhead.setMonth(twelveMonthsAhead.getMonth() + 12);

        elements.dateFrom.valueAsDate = sixMonthsAgo;
        elements.dateTo.valueAsDate = twelveMonthsAhead;

        hideResults(elements);
        hideStatus();

        elements.root.querySelectorAll('.dr-quick').forEach(btn => btn.classList.remove('active'));
        elements.root.querySelectorAll<HTMLElement>('.dr-quick-from').forEach(btn => {
            if (btn.dataset.months === '6') btn.classList.add('active');
        });
        elements.root.querySelectorAll<HTMLElement>('.dr-quick-to').forEach(btn => {
            if (btn.dataset.months === '12') btn.classList.add('active');   // ← war '3'
        });
    };

    elements.resetBtn.addEventListener('click', handleReset);

    // ── Zu Gruppe hinzufügen ─────────────────────────────────────────────
    const handleAddToGroup = () => {
        const selected = state.inactivePersons.filter(person => person.selected);

        if (selected.length === 0) {
            showStatus('Bitte wähle mindestens eine Person aus', 'error');
            return;
        }

        clearTargetGroupSelection();
        openModal();
    };

    elements.addToGroupBtn.addEventListener('click', handleAddToGroup);

    // ── Modal ────────────────────────────────────────────────────────────
    const handleModalConfirm = async () => {
        const targetGroupId = state.selectedTargetGroupId;
        const selected = state.inactivePersons.filter(person => person.selected);

        if (!targetGroupId) {
            showStatus('Bitte wähle eine Zielgruppe', 'error');
            return;
        }

        closeModal();

        elements.addToGroupBtn.disabled = true;
        elements.modalConfirmBtn.disabled = true;
        showStatus(
            `🔄 Füge ${selected.length} Person${selected.length !== 1 ? 'en' : ''} zu Gruppe hinzu...`,
            'loading'
        );

        try {
            const personIds = selected.map(person => person.person.id);
            const { successCount, errorCount, permissionErrors, alreadyMembers, otherErrors } =
                await addPersonsToGroup(targetGroupId, personIds);

            if (errorCount === 0) {
                showStatus(
                    `✓ ${successCount} Person${successCount !== 1 ? 'en' : ''} erfolgreich zur Gruppe hinzugefügt`,
                    'success'
                );
            } else {
                let message = `⚠️ ${successCount} erfolgreich, ${errorCount} fehlgeschlagen`;
                if (alreadyMembers > 0) {
                    message += ` (${alreadyMembers} Person${alreadyMembers !== 1 ? 'en' : ''} bereits Mitglied)`;
                }
                if (permissionErrors > 0) {
                    message += ` (${permissionErrors}× keine Berechtigung dieser Gruppe Personen hinzuzufügen)`;
                }
                if (otherErrors.length > 0) {
                    message += ` - ${otherErrors.join(', ')}`;
                }
                showStatus(message, 'error');
            }
        } catch (error) {
            showStatus(
                'Fehler beim Hinzufügen: ' +
                    (error instanceof Error ? error.message : 'Unbekannter Fehler'),
                'error'
            );
        } finally {
            elements.addToGroupBtn.disabled = false;
            elements.modalConfirmBtn.disabled = false;
        }
    };

    elements.modalConfirmBtn.addEventListener('click', handleModalConfirm);
    elements.modalCancelBtn.addEventListener('click', closeModal);

    const handleModalBackdrop = (event: MouseEvent) => {
        if (event.target === elements.groupModal) closeModal();
    };
    elements.groupModal.addEventListener('click', handleModalBackdrop);

    // ── Aufräumen ────────────────────────────────────────────────────────
    return () => {
        autocompletes.forEach(instance => instance.destroy());
        cleanupQuickDates();

        elements.dateFrom.removeEventListener('change', clearQuickFrom);
        elements.dateTo.removeEventListener('change', clearQuickTo);
        elements.selectAllResults.removeEventListener('change', handleSelectAll);
        elements.searchBtn.removeEventListener('click', handleSearch);
        elements.resetBtn.removeEventListener('click', handleReset);
        elements.addToGroupBtn.removeEventListener('click', handleAddToGroup);
        elements.modalConfirmBtn.removeEventListener('click', handleModalConfirm);
        elements.modalCancelBtn.removeEventListener('click', closeModal);
        elements.groupModal.removeEventListener('click', handleModalBackdrop);
    };
}