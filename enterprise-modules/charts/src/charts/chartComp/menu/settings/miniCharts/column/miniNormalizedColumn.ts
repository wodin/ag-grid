import type { ChartType } from '@ag-grid-community/core';

import type { ThemeTemplateParameters } from '../../miniChartsContainer';
import { MiniStackedColumn } from './miniStackedColumn';

export class MiniNormalizedColumn extends MiniStackedColumn {
    static chartType: ChartType = 'normalizedColumn';
    static data = [
        [10, 10, 10],
        [6, 7, 8],
        [2, 4, 6],
    ];

    constructor(
        container: HTMLElement,
        fills: string[],
        strokes: string[],
        themeTemplateParameters: ThemeTemplateParameters,
        isCustomTheme: boolean
    ) {
        super(
            container,
            fills,
            strokes,
            themeTemplateParameters,
            isCustomTheme,
            MiniNormalizedColumn.data,
            [0, 10],
            'normalizedColumnTooltip'
        );
    }
}
