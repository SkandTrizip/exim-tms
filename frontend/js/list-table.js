/**
 * Resizable columns for .list-table grids.
 */
(function () {
    const STORAGE_PREFIX = 'exim_col_widths_v2_';
    const MIN_W = 48;
    const MAX_W = 560;
    const SKIP_COLS = new Set(['action']);

    /** Percent widths per table — must sum to 100 */
    const TABLE_PROFILES = {
        trackingDataTable: {
            details: 20, client: 24, location: 20, required: 12, status: 16, action: 8
        },
        quotesDataTable: {
            details: 15, client: 20, location: 15, required: 11, line: 11, total: 11, status: 12, action: 5
        },
        enquiriesDataTable: {
            details: 20, client: 24, location: 20, required: 12, status: 16, action: 8
        },
        financeDataTable: {
            details: 20, client: 24, location: 20, required: 12, status: 16, action: 8
        },
        mastersClientsDataTable: {
            code: 12, status: 12, company: 24, branch: 18, phone: 12, location: 16, action: 6
        },
        mastersShippingDataTable: {
            code: 10, status: 12, name: 20, contact: 16, phone: 12, location: 16, action: 6
        }
    };

    const FALLBACK_PCT = {
        details: 18, client: 22, location: 18, required: 12, line: 10, total: 10, status: 14, action: 6,
        code: 10, company: 20, branch: 14, phone: 10, name: 18, contact: 14
    };

    function profileFor(table) {
        return TABLE_PROFILES[table.id] || FALLBACK_PCT;
    }

    function defaultPercent(col, table) {
        if (col === 'action') return profileFor(table).action || 6;
        return profileFor(table)[col] || 10;
    }

    function storageKey(table) {
        return STORAGE_PREFIX + (table.id || table.dataset.resizeKey || 'list-table');
    }

    function loadWidths(table) {
        try {
            return JSON.parse(localStorage.getItem(storageKey(table)) || '{}');
        } catch {
            return {};
        }
    }

    function saveWidths(table, widths) {
        try {
            localStorage.setItem(storageKey(table), JSON.stringify(widths));
        } catch { /* quota / private mode */ }
    }

    function ensureColgroup(table) {
        const headers = [...table.querySelectorAll('thead th[data-col]')];
        let colgroup = table.querySelector('colgroup');
        if (!colgroup) {
            colgroup = document.createElement('colgroup');
            table.insertBefore(colgroup, table.firstChild);
        }

        const existing = new Map([...colgroup.querySelectorAll('col')].map((c) => [c.dataset.col, c]));
        colgroup.innerHTML = '';
        headers.forEach((th) => {
            const col = existing.get(th.dataset.col) || document.createElement('col');
            col.dataset.col = th.dataset.col;
            colgroup.appendChild(col);
        });
        return colgroup;
    }

    function applyColWidth(table, colKey, value, unit) {
        const col = table.querySelector(`colgroup col[data-col="${colKey}"]`);
        if (!col) return value;
        if (unit === '%') {
            col.style.width = `${value}%`;
            return value;
        }
        const w = Math.min(MAX_W, Math.max(MIN_W, Math.round(value)));
        col.style.width = `${w}px`;
        return w;
    }

    function bindResizeHandle(table, th, colKey, widths) {
        if (th.querySelector('.col-resize-handle')) return;

        th.classList.add('col-resizable-th');
        const handle = document.createElement('span');
        handle.className = 'col-resize-handle';
        handle.title = 'Drag to resize · double-click to reset';
        th.appendChild(handle);

        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const startX = e.clientX;
            const startW = th.offsetWidth;
            document.body.classList.add('col-resizing');

            const onMove = (ev) => {
                widths[colKey] = applyColWidth(table, colKey, startW + (ev.clientX - startX), 'px');
            };

            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                document.body.classList.remove('col-resizing');
                saveWidths(table, { ...loadWidths(table), [colKey]: { v: widths[colKey], u: 'px' } });
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });

        handle.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const pct = defaultPercent(colKey, table);
            widths[colKey] = applyColWidth(table, colKey, pct, '%');
            const stored = loadWidths(table);
            delete stored[colKey];
            saveWidths(table, stored);
        });
    }

    function initListTableColumnResize(table) {
        if (!table || !table.classList.contains('list-table')) return;
        if (table.dataset.columnResizeInit === '1') return;
        table.dataset.columnResizeInit = '1';

        table.classList.add('list-table-resizable');
        table.style.tableLayout = 'fixed';
        table.style.width = '100%';
        table.style.minWidth = '0';

        ensureColgroup(table);
        const saved = loadWidths(table);
        const widths = {};

        table.querySelectorAll('thead th[data-col]').forEach((th) => {
            const colKey = th.dataset.col;
            if (!colKey) return;

            const stored = saved[colKey];
            let width;
            if (stored && typeof stored === 'object' && stored.u === 'px') {
                width = applyColWidth(table, colKey, stored.v, 'px');
            } else if (typeof stored === 'number') {
                width = applyColWidth(table, colKey, stored, 'px');
            } else {
                width = applyColWidth(table, colKey, defaultPercent(colKey, table), '%');
            }
            widths[colKey] = width;

            if (!SKIP_COLS.has(colKey)) {
                bindResizeHandle(table, th, colKey, widths);
            }
        });
    }

    function initAllListTableColumnResize(root) {
        (root || document).querySelectorAll('table.list-table').forEach(initListTableColumnResize);
    }

    window.initListTableColumnResize = initListTableColumnResize;
    window.initAllListTableColumnResize = initAllListTableColumnResize;

    document.addEventListener('DOMContentLoaded', () => {
        initAllListTableColumnResize();
    });
})();
