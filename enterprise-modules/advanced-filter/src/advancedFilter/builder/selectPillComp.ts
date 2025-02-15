import type {
    RichSelectParams,
    VirtualList} from '@ag-grid-community/core';
import {
    AgInputTextField,
    _setAriaLabel,
    _setAriaLabelledBy,
    _stopPropagationForAgGrid,
} from '@ag-grid-community/core';
import { AgRichSelect } from '@ag-grid-enterprise/core';

import type { AutocompleteEntry } from '../autocomplete/autocompleteParams';

export interface SelectPillParams extends RichSelectParams<AutocompleteEntry> {
    getEditorParams: () => { values?: any[] };
    wrapperClassName: string;
    ariaLabel: string;
}

export class SelectPillComp extends AgRichSelect<AutocompleteEntry> {
    constructor(private readonly params: SelectPillParams) {
        super({
            ...params,
            template: /* html */ `
                <div class="ag-picker-field ag-advanced-filter-builder-pill-wrapper" role="presentation">
                    <div ref="eLabel"></div>
                    <div ref="eWrapper" class="ag-wrapper ag-advanced-filter-builder-pill ag-picker-collapsed">
                        <div ref="eDisplayField" class="ag-picker-field-display ag-advanced-filter-builder-pill-display"></div>
                        <ag-input-text-field ref="eInput" class="ag-rich-select-field-input"></ag-input-text-field>
                        <div ref="eIcon" class="ag-picker-field-icon" aria-hidden="true"></div>
                    </div>
                </div>`,
            agComponents: [AgInputTextField],
        });
    }

    public getFocusableElement(): HTMLElement {
        return this.eWrapper;
    }

    public showPicker(): void {
        // avoid focus handling issues with multiple rich selects
        setTimeout(() => super.showPicker());
    }

    public hidePicker(): void {
        // avoid focus handling issues with multiple rich selects
        setTimeout(() => super.hidePicker());
    }

    protected postConstruct(): void {
        super.postConstruct();

        const { wrapperClassName, ariaLabel } = this.params;

        this.eWrapper.classList.add(wrapperClassName);
        _setAriaLabelledBy(this.eWrapper, '');
        _setAriaLabel(this.eWrapper, ariaLabel);
    }

    protected createPickerComponent(): VirtualList {
        if (!this.values) {
            const { values } = this.params.getEditorParams();
            this.values = values!;
            const key = this.value.key;
            const value = values!.find((value) => value.key === key) ?? {
                key,
                displayValue: this.value.displayValue,
            };
            this.value = value;
        }
        return super.createPickerComponent();
    }

    protected onEnterKeyDown(event: KeyboardEvent): void {
        _stopPropagationForAgGrid(event);
        if (this.isPickerDisplayed) {
            super.onEnterKeyDown(event);
        } else {
            event.preventDefault();
            this.showPicker();
        }
    }
}
