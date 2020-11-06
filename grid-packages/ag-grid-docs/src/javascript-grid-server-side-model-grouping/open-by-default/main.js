var gridOptions = {
    columnDefs: [
        { field: 'country', enableRowGroup: true, rowGroup: true, hide: true },
        { field: "sport", enableRowGroup: true, rowGroup: true, hide: true },
        { field: "year", minWidth: 100 },
        { field: "gold", aggFunc: 'sum' },
        { field: "silver", aggFunc: 'sum' },
        { field: "bronze", aggFunc: 'sum' }
    ],
    defaultColDef: {
        flex: 1,
        minWidth: 120,
        resizable: true,
        sortable: true
    },
    autoGroupColumnDef: {
        flex: 1,
        minWidth: 280,
    },

    rowModelType: 'serverSide',
    serverSideStoreType: 'full',

    isServerSideGroupOpenByDefault: isServerSideGroupOpenByDefault,
    suppressAggFuncInHeader: true,
    animateRows: true,
};

function isServerSideGroupOpenByDefault(params) {
    var rowNode = params.rowNode;
    var isZimbabwe = rowNode.field == 'country' && rowNode.key == 'Zimbabwe';
    var isSwimming = rowNode.field == 'sport' && rowNode.key == 'Swimming';
    return isZimbabwe || isSwimming;
}

function ServerSideDatasource(server) {
    return {
        getRows: function(params) {
            console.log('[Datasource] - rows requested by grid: ', params.request);

            var response = server.getData(params.request);

            // adding delay to simulate real server call
            setTimeout(function() {
                if (response.success) {
                    // call the success callback
                    params.success({rowData: response.rows, rowCount: response.lastRow});
                } else {
                    // inform the grid request failed
                    params.fail();
                }
            }, 400);
        }
    };
}

// setup the grid after the page has finished loading
document.addEventListener('DOMContentLoaded', function() {
    var gridDiv = document.querySelector('#myGrid');
    new agGrid.Grid(gridDiv, gridOptions);

    agGrid.simpleHttpRequest({ url: 'https://raw.githubusercontent.com/ag-grid/ag-grid/master/grid-packages/ag-grid-docs/src/olympicWinners.json' }).then(function(data) {
        // setup the fake server with entire dataset
        var fakeServer = new FakeServer(data);

        // create datasource with a reference to the fake server
        var datasource = new ServerSideDatasource(fakeServer);

        // register the datasource with the grid
        gridOptions.api.setServerSideDatasource(datasource);
    });
});
