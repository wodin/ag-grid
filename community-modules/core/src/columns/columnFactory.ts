import { BeanStub } from '../context/beanStub';
import { Autowired, Bean, Qualifier } from '../context/context';
import type { ColDef, ColGroupDef } from '../entities/colDef';
import { Column } from '../entities/column';
import { DefaultColumnTypes } from '../entities/defaultColumnTypes';
import { ProvidedColumnGroup } from '../entities/providedColumnGroup';
import type { ColumnEventType } from '../events';
import type { IProvidedColumn } from '../interfaces/iProvidedColumn';
import type { Logger, LoggerFactory } from '../logger';
import { _warnOnce } from '../utils/function';
import { _attrToBoolean, _attrToNumber } from '../utils/generic';
import { _iterateObject, _mergeDeep } from '../utils/object';
import { ColumnKeyCreator } from './columnKeyCreator';
import type { DataTypeService } from './dataTypeService';

// takes ColDefs and ColGroupDefs and turns them into Columns and OriginalGroups
@Bean('columnFactory')
export class ColumnFactory extends BeanStub {
    @Autowired('dataTypeService') private dataTypeService: DataTypeService;

    private logger: Logger;

    private setBeans(@Qualifier('loggerFactory') loggerFactory: LoggerFactory) {
        this.logger = loggerFactory.create('ColumnFactory');
    }

    public createColumnTree(
        defs: (ColDef | ColGroupDef)[] | null,
        primaryColumns: boolean,
        existingTree: IProvidedColumn[] | undefined,
        source: ColumnEventType
    ): { columnTree: IProvidedColumn[]; treeDept: number } {
        // column key creator dishes out unique column id's in a deterministic way,
        // so if we have two grids (that could be master/slave) with same column definitions,
        // then this ensures the two grids use identical id's.
        const columnKeyCreator = new ColumnKeyCreator();

        const { existingCols, existingGroups, existingColKeys } = this.extractExistingTreeData(existingTree);
        columnKeyCreator.addExistingKeys(existingColKeys);

        // create am unbalanced tree that maps the provided definitions
        const unbalancedTree = this.recursivelyCreateColumns(
            defs,
            0,
            primaryColumns,
            existingCols,
            columnKeyCreator,
            existingGroups,
            source
        );
        const treeDept = this.findMaxDept(unbalancedTree, 0);
        this.logger.log('Number of levels for grouped columns is ' + treeDept);
        const columnTree = this.balanceColumnTree(unbalancedTree, 0, treeDept, columnKeyCreator);

        const deptFirstCallback = (child: IProvidedColumn, parent: ProvidedColumnGroup) => {
            if (child instanceof ProvidedColumnGroup) {
                child.setupExpandable();
            }
            // we set the original parents at the end, rather than when we go along, as balancing the tree
            // adds extra levels into the tree. so we can only set parents when balancing is done.
            child.setOriginalParent(parent);
        };

        depthFirstOriginalTreeSearch(null, columnTree, deptFirstCallback);

        return {
            columnTree,
            treeDept,
        };
    }

    private extractExistingTreeData(existingTree?: IProvidedColumn[]): {
        existingCols: Column[];
        existingGroups: ProvidedColumnGroup[];
        existingColKeys: string[];
    } {
        const existingCols: Column[] = [];
        const existingGroups: ProvidedColumnGroup[] = [];
        const existingColKeys: string[] = [];

        if (existingTree) {
            depthFirstOriginalTreeSearch(null, existingTree, (item: IProvidedColumn) => {
                if (item instanceof ProvidedColumnGroup) {
                    const group = item;
                    existingGroups.push(group);
                } else {
                    const col = item as Column;
                    existingColKeys.push(col.getId());
                    existingCols.push(col);
                }
            });
        }

        return { existingCols, existingGroups, existingColKeys };
    }

    public createForAutoGroups(autoGroupCols: Column[], liveTree: IProvidedColumn[]): [IProvidedColumn[], number] {
        const tree: IProvidedColumn[] = [];
        const dept = this.findDepth(liveTree);

        autoGroupCols.forEach((col) => {
            // at the end, this will be the top of the tree item.
            let nextChild: IProvidedColumn = col;

            for (let i = dept - 1; i >= 0; i--) {
                const autoGroup = new ProvidedColumnGroup(null, `FAKE_PATH_${col.getId()}}_${i}`, true, i);
                this.createBean(autoGroup);
                autoGroup.setChildren([nextChild]);
                nextChild.setOriginalParent(autoGroup);
                nextChild = autoGroup;
            }

            if (dept === 0) {
                col.setOriginalParent(null);
            }

            // at this point, the nextChild is the top most item in the tree
            tree.push(nextChild);
        });

        return [tree, dept];
    }

    private findDepth(balancedColumnTree: IProvidedColumn[]): number {
        let dept = 0;
        let pointer = balancedColumnTree;

        while (pointer && pointer[0] && pointer[0] instanceof ProvidedColumnGroup) {
            dept++;
            pointer = (pointer[0] as ProvidedColumnGroup).getChildren();
        }
        return dept;
    }

    private balanceColumnTree(
        unbalancedTree: IProvidedColumn[],
        currentDept: number,
        columnDept: number,
        columnKeyCreator: ColumnKeyCreator
    ): IProvidedColumn[] {
        const result: IProvidedColumn[] = [];

        // go through each child, for groups, recurse a level deeper,
        // for columns we need to pad
        for (let i = 0; i < unbalancedTree.length; i++) {
            const child = unbalancedTree[i];
            if (child instanceof ProvidedColumnGroup) {
                // child is a group, all we do is go to the next level of recursion
                const originalGroup = child;
                const newChildren = this.balanceColumnTree(
                    originalGroup.getChildren(),
                    currentDept + 1,
                    columnDept,
                    columnKeyCreator
                );
                originalGroup.setChildren(newChildren);
                result.push(originalGroup);
            } else {
                // child is a column - so here we add in the padded column groups if needed
                let firstPaddedGroup: ProvidedColumnGroup | undefined;
                let currentPaddedGroup: ProvidedColumnGroup | undefined;

                // this for loop will NOT run any loops if no padded column groups are needed
                for (let j = columnDept - 1; j >= currentDept; j--) {
                    const newColId = columnKeyCreator.getUniqueKey(null, null);
                    const colGroupDefMerged = this.createMergedColGroupDef(null);

                    const paddedGroup = new ProvidedColumnGroup(colGroupDefMerged, newColId, true, currentDept);
                    this.createBean(paddedGroup);

                    if (currentPaddedGroup) {
                        currentPaddedGroup.setChildren([paddedGroup]);
                    }

                    currentPaddedGroup = paddedGroup;

                    if (!firstPaddedGroup) {
                        firstPaddedGroup = currentPaddedGroup;
                    }
                }

                // likewise this if statement will not run if no padded groups
                if (firstPaddedGroup && currentPaddedGroup) {
                    result.push(firstPaddedGroup);
                    const hasGroups = unbalancedTree.some((leaf) => leaf instanceof ProvidedColumnGroup);

                    if (hasGroups) {
                        currentPaddedGroup.setChildren([child]);
                        continue;
                    } else {
                        currentPaddedGroup.setChildren(unbalancedTree);
                        break;
                    }
                }

                result.push(child);
            }
        }

        return result;
    }

    private findMaxDept(treeChildren: IProvidedColumn[], dept: number): number {
        let maxDeptThisLevel = dept;

        for (let i = 0; i < treeChildren.length; i++) {
            const abstractColumn = treeChildren[i];
            if (abstractColumn instanceof ProvidedColumnGroup) {
                const originalGroup = abstractColumn;
                const newDept = this.findMaxDept(originalGroup.getChildren(), dept + 1);
                if (maxDeptThisLevel < newDept) {
                    maxDeptThisLevel = newDept;
                }
            }
        }

        return maxDeptThisLevel;
    }

    private recursivelyCreateColumns(
        defs: (ColDef | ColGroupDef)[] | null,
        level: number,
        primaryColumns: boolean,
        existingColsCopy: Column[],
        columnKeyCreator: ColumnKeyCreator,
        existingGroups: ProvidedColumnGroup[],
        source: ColumnEventType
    ): IProvidedColumn[] {
        if (!defs) return [];

        const result = new Array(defs.length);
        for (let i = 0; i < result.length; i++) {
            const def = defs[i];
            if (this.isColumnGroup(def)) {
                result[i] = this.createColumnGroup(
                    primaryColumns,
                    def as ColGroupDef,
                    level,
                    existingColsCopy,
                    columnKeyCreator,
                    existingGroups,
                    source
                );
            } else {
                result[i] = this.createColumn(
                    primaryColumns,
                    def as ColDef,
                    existingColsCopy,
                    columnKeyCreator,
                    source
                );
            }
        }
        return result;
    }

    private createColumnGroup(
        primaryColumns: boolean,
        colGroupDef: ColGroupDef,
        level: number,
        existingColumns: Column[],
        columnKeyCreator: ColumnKeyCreator,
        existingGroups: ProvidedColumnGroup[],
        source: ColumnEventType
    ): ProvidedColumnGroup {
        const colGroupDefMerged = this.createMergedColGroupDef(colGroupDef);
        const groupId = columnKeyCreator.getUniqueKey(colGroupDefMerged.groupId || null, null);
        const providedGroup = new ProvidedColumnGroup(colGroupDefMerged, groupId, false, level);
        this.createBean(providedGroup);
        const existingGroupAndIndex = this.findExistingGroup(colGroupDef, existingGroups);
        // make sure we remove, so if user provided duplicate id, then we don't have more than
        // one column instance for colDef with common id
        if (existingGroupAndIndex) {
            existingGroups.splice(existingGroupAndIndex.idx, 1);
        }

        const existingGroup = existingGroupAndIndex?.group;
        if (existingGroup) {
            providedGroup.setExpanded(existingGroup.isExpanded());
        }

        const children = this.recursivelyCreateColumns(
            colGroupDefMerged.children,
            level + 1,
            primaryColumns,
            existingColumns,
            columnKeyCreator,
            existingGroups,
            source
        );

        providedGroup.setChildren(children);

        return providedGroup;
    }

    private createMergedColGroupDef(colGroupDef: ColGroupDef | null): ColGroupDef {
        const colGroupDefMerged: ColGroupDef = {} as ColGroupDef;
        Object.assign(colGroupDefMerged, this.gos.get('defaultColGroupDef'));
        Object.assign(colGroupDefMerged, colGroupDef);

        return colGroupDefMerged;
    }

    private createColumn(
        primaryColumns: boolean,
        colDef: ColDef,
        existingColsCopy: Column[] | null,
        columnKeyCreator: ColumnKeyCreator,
        source: ColumnEventType
    ): Column {
        // see if column already exists
        const existingColAndIndex = this.findExistingColumn(colDef, existingColsCopy);

        // make sure we remove, so if user provided duplicate id, then we don't have more than
        // one column instance for colDef with common id
        if (existingColAndIndex) {
            existingColsCopy?.splice(existingColAndIndex.idx, 1);
        }

        let column = existingColAndIndex?.column;
        if (!column) {
            // no existing column, need to create one
            const colId = columnKeyCreator.getUniqueKey(colDef.colId, colDef.field);
            const colDefMerged = this.addColumnDefaultAndTypes(colDef, colId);
            column = new Column(colDefMerged, colDef, colId, primaryColumns);
            this.context.createBean(column);
        } else {
            const colDefMerged = this.addColumnDefaultAndTypes(colDef, column.getColId());
            column.setColDef(colDefMerged, colDef, source);
            this.applyColumnState(column, colDefMerged, source);
        }

        this.dataTypeService.addColumnListeners(column);

        return column;
    }

    public applyColumnState(column: Column, colDef: ColDef, source: ColumnEventType): void {
        // flex
        const flex = _attrToNumber(colDef.flex);
        if (flex !== undefined) {
            column.setFlex(flex);
        }

        // width - we only set width if column is not flexing
        const noFlexThisCol = column.getFlex() <= 0;
        if (noFlexThisCol) {
            // both null and undefined means we skip, as it's not possible to 'clear' width (a column must have a width)
            const width = _attrToNumber(colDef.width);
            if (width != null) {
                column.setActualWidth(width, source);
            } else {
                // otherwise set the width again, in case min or max width has changed,
                // and width needs to be adjusted.
                const widthBeforeUpdate = column.getActualWidth();
                column.setActualWidth(widthBeforeUpdate, source);
            }
        }

        // sort - anything but undefined will set sort, thus null or empty string will clear the sort
        if (colDef.sort !== undefined) {
            if (colDef.sort == 'asc' || colDef.sort == 'desc') {
                column.setSort(colDef.sort, source);
            } else {
                column.setSort(undefined, source);
            }
        }

        // sorted at - anything but undefined, thus null will clear the sortIndex
        const sortIndex = _attrToNumber(colDef.sortIndex);
        if (sortIndex !== undefined) {
            column.setSortIndex(sortIndex);
        }

        // hide - anything but undefined, thus null will clear the hide
        const hide = _attrToBoolean(colDef.hide);
        if (hide !== undefined) {
            column.setVisible(!hide, source);
        }

        // pinned - anything but undefined, thus null or empty string will remove pinned
        if (colDef.pinned !== undefined) {
            column.setPinned(colDef.pinned);
        }
    }

    private findExistingColumn(
        newColDef: ColDef,
        existingColsCopy: Column[] | null
    ): { idx: number; column: Column } | undefined {
        if (!existingColsCopy) return undefined;

        for (let i = 0; i < existingColsCopy.length; i++) {
            const def = existingColsCopy[i].getUserProvidedColDef();
            if (!def) continue;

            const newHasId = newColDef.colId != null;
            if (newHasId) {
                if (existingColsCopy[i].getId() === newColDef.colId) {
                    return { idx: i, column: existingColsCopy[i] };
                }
                continue;
            }

            const newHasField = newColDef.field != null;
            if (newHasField) {
                if (def.field === newColDef.field) {
                    return { idx: i, column: existingColsCopy[i] };
                }
                continue;
            }

            if (def === newColDef) {
                return { idx: i, column: existingColsCopy[i] };
            }
        }
        return undefined;
    }

    private findExistingGroup(
        newGroupDef: ColGroupDef,
        existingGroups: ProvidedColumnGroup[]
    ): { idx: number; group: ProvidedColumnGroup } | undefined {
        const newHasId = newGroupDef.groupId != null;
        if (!newHasId) {
            return undefined;
        }

        for (let i = 0; i < existingGroups.length; i++) {
            const existingGroup = existingGroups[i];
            const existingDef = existingGroup.getColGroupDef();
            if (!existingDef) {
                continue;
            }

            if (existingGroup.getId() === newGroupDef.groupId) {
                return { idx: i, group: existingGroup };
            }
        }
        return undefined;
    }

    public addColumnDefaultAndTypes(colDef: ColDef, colId: string): ColDef {
        // start with empty merged definition
        const res: ColDef = {} as ColDef;

        // merge properties from default column definitions
        const defaultColDef = this.gos.get('defaultColDef');
        _mergeDeep(res, defaultColDef, false, true);

        const columnType = this.dataTypeService.updateColDefAndGetColumnType(res, colDef, colId);

        if (columnType) {
            this.assignColumnTypes(columnType, res);
        }

        // merge properties from column definitions
        _mergeDeep(res, colDef, false, true);

        const autoGroupColDef = this.gos.get('autoGroupColumnDef');
        const isSortingCoupled = this.gos.isColumnsSortingCoupledToGroup();
        if (colDef.rowGroup && autoGroupColDef && isSortingCoupled) {
            // override the sort for row group columns where the autoGroupColDef defines these values.
            _mergeDeep(
                res,
                { sort: autoGroupColDef.sort, initialSort: autoGroupColDef.initialSort } as ColDef,
                false,
                true
            );
        }

        this.dataTypeService.validateColDef(res);

        return res;
    }

    private assignColumnTypes(typeKeys: string[], colDefMerged: ColDef) {
        if (!typeKeys.length) {
            return;
        }

        // merge user defined with default column types
        const allColumnTypes = Object.assign({}, DefaultColumnTypes);
        const userTypes = this.gos.get('columnTypes') || {};

        _iterateObject(userTypes, (key, value) => {
            if (key in allColumnTypes) {
                console.warn(`AG Grid: the column type '${key}' is a default column type and cannot be overridden.`);
            } else {
                const colType = value as any;
                if (colType.type) {
                    _warnOnce(
                        `Column type definitions 'columnTypes' with a 'type' attribute are not supported ` +
                            `because a column type cannot refer to another column type. Only column definitions ` +
                            `'columnDefs' can use the 'type' attribute to refer to a column type.`
                    );
                }

                allColumnTypes[key] = value;
            }
        });

        typeKeys.forEach((t) => {
            const typeColDef = allColumnTypes[t.trim()];
            if (typeColDef) {
                _mergeDeep(colDefMerged, typeColDef, false, true);
            } else {
                console.warn("AG Grid: colDef.type '" + t + "' does not correspond to defined gridOptions.columnTypes");
            }
        });
    }

    // if object has children, we assume it's a group
    private isColumnGroup(abstractColDef: ColDef | ColGroupDef): boolean {
        return (abstractColDef as ColGroupDef).children !== undefined;
    }
}

export function depthFirstOriginalTreeSearch(
    parent: ProvidedColumnGroup | null,
    tree: IProvidedColumn[],
    callback: (treeNode: IProvidedColumn, parent: ProvidedColumnGroup | null) => void
): void {
    if (!tree) {
        return;
    }

    for (let i = 0; i < tree.length; i++) {
        const child = tree[i];
        if (child instanceof ProvidedColumnGroup) {
            depthFirstOriginalTreeSearch(child, child.getChildren(), callback);
        }
        callback(child, parent);
    }
}
