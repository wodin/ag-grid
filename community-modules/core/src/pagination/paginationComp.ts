import { KeyCode } from '../constants/keyCode';
import { Autowired, PostConstruct } from '../context/context';
import { Events } from '../events';
import type { PaginationNumberFormatterParams } from '../interfaces/iCallbackParams';
import type { WithoutGridCommon } from '../interfaces/iCommon';
import type { RowNodeBlockLoader } from '../rowNodeCache/rowNodeBlockLoader';
import { _setAriaDisabled } from '../utils/aria';
import { _createIconNoSpan } from '../utils/icon';
import { _formatNumberCommas } from '../utils/number';
import type { AgComponentSelector} from '../widgets/component';
import { Component } from '../widgets/component';
import { RefSelector } from '../widgets/componentAnnotations';
import { PageSizeSelectorComp } from './pageSizeSelector/pageSizeSelectorComp';
import type { PaginationProxy } from './paginationProxy';

export class PaginationComp extends Component {
    static readonly selector: AgComponentSelector = 'AG-PAGINATION';

    @Autowired('paginationProxy') private paginationProxy: PaginationProxy;
    @Autowired('rowNodeBlockLoader') private rowNodeBlockLoader: RowNodeBlockLoader;

    @RefSelector('btFirst') private btFirst: HTMLElement;
    @RefSelector('btPrevious') private btPrevious: HTMLElement;
    @RefSelector('btNext') private btNext: HTMLElement;
    @RefSelector('btLast') private btLast: HTMLElement;

    @RefSelector('lbRecordCount') private lbRecordCount: any;
    @RefSelector('lbFirstRowOnPage') private lbFirstRowOnPage: any;
    @RefSelector('lbLastRowOnPage') private lbLastRowOnPage: any;
    @RefSelector('lbCurrent') private lbCurrent: any;
    @RefSelector('lbTotal') private lbTotal: any;

    @RefSelector('pageSizeComp') private pageSizeComp: PageSizeSelectorComp;

    private previousAndFirstButtonsDisabled = false;
    private nextButtonDisabled = false;
    private lastButtonDisabled = false;
    private areListenersSetup = false;

    constructor() {
        super();
    }

    @PostConstruct
    protected postConstruct(): void {
        const isRtl = this.gos.get('enableRtl');
        this.setTemplate(this.getTemplate(), [PageSizeSelectorComp]);

        const { btFirst, btPrevious, btNext, btLast, pageSizeComp } = this;
        this.activateTabIndex([btFirst, btPrevious, btNext, btLast]);

        btFirst.insertAdjacentElement('afterbegin', _createIconNoSpan(isRtl ? 'last' : 'first', this.gos)!);
        btPrevious.insertAdjacentElement('afterbegin', _createIconNoSpan(isRtl ? 'next' : 'previous', this.gos)!);
        btNext.insertAdjacentElement('afterbegin', _createIconNoSpan(isRtl ? 'previous' : 'next', this.gos)!);
        btLast.insertAdjacentElement('afterbegin', _createIconNoSpan(isRtl ? 'first' : 'last', this.gos)!);

        this.addManagedPropertyListener('pagination', this.onPaginationChanged.bind(this));
        this.addManagedPropertyListener('suppressPaginationPanel', this.onPaginationChanged.bind(this));
        this.addManagedPropertyListeners(
            ['paginationPageSizeSelector', 'paginationAutoPageSize', 'suppressPaginationPanel'],
            () => this.onPageSizeRelatedOptionsChange()
        );

        this.pageSizeComp.toggleSelectDisplay(this.pageSizeComp.shouldShowPageSizeSelector());

        this.onPaginationChanged();
    }

    private onPaginationChanged(): void {
        const isPaging = this.gos.get('pagination');
        const paginationPanelEnabled = isPaging && !this.gos.get('suppressPaginationPanel');

        this.setDisplayed(paginationPanelEnabled);
        if (!paginationPanelEnabled) {
            return;
        }

        this.setupListeners();

        this.enableOrDisableButtons();
        this.updateRowLabels();
        this.setCurrentPageLabel();
        this.setTotalLabels();
        this.onPageSizeRelatedOptionsChange();
    }

    private onPageSizeRelatedOptionsChange(): void {
        this.pageSizeComp.toggleSelectDisplay(this.pageSizeComp.shouldShowPageSizeSelector());
    }

    private setupListeners() {
        if (!this.areListenersSetup) {
            this.addManagedListener(
                this.eventService,
                Events.EVENT_PAGINATION_CHANGED,
                this.onPaginationChanged.bind(this)
            );

            [
                { el: this.btFirst, fn: this.onBtFirst.bind(this) },
                { el: this.btPrevious, fn: this.onBtPrevious.bind(this) },
                { el: this.btNext, fn: this.onBtNext.bind(this) },
                { el: this.btLast, fn: this.onBtLast.bind(this) },
            ].forEach((item) => {
                const { el, fn } = item;
                this.addManagedListener(el, 'click', fn);
                this.addManagedListener(el, 'keydown', (e: KeyboardEvent) => {
                    if (e.key === KeyCode.ENTER || e.key === KeyCode.SPACE) {
                        e.preventDefault();
                        fn();
                    }
                });
            });
            this.areListenersSetup = true;
        }
    }

    private onBtFirst() {
        if (!this.previousAndFirstButtonsDisabled) {
            this.paginationProxy.goToFirstPage();
        }
    }

    private setCurrentPageLabel(): void {
        const pagesExist = this.paginationProxy.getTotalPages() > 0;
        const currentPage = this.paginationProxy.getCurrentPage();
        const toDisplay = pagesExist ? currentPage + 1 : 0;

        this.lbCurrent.textContent = this.formatNumber(toDisplay);
    }

    private formatNumber(value: number): string {
        const userFunc = this.gos.getCallback('paginationNumberFormatter');

        if (userFunc) {
            const params: WithoutGridCommon<PaginationNumberFormatterParams> = { value: value };
            return userFunc(params);
        }

        const localeTextFunc = this.localeService.getLocaleTextFunc();
        const thousandSeparator = localeTextFunc('thousandSeparator', ',');
        const decimalSeparator = localeTextFunc('decimalSeparator', '.');

        return _formatNumberCommas(value, thousandSeparator, decimalSeparator);
    }

    private getTemplate(): string {
        const localeTextFunc = this.localeService.getLocaleTextFunc();

        const strPage = localeTextFunc('page', 'Page');
        const strTo = localeTextFunc('to', 'to');
        const strOf = localeTextFunc('of', 'of');
        const strFirst = localeTextFunc('firstPage', 'First Page');
        const strPrevious = localeTextFunc('previousPage', 'Previous Page');
        const strNext = localeTextFunc('nextPage', 'Next Page');
        const strLast = localeTextFunc('lastPage', 'Last Page');
        const compId = this.getCompId();

        return /* html */ `<div class="ag-paging-panel ag-unselectable" id="ag-${compId}">
                <ag-page-size-selector ref="pageSizeComp"></ag-page-size-selector>
                <span class="ag-paging-row-summary-panel" role="status">
                    <span id="ag-${compId}-first-row" ref="lbFirstRowOnPage" class="ag-paging-row-summary-panel-number"></span>
                    <span id="ag-${compId}-to">${strTo}</span>
                    <span id="ag-${compId}-last-row" ref="lbLastRowOnPage" class="ag-paging-row-summary-panel-number"></span>
                    <span id="ag-${compId}-of">${strOf}</span>
                    <span id="ag-${compId}-row-count" ref="lbRecordCount" class="ag-paging-row-summary-panel-number"></span>
                </span>
                <span class="ag-paging-page-summary-panel" role="presentation">
                    <div ref="btFirst" class="ag-button ag-paging-button" role="button" aria-label="${strFirst}"></div>
                    <div ref="btPrevious" class="ag-button ag-paging-button" role="button" aria-label="${strPrevious}"></div>
                    <span class="ag-paging-description" role="status">
                        <span id="ag-${compId}-start-page">${strPage}</span>
                        <span id="ag-${compId}-start-page-number" ref="lbCurrent" class="ag-paging-number"></span>
                        <span id="ag-${compId}-of-page">${strOf}</span>
                        <span id="ag-${compId}-of-page-number" ref="lbTotal" class="ag-paging-number"></span>
                    </span>
                    <div ref="btNext" class="ag-button ag-paging-button" role="button" aria-label="${strNext}"></div>
                    <div ref="btLast" class="ag-button ag-paging-button" role="button" aria-label="${strLast}"></div>
                </span>
            </div>`;
    }

    private onBtNext() {
        if (!this.nextButtonDisabled) {
            this.paginationProxy.goToNextPage();
        }
    }

    private onBtPrevious() {
        if (!this.previousAndFirstButtonsDisabled) {
            this.paginationProxy.goToPreviousPage();
        }
    }

    private onBtLast() {
        if (!this.lastButtonDisabled) {
            this.paginationProxy.goToLastPage();
        }
    }

    private enableOrDisableButtons() {
        const currentPage = this.paginationProxy.getCurrentPage();
        const maxRowFound = this.paginationProxy.isLastPageFound();
        const totalPages = this.paginationProxy.getTotalPages();

        this.previousAndFirstButtonsDisabled = currentPage === 0;
        this.toggleButtonDisabled(this.btFirst, this.previousAndFirstButtonsDisabled);
        this.toggleButtonDisabled(this.btPrevious, this.previousAndFirstButtonsDisabled);

        const zeroPagesToDisplay = this.isZeroPagesToDisplay();
        const onLastPage = currentPage === totalPages - 1;

        this.nextButtonDisabled = onLastPage || zeroPagesToDisplay;
        this.lastButtonDisabled = !maxRowFound || zeroPagesToDisplay || currentPage === totalPages - 1;

        this.toggleButtonDisabled(this.btNext, this.nextButtonDisabled);
        this.toggleButtonDisabled(this.btLast, this.lastButtonDisabled);
    }

    private toggleButtonDisabled(button: HTMLElement, disabled: boolean) {
        _setAriaDisabled(button, disabled);
        button.classList.toggle('ag-disabled', disabled);
    }

    private updateRowLabels() {
        const currentPage = this.paginationProxy.getCurrentPage();
        const pageSize = this.paginationProxy.getPageSize();
        const maxRowFound = this.paginationProxy.isLastPageFound();
        const rowCount = this.paginationProxy.isLastPageFound() ? this.paginationProxy.getMasterRowCount() : null;

        let startRow: any;
        let endRow: any;

        if (this.isZeroPagesToDisplay()) {
            startRow = endRow = 0;
        } else {
            startRow = pageSize * currentPage + 1;
            endRow = startRow + pageSize - 1;
            if (maxRowFound && endRow > rowCount!) {
                endRow = rowCount;
            }
        }

        this.lbFirstRowOnPage.textContent = this.formatNumber(startRow);
        if (this.rowNodeBlockLoader.isLoading()) {
            const translate = this.localeService.getLocaleTextFunc();
            this.lbLastRowOnPage.innerHTML = translate('pageLastRowUnknown', '?');
        } else {
            this.lbLastRowOnPage.textContent = this.formatNumber(endRow);
        }
    }

    private isZeroPagesToDisplay() {
        const maxRowFound = this.paginationProxy.isLastPageFound();
        const totalPages = this.paginationProxy.getTotalPages();
        return maxRowFound && totalPages === 0;
    }

    private setTotalLabels() {
        const lastPageFound = this.paginationProxy.isLastPageFound();
        const totalPages = this.paginationProxy.getTotalPages();
        const rowCount = lastPageFound ? this.paginationProxy.getMasterRowCount() : null;

        // When `pivotMode=true` and no grouping or value columns exist, a single 'hidden' group row (root node) is in
        // the grid and the pagination totals will correctly display total = 1. However this is confusing to users as
        // they can't see it. To address this UX issue we simply set the totals to zero in the pagination panel.
        if (rowCount === 1) {
            const firstRow = this.paginationProxy.getRow(0);

            // a group node with no group or agg data will not be visible to users
            const hiddenGroupRow = firstRow && firstRow.group && !(firstRow.groupData || firstRow.aggData);
            if (hiddenGroupRow) {
                this.setTotalLabelsToZero();
                return;
            }
        }

        if (lastPageFound) {
            this.lbTotal.textContent = this.formatNumber(totalPages);
            this.lbRecordCount.textContent = this.formatNumber(rowCount!);
        } else {
            const moreText = this.localeService.getLocaleTextFunc()('more', 'more');
            this.lbTotal.innerHTML = moreText;
            this.lbRecordCount.innerHTML = moreText;
        }
    }

    private setTotalLabelsToZero() {
        this.lbFirstRowOnPage.textContent = this.formatNumber(0);
        this.lbCurrent.textContent = this.formatNumber(0);
        this.lbLastRowOnPage.textContent = this.formatNumber(0);
        this.lbTotal.textContent = this.formatNumber(0);
        this.lbRecordCount.textContent = this.formatNumber(0);
    }
}
