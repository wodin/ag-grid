import { ClientSideRowModelModule } from '@ag-grid-community/client-side-row-model';
import { CellValueChangedEvent, GridApi, GridOptions, ICellEditorParams, createGrid } from '@ag-grid-community/core';
import { ModuleRegistry } from '@ag-grid-community/core';
import { ColumnsToolPanelModule } from '@ag-grid-enterprise/column-tool-panel';
import { MenuModule } from '@ag-grid-enterprise/menu';
import { RichSelectModule } from '@ag-grid-enterprise/rich-select';

import { IRow, getData } from './data';
import { GenderCellRenderer } from './genderCellRenderer_typescript';

ModuleRegistry.registerModules([ClientSideRowModelModule, ColumnsToolPanelModule, MenuModule, RichSelectModule]);

const cellCellEditorParams = (params: ICellEditorParams<IRow>) => {
    const selectedCountry = params.data.country;
    const allowedCities = countyToCityMap(selectedCountry);

    return {
        values: allowedCities,
        formatValue: (value: any) => `${value} (${selectedCountry})`,
    };
};

let gridApi: GridApi;

const gridOptions: GridOptions = {
    columnDefs: [
        { field: 'name' },
        {
            field: 'gender',
            cellRenderer: GenderCellRenderer,
            cellEditor: 'agRichSelectCellEditor',
            cellEditorParams: {
                values: ['Male', 'Female'],
                cellRenderer: GenderCellRenderer,
                cellEditorPopup: true,
            },
        },
        {
            field: 'country',
            cellEditor: 'agRichSelectCellEditor',
            cellEditorParams: {
                cellHeight: 50,
                values: ['Ireland', 'USA'],
            },
        },
        {
            field: 'city',
            cellEditor: 'agRichSelectCellEditor',
            cellEditorParams: cellCellEditorParams,
        },
        { field: 'address', cellEditor: 'agLargeTextCellEditor', cellEditorPopup: true, minWidth: 550 },
    ],
    defaultColDef: {
        flex: 1,
        minWidth: 130,
        editable: true,
    },
    rowData: getData(),
    onCellValueChanged: onCellValueChanged,
};

function countyToCityMap(match: string): string[] {
    const map: { [key: string]: string[] } = {
        Ireland: ['Dublin', 'Cork', 'Galway'],
        USA: ['New York', 'Los Angeles', 'Chicago', 'Houston'],
    };

    return map[match];
}

function onCellValueChanged(params: CellValueChangedEvent) {
    const colId = params.column.getId();

    if (colId === 'country') {
        const selectedCountry = params.data.country;
        const selectedCity = params.data.city;
        const allowedCities = countyToCityMap(selectedCountry) || [];
        const cityMismatch = allowedCities.indexOf(selectedCity) < 0;

        if (cityMismatch) {
            params.node.setDataValue('city', null);
        }
    }
}

// setup the grid after the page has finished loading
document.addEventListener('DOMContentLoaded', () => {
    const gridDiv = document.querySelector<HTMLElement>('#myGrid')!;
    gridApi = createGrid(gridDiv, gridOptions);
});
