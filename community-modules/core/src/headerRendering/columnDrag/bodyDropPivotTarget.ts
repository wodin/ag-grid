import type { FuncColsService } from '../../columns/funcColsService';
import { Autowired } from '../../context/context';
import type { DraggingEvent } from '../../dragAndDrop/dragAndDropService';
import { DragAndDropService } from '../../dragAndDrop/dragAndDropService';
import type { Column, ColumnPinnedType } from '../../entities/column';
import type { GridOptionsService } from '../../gridOptionsService';
import type { DropListener } from './bodyDropTarget';

export class BodyDropPivotTarget implements DropListener {
    @Autowired('gridOptionsService') private gos: GridOptionsService;
    @Autowired('funcColsService') private readonly funcColsService: FuncColsService;

    private columnsToAggregate: Column[] = [];
    private columnsToGroup: Column[] = [];
    private columnsToPivot: Column[] = [];

    private pinned: ColumnPinnedType;

    constructor(pinned: ColumnPinnedType) {
        this.pinned = pinned;
    }

    /** Callback for when drag enters */
    public onDragEnter(draggingEvent: DraggingEvent): void {
        this.clearColumnsList();

        // in pivot mode, we don't accept any drops if functions are read only
        if (this.gos.get('functionsReadOnly')) {
            return;
        }

        const dragColumns: Column[] | undefined = draggingEvent.dragItem.columns;

        if (!dragColumns) {
            return;
        }

        dragColumns.forEach((column) => {
            // we don't allow adding secondary columns
            if (!column.isPrimary()) {
                return;
            }

            if (column.isAnyFunctionActive()) {
                return;
            }

            if (column.isAllowValue()) {
                this.columnsToAggregate.push(column);
            } else if (column.isAllowRowGroup()) {
                this.columnsToGroup.push(column);
            } else if (column.isAllowPivot()) {
                this.columnsToPivot.push(column);
            }
        });
    }

    public getIconName(): string | null {
        const totalColumns = this.columnsToAggregate.length + this.columnsToGroup.length + this.columnsToPivot.length;
        if (totalColumns > 0) {
            return this.pinned ? DragAndDropService.ICON_PINNED : DragAndDropService.ICON_MOVE;
        }

        return null;
    }

    /** Callback for when drag leaves */
    public onDragLeave(draggingEvent: DraggingEvent): void {
        // if we are taking columns out of the center, then we remove them from the report
        this.clearColumnsList();
    }

    private clearColumnsList(): void {
        this.columnsToAggregate.length = 0;
        this.columnsToGroup.length = 0;
        this.columnsToPivot.length = 0;
    }

    /** Callback for when dragging */
    public onDragging(draggingEvent: DraggingEvent): void {}

    /** Callback for when drag stops */
    public onDragStop(draggingEvent: DraggingEvent): void {
        if (this.columnsToAggregate.length > 0) {
            this.funcColsService.addValueColumns(this.columnsToAggregate, 'toolPanelDragAndDrop');
        }
        if (this.columnsToGroup.length > 0) {
            this.funcColsService.addRowGroupColumns(this.columnsToGroup, 'toolPanelDragAndDrop');
        }
        if (this.columnsToPivot.length > 0) {
            this.funcColsService.addPivotColumns(this.columnsToPivot, 'toolPanelDragAndDrop');
        }
    }
}
