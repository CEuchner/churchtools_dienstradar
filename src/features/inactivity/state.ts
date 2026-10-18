import type { Group, Service, ServiceGroup, Person } from '../../utils/ct-types';
import type { UserPermissions } from '../../api/permissions';

export interface InactivePersonData {
    person: Person;
    selected: boolean;
}

export interface InactivityState {
    groups: Group[];
    services: Service[];
    serviceGroups: ServiceGroup[];
    inactivePersons: InactivePersonData[];
    selectedGroupId: string;
    selectedTargetGroupId: string;
    userPermissions: UserPermissions | null;
}

function createEmptyState(): InactivityState {
    return {
        groups: [],
        services: [],
        serviceGroups: [],
        inactivePersons: [],
        selectedGroupId: '',
        selectedTargetGroupId: '',
        userPermissions: null,
    };
}

/**
 * Seiten-State. Wird beim Betreten der Seite über `resetState()` geleert,
 * damit ein erneuter Besuch nicht auf den Daten des letzten Besuchs aufsetzt.
 */
export const state: InactivityState = createEmptyState();

export function resetState(): void {
    Object.assign(state, createEmptyState());
}

export interface InactivityElements {
    root: HTMLElement;
    groupSearch: HTMLInputElement;
    groupSuggestions: HTMLElement;
    serviceCheckboxes: HTMLElement;
    dateFrom: HTMLInputElement;
    dateTo: HTMLInputElement;
    searchBtn: HTMLButtonElement;
    resetBtn: HTMLButtonElement;
    addToGroupBtn: HTMLButtonElement;
    resultsSection: HTMLElement;
    personList: HTMLElement;
    resultCount: HTMLElement;
    selectAllResults: HTMLInputElement;
    groupModal: HTMLElement;
    targetGroupSearch: HTMLInputElement;
    targetGroupSuggestions: HTMLElement;
    modalCancelBtn: HTMLButtonElement;
    modalConfirmBtn: HTMLButtonElement;
}

function requireElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Element #${id} nicht gefunden – wurde das Markup gerendert?`);
    }
    return element as T;
}

/**
 * Löst die DOM-Referenzen auf.
 *
 * Bewusst eine Funktion und kein Objekt auf Modulebene: Bei einem Seitenwechsel
 * ersetzt der Router das Markup. Ein einmal beim Import eingefrorenes
 * Element-Objekt würde danach auf abgehängte Knoten zeigen – die Seite sähe
 * korrekt aus, Klicks liefen aber ins Leere.
 */
export function getElements(): InactivityElements {
    return {
        root: requireElement('inactivityRoot'),
        groupSearch: requireElement('inactivityGroupSearch'),
        groupSuggestions: requireElement('inactivityGroupSuggestions'),
        serviceCheckboxes: requireElement('inactivityServiceCheckboxes'),
        dateFrom: requireElement('inactivityDateFrom'),
        dateTo: requireElement('inactivityDateTo'),
        searchBtn: requireElement('inactivitySearchBtn'),
        resetBtn: requireElement('inactivityResetBtn'),
        addToGroupBtn: requireElement('inactivityAddToGroupBtn'),
        resultsSection: requireElement('inactivityResultsSection'),
        personList: requireElement('inactivityPersonList'),
        resultCount: requireElement('inactivityResultCount'),
        selectAllResults: requireElement('inactivitySelectAll'),
        groupModal: requireElement('inactivityGroupModal'),
        targetGroupSearch: requireElement('inactivityTargetGroupSearch'),
        targetGroupSuggestions: requireElement('inactivityTargetGroupSuggestions'),
        modalCancelBtn: requireElement('inactivityModalCancelBtn'),
        modalConfirmBtn: requireElement('inactivityModalConfirmBtn'),
    };
}