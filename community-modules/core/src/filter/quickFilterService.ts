import type { ColumnModel } from '../columns/columnModel';
import type { PivotResultColsService } from '../columns/pivotResultColsService';
import { BeanStub } from '../context/beanStub';
import { Autowired, Bean, PostConstruct } from '../context/context';
import type { GetQuickFilterTextParams } from '../entities/colDef';
import type { Column } from '../entities/column';
import type { RowNode } from '../entities/rowNode';
import { Events } from '../eventKeys';
import type { IRowModel } from '../interfaces/iRowModel';
import { _exists } from '../utils/generic';
import type { ValueService } from '../valueService/valueService';

@Bean('quickFilterService')
export class QuickFilterService extends BeanStub {
    @Autowired('valueService') private valueService: ValueService;
    @Autowired('columnModel') private columnModel: ColumnModel;
    @Autowired('rowModel') private rowModel: IRowModel;
    @Autowired('pivotResultColsService') private pivotResultColsService: PivotResultColsService;

    public static readonly EVENT_QUICK_FILTER_CHANGED = 'quickFilterChanged';
    private static readonly QUICK_FILTER_SEPARATOR = '\n';

    // the columns the quick filter should use. this will be all primary columns plus the autoGroupColumns if any exist
    private colsForQuickFilter: Column[];

    private quickFilter: string | null = null;
    private quickFilterParts: string[] | null = null;
    private parser?: (quickFilter: string) => string[];
    private matcher?: (quickFilterParts: string[], rowQuickFilterAggregateText: string) => boolean;

    @PostConstruct
    private postConstruct(): void {
        this.addManagedListener(this.eventService, Events.EVENT_COLUMN_PIVOT_MODE_CHANGED, () =>
            this.resetQuickFilterCache()
        );
        this.addManagedListener(this.eventService, Events.EVENT_NEW_COLUMNS_LOADED, () => this.resetQuickFilterCache());
        this.addManagedListener(this.eventService, Events.EVENT_COLUMN_ROW_GROUP_CHANGED, () =>
            this.resetQuickFilterCache()
        );
        this.addManagedListener(this.eventService, Events.EVENT_COLUMN_VISIBLE, () => {
            if (!this.gos.get('includeHiddenColumnsInQuickFilter')) {
                this.resetQuickFilterCache();
            }
        });

        this.addManagedPropertyListener('quickFilterText', (e) => this.setQuickFilter(e.currentValue));
        this.addManagedPropertyListeners(
            ['includeHiddenColumnsInQuickFilter', 'applyQuickFilterBeforePivotOrAgg'],
            () => this.onQuickFilterColumnConfigChanged()
        );

        this.quickFilter = this.parseQuickFilter(this.gos.get('quickFilterText'));
        this.parser = this.gos.get('quickFilterParser');
        this.matcher = this.gos.get('quickFilterMatcher');
        this.setQuickFilterParts();

        this.addManagedPropertyListeners(['quickFilterMatcher', 'quickFilterParser'], () =>
            this.setQuickFilterParserAndMatcher()
        );
    }

    // if we are using autoGroupCols, then they should be included for quick filter. this covers the
    // following scenarios:
    // a) user provides 'field' into autoGroupCol of normal grid, so now because a valid col to filter leafs on
    // b) using tree data and user depends on autoGroupCol for first col, and we also want to filter on this
    //    (tree data is a bit different, as parent rows can be filtered on, unlike row grouping)
    public refreshQuickFilterCols(): void {
        const pivotMode = this.columnModel.isPivotMode();
        const groupAutoCols = this.columnModel.getAutoCols();
        const providedCols = this.columnModel.getColDefCols();

        let columnsForQuickFilter =
            (pivotMode && !this.gos.get('applyQuickFilterBeforePivotOrAgg')
                ? this.pivotResultColsService.getPivotResultCols()?.list
                : providedCols) ?? [];
        if (groupAutoCols) {
            columnsForQuickFilter = columnsForQuickFilter.concat(groupAutoCols);
        }
        this.colsForQuickFilter = this.gos.get('includeHiddenColumnsInQuickFilter')
            ? columnsForQuickFilter
            : columnsForQuickFilter.filter((col) => col.isVisible() || col.isRowGroupActive());
    }

    public isQuickFilterPresent(): boolean {
        return this.quickFilter !== null;
    }

    public doesRowPassQuickFilter(node: RowNode): boolean {
        const usingCache = this.gos.get('cacheQuickFilter');

        if (this.matcher) {
            return this.doesRowPassQuickFilterMatcher(usingCache, node);
        }

        // each part must pass, if any fails, then the whole filter fails
        return this.quickFilterParts!.every((part) =>
            usingCache ? this.doesRowPassQuickFilterCache(node, part) : this.doesRowPassQuickFilterNoCache(node, part)
        );
    }

    public resetQuickFilterCache(): void {
        this.rowModel.forEachNode((node) => (node.quickFilterAggregateText = null));
    }

    private setQuickFilterParts(): void {
        const { quickFilter, parser } = this;
        if (quickFilter) {
            this.quickFilterParts = parser ? parser(quickFilter) : quickFilter.split(' ');
        } else {
            this.quickFilterParts = null;
        }
    }

    private parseQuickFilter(newFilter?: string): string | null {
        if (!_exists(newFilter)) {
            return null;
        }

        if (!this.gos.isRowModelType('clientSide')) {
            console.warn('AG Grid - Quick filtering only works with the Client-Side Row Model');
            return null;
        }

        return newFilter.toUpperCase();
    }

    private setQuickFilter(newFilter: string | undefined): void {
        if (newFilter != null && typeof newFilter !== 'string') {
            console.warn(
                `AG Grid - Grid option quickFilterText only supports string inputs, received: ${typeof newFilter}`
            );
            return;
        }

        const parsedFilter = this.parseQuickFilter(newFilter);

        if (this.quickFilter !== parsedFilter) {
            this.quickFilter = parsedFilter;
            this.setQuickFilterParts();
            this.dispatchEvent({ type: QuickFilterService.EVENT_QUICK_FILTER_CHANGED });
        }
    }

    private setQuickFilterParserAndMatcher(): void {
        const parser = this.gos.get('quickFilterParser');
        const matcher = this.gos.get('quickFilterMatcher');
        const hasChanged = parser !== this.parser || matcher !== this.matcher;
        this.parser = parser;
        this.matcher = matcher;
        if (hasChanged) {
            this.setQuickFilterParts();
            this.dispatchEvent({ type: QuickFilterService.EVENT_QUICK_FILTER_CHANGED });
        }
    }

    private onQuickFilterColumnConfigChanged(): void {
        this.refreshQuickFilterCols();
        this.resetQuickFilterCache();
        if (this.isQuickFilterPresent()) {
            this.dispatchEvent({ type: QuickFilterService.EVENT_QUICK_FILTER_CHANGED });
        }
    }

    private doesRowPassQuickFilterNoCache(node: RowNode, filterPart: string): boolean {
        return this.colsForQuickFilter.some((column) => {
            const part = this.getQuickFilterTextForColumn(column, node);

            return _exists(part) && part.indexOf(filterPart) >= 0;
        });
    }

    private doesRowPassQuickFilterCache(node: RowNode, filterPart: string): boolean {
        this.checkGenerateQuickFilterAggregateText(node);

        return node.quickFilterAggregateText!.indexOf(filterPart) >= 0;
    }

    private doesRowPassQuickFilterMatcher(usingCache: boolean, node: RowNode): boolean {
        let quickFilterAggregateText: string;
        if (usingCache) {
            this.checkGenerateQuickFilterAggregateText(node);
            quickFilterAggregateText = node.quickFilterAggregateText!;
        } else {
            quickFilterAggregateText = this.getQuickFilterAggregateText(node);
        }
        const { quickFilterParts, matcher } = this;
        return matcher!(quickFilterParts!, quickFilterAggregateText);
    }

    private checkGenerateQuickFilterAggregateText(node: RowNode): void {
        if (!node.quickFilterAggregateText) {
            node.quickFilterAggregateText = this.getQuickFilterAggregateText(node);
        }
    }

    private getQuickFilterTextForColumn(column: Column, node: RowNode): string {
        let value = this.valueService.getValue(column, node, true);
        const colDef = column.getColDef();

        if (colDef.getQuickFilterText) {
            const params: GetQuickFilterTextParams = this.gos.addGridCommonParams({
                value,
                node,
                data: node.data,
                column,
                colDef,
            });

            value = colDef.getQuickFilterText(params);
        }

        return _exists(value) ? value.toString().toUpperCase() : null;
    }

    private getQuickFilterAggregateText(node: RowNode): string {
        const stringParts: string[] = [];

        this.colsForQuickFilter.forEach((column) => {
            const part = this.getQuickFilterTextForColumn(column, node);

            if (_exists(part)) {
                stringParts.push(part);
            }
        });

        return stringParts.join(QuickFilterService.QUICK_FILTER_SEPARATOR);
    }
}
