/**
 * Per-column sort & value search for .list-table grids.
 * Popover: sort, searchable value checklist, auto-apply.
 */
(function () {
    const SKIP_COLS = new Set(['action']);
    const tableState = new WeakMap();
    let activePopover = null;
    let activeContext = null;

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function normalizeText(value) {
        return (value || '').replace(/\s+/g, ' ').trim();
    }

    function getCellValue(tr, colKey) {
        const cell = tr.querySelector(`td[data-col="${colKey}"]`);
        if (!cell) return '';
        return normalizeText(cell.textContent);
    }

    function getTableRows(tbody) {
        return Array.from(tbody.querySelectorAll('tr')).filter((tr) => {
            if (tr.querySelector('td[colspan]')) return false;
            return tr.querySelector('td[data-col]');
        });
    }

    function getFilterableColumns(table) {
        return [...table.querySelectorAll('thead th[data-col]')]
            .map((th) => th.dataset.col)
            .filter((col) => col && !SKIP_COLS.has(col));
    }

    function getColumnLabel(table, colKey) {
        const th = table.querySelector(`thead th[data-col="${colKey}"]`);
        if (!th) return colKey;
        const label = th.querySelector('.th-label');
        return normalizeText(label ? label.textContent : th.textContent);
    }

    function ensureTableState(table) {
        if (!tableState.has(table)) {
            tableState.set(table, { columns: {}, sortCol: null, sortDir: null });
        }
        return tableState.get(table);
    }

    function getColumnState(table, colKey) {
        const state = ensureTableState(table);
        if (!state.columns[colKey]) {
            state.columns[colKey] = {
                selectedValues: null,
                pendingValues: null,
                autoApply: true
            };
        }
        return state.columns[colKey];
    }

    function isColumnFilterActive(colState) {
        return Array.isArray(colState.selectedValues);
    }

    function collectUniqueValues(tbody, colKey) {
        const values = new Set();
        getTableRows(tbody).forEach((tr) => {
            const value = getCellValue(tr, colKey);
            values.add(value || '—');
        });
        return [...values].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    }

    function rowMatchesGlobalSearch(tr, query) {
        if (!query) return true;
        return (tr.textContent || '').toLowerCase().includes(query);
    }

    function rowMatchesColumnFilters(tr, table) {
        const state = ensureTableState(table);
        return Object.entries(state.columns).every(([colKey, colState]) => {
            if (!isColumnFilterActive(colState)) return true;
            const value = getCellValue(tr, colKey) || '—';
            return colState.selectedValues.includes(value);
        });
    }

    function applyListTableFilters(tbodyId, searchInput) {
        const tbody = document.getElementById(tbodyId);
        if (!tbody) return;
        const table = tbody.closest('table.list-table');
        if (!table) return;

        const query = (searchInput?.value || '').trim().toLowerCase();
        getTableRows(tbody).forEach((tr) => {
            const visible = rowMatchesGlobalSearch(tr, query) && rowMatchesColumnFilters(tr, table);
            tr.style.display = visible ? '' : 'none';
        });

        updateFilterIndicators(table);
    }

    function sortTableRows(table, colKey, direction) {
        const tbody = table.tBodies[0];
        if (!tbody) return;

        const state = ensureTableState(table);
        state.sortCol = colKey;
        state.sortDir = direction;

        const rows = getTableRows(tbody);
        if (rows.length < 2) return;

        const multiplier = direction === 'desc' ? -1 : 1;
        rows.sort((a, b) => {
            const av = getCellValue(a, colKey);
            const bv = getCellValue(b, colKey);
            const an = Number(av.replace(/[^\d.-]/g, ''));
            const bn = Number(bv.replace(/[^\d.-]/g, ''));
            if (av !== '' && bv !== '' && !Number.isNaN(an) && !Number.isNaN(bn) && /[\d]/.test(av) && /[\d]/.test(bv)) {
                return (an - bn) * multiplier;
            }
            return av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' }) * multiplier;
        });

        rows.forEach((row) => tbody.appendChild(row));
        updateSortIndicators(table);
    }

    function updateSortIndicators(table) {
        const state = ensureTableState(table);
        table.querySelectorAll('thead th[data-col]').forEach((th) => {
            th.classList.remove('col-sorted-asc', 'col-sorted-desc');
            const trigger = th.querySelector('.col-filter-trigger');
            if (trigger) trigger.classList.remove('is-sorted');
        });
        if (!state.sortCol || !state.sortDir) return;
        const th = table.querySelector(`thead th[data-col="${state.sortCol}"]`);
        if (!th) return;
        th.classList.add(state.sortDir === 'asc' ? 'col-sorted-asc' : 'col-sorted-desc');
        const trigger = th.querySelector('.col-filter-trigger');
        if (trigger) trigger.classList.add('is-sorted');
    }

    function updateFilterIndicators(table) {
        table.querySelectorAll('thead th[data-col]').forEach((th) => {
            const colKey = th.dataset.col;
            if (!colKey || SKIP_COLS.has(colKey)) return;
            const colState = getColumnState(table, colKey);
            const trigger = th.querySelector('.col-filter-trigger');
            if (trigger) trigger.classList.toggle('is-active', isColumnFilterActive(colState));
        });
    }

    function closePopover() {
        if (activePopover) activePopover.classList.remove('open');
        activeContext = null;
    }

    function ensurePopover() {
        if (activePopover) return activePopover;

        const pop = document.createElement('div');
        pop.className = 'col-filter-popover';
        pop.setAttribute('role', 'dialog');
        pop.setAttribute('aria-modal', 'false');
        pop.innerHTML = `
            <div class="col-filter-head">
                <span class="col-filter-dot" aria-hidden="true"></span>
                <span class="col-filter-title"></span>
                <div class="col-filter-head-actions">
                    <button type="button" class="col-filter-nav" data-dir="prev" title="Previous column" aria-label="Previous column">
                        <i class="fas fa-arrow-left"></i>
                    </button>
                    <button type="button" class="col-filter-nav" data-dir="next" title="Next column" aria-label="Next column">
                        <i class="fas fa-arrow-right"></i>
                    </button>
                </div>
            </div>
            <div class="col-filter-section">
                <div class="col-filter-section-label">Sort</div>
                <div class="col-filter-sort-row">
                    <button type="button" class="col-filter-sort-btn" data-sort="asc">
                        <i class="fas fa-arrow-down-a-z"></i>
                        <span>Ascending</span>
                    </button>
                    <button type="button" class="col-filter-sort-btn" data-sort="desc">
                        <i class="fas fa-arrow-up-a-z"></i>
                        <span>Descending</span>
                    </button>
                </div>
            </div>
            <div class="col-filter-section col-filter-values-section">
                <div class="col-filter-search">
                    <i class="fas fa-search" aria-hidden="true"></i>
                    <input type="search" class="col-filter-search-input" placeholder="Search" aria-label="Search values" />
                </div>
                <div class="col-filter-values" role="listbox" aria-label="Column values"></div>
            </div>
            <div class="col-filter-foot">
                <label class="col-filter-auto">
                    <input type="checkbox" class="col-filter-auto-input" checked />
                    <span>Auto Apply</span>
                </label>
                <div class="col-filter-actions" hidden>
                    <button type="button" class="btn btn-secondary col-filter-clear-btn">Clear</button>
                    <button type="button" class="btn btn-primary col-filter-apply-btn">Apply</button>
                </div>
            </div>
        `;

        document.body.appendChild(pop);

        pop.addEventListener('click', (e) => e.stopPropagation());

        pop.querySelector('.col-filter-nav[data-dir="prev"]').addEventListener('click', () => navigateColumn(-1));
        pop.querySelector('.col-filter-nav[data-dir="next"]').addEventListener('click', () => navigateColumn(1));

        pop.querySelectorAll('.col-filter-sort-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (!activeContext) return;
                const { table, colKey } = activeContext;
                sortTableRows(table, colKey, btn.dataset.sort);
                applyListTableFilters(table.tBodies[0].id, getSearchInputForTable(table));
                updateRecordsCountForTable(table);
                highlightSortButtons(pop, colKey, table);
            });
        });

        const searchInput = pop.querySelector('.col-filter-search-input');
        searchInput.addEventListener('input', () => {
            if (!activeContext) return;
            renderValueList(pop, activeContext.table, activeContext.colKey, searchInput.value);
        });

        pop.querySelector('.col-filter-values').addEventListener('change', (e) => {
            const cb = e.target.closest('input[type="checkbox"]');
            if (!cb || !activeContext) return;
            if (!cb.dataset.selectAll && cb.dataset.valueIdx == null) return;
            handleValueCheckboxChange(pop, activeContext.table, activeContext.colKey, cb);
        });

        pop.querySelector('.col-filter-auto-input').addEventListener('change', (e) => {
            if (!activeContext) return;
            const colState = getColumnState(activeContext.table, activeContext.colKey);
            colState.autoApply = e.target.checked;
            pop.querySelector('.col-filter-actions').hidden = colState.autoApply;
        });

        pop.querySelector('.col-filter-apply-btn').addEventListener('click', () => {
            if (!activeContext) return;
            commitPendingValues(activeContext.table, activeContext.colKey);
        });

        pop.querySelector('.col-filter-clear-btn').addEventListener('click', () => {
            if (!activeContext) return;
            clearColumnFilter(activeContext.table, activeContext.colKey);
            openPopoverForColumn(activeContext.table, activeContext.colKey, activeContext.trigger);
        });

        document.addEventListener('click', (e) => {
            if (!activePopover?.classList.contains('open')) return;
            if (activePopover.contains(e.target)) return;
            if (e.target.closest('.col-filter-trigger')) return;
            closePopover();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closePopover();
        });

        window.addEventListener('resize', () => {
            if (activeContext?.trigger && activePopover?.classList.contains('open')) {
                positionPopover(activePopover, activeContext.trigger);
            }
        });

        activePopover = pop;
        return pop;
    }

    function getSearchInputForTable(table) {
        const card = table.closest('.list-table-card');
        if (!card) return null;
        return card.querySelector('.table-search input');
    }

    function updateRecordsCountForTable(table) {
        const tbody = table.tBodies[0];
        if (!tbody) return;

        const state = ensureTableState(table);
        const hasColumnFilter = Object.values(state.columns).some(isColumnFilterActive);
        const searchInput = getSearchInputForTable(table);
        const hasGlobalSearch = Boolean((searchInput?.value || '').trim());
        if (!hasColumnFilter && !hasGlobalSearch) return;

        const card = table.closest('.list-table-card');
        const countEl = card?.querySelector('[id$="RecordsCount"]');
        if (!countEl) return;
        const visible = getTableRows(tbody).filter((tr) => tr.style.display !== 'none');
        countEl.textContent = String(visible.length);
    }

    function highlightSortButtons(pop, colKey, table) {
        const state = ensureTableState(table);
        pop.querySelectorAll('.col-filter-sort-btn').forEach((btn) => {
            const active = state.sortCol === colKey && state.sortDir === btn.dataset.sort;
            btn.classList.toggle('active', active);
        });
    }

    function getWorkingSelection(table, colKey) {
        const colState = getColumnState(table, colKey);
        if (colState.pendingValues) return new Set(colState.pendingValues);
        if (colState.selectedValues) return new Set(colState.selectedValues);
        const tbody = table.tBodies[0];
        return new Set(collectUniqueValues(tbody, colKey));
    }

    function renderValueList(pop, table, colKey, searchQuery = '') {
        const tbody = table.tBodies[0];
        const values = collectUniqueValues(tbody, colKey);
        const selected = getWorkingSelection(table, colKey);
        const q = (searchQuery || '').trim().toLowerCase();
        const filtered = q
            ? values.filter((v) => v.toLowerCase().includes(q))
            : values;

        if (activeContext?.table === table && activeContext.colKey === colKey) {
            activeContext.filteredValues = filtered;
        }

        const list = pop.querySelector('.col-filter-values');
        const allSelected = filtered.length > 0 && filtered.every((v) => selected.has(v));
        const someSelected = filtered.some((v) => selected.has(v));

        const items = [
            `<label class="col-filter-value-item col-filter-select-all">
                <input type="checkbox" data-select-all="1" ${allSelected ? 'checked' : ''} ${!allSelected && someSelected ? 'data-indeterminate="1"' : ''} />
                <span>(Select All)</span>
            </label>`
        ];

        filtered.forEach((value, idx) => {
            const checked = selected.has(value);
            items.push(`
                <label class="col-filter-value-item">
                    <input type="checkbox" data-value-idx="${idx}" ${checked ? 'checked' : ''} />
                    <span title="${escapeHtml(value)}">${escapeHtml(value)}</span>
                </label>
            `);
        });

        if (filtered.length === 0) {
            items.push('<div class="col-filter-empty">No matching values</div>');
        }

        list.innerHTML = items.join('');

        const selectAll = list.querySelector('input[data-select-all]');
        if (selectAll && selectAll.dataset.indeterminate === '1') {
            selectAll.indeterminate = true;
        }
    }

    function handleValueCheckboxChange(pop, table, colKey, cb) {
        const colState = getColumnState(table, colKey);
        const tbody = table.tBodies[0];
        const allValues = collectUniqueValues(tbody, colKey);
        const selected = getWorkingSelection(table, colKey);
        const filteredValues = activeContext?.filteredValues || allValues;

        if (cb.dataset.selectAll === '1') {
            if (cb.checked) filteredValues.forEach((v) => selected.add(v));
            else filteredValues.forEach((v) => selected.delete(v));
        } else {
            const value = filteredValues[Number(cb.dataset.valueIdx)];
            if (value == null) return;
            if (cb.checked) selected.add(value);
            else selected.delete(value);
        }

        colState.pendingValues = [...selected];
        renderValueList(pop, table, colKey, pop.querySelector('.col-filter-search-input').value);

        if (colState.autoApply) {
            commitPendingValues(table, colKey);
        }
    }

    function commitPendingValues(table, colKey) {
        const colState = getColumnState(table, colKey);
        const tbody = table.tBodies[0];
        const allValues = collectUniqueValues(tbody, colKey);
        const pending = colState.pendingValues
            ? new Set(colState.pendingValues)
            : (colState.selectedValues ? new Set(colState.selectedValues) : new Set(allValues));

        if (pending.size === allValues.length && allValues.every((v) => pending.has(v))) {
            colState.selectedValues = null;
        } else {
            colState.selectedValues = [...pending];
        }
        colState.pendingValues = null;

        applyListTableFilters(tbody.id, getSearchInputForTable(table));
        updateRecordsCountForTable(table);
        updateFilterIndicators(table);

        if (activePopover && activeContext?.table === table && activeContext.colKey === colKey) {
            renderValueList(activePopover, table, colKey, activePopover.querySelector('.col-filter-search-input').value);
        }
    }

    function clearColumnFilter(table, colKey) {
        const colState = getColumnState(table, colKey);
        colState.selectedValues = null;
        colState.pendingValues = null;
        applyListTableFilters(table.tBodies[0].id, getSearchInputForTable(table));
        updateRecordsCountForTable(table);
        updateFilterIndicators(table);
    }

    function positionPopover(pop, trigger) {
        const rect = trigger.getBoundingClientRect();
        const margin = 8;
        pop.style.visibility = 'hidden';
        pop.classList.add('open');
        const popRect = pop.getBoundingClientRect();
        pop.style.visibility = '';

        let left = rect.left;
        let top = rect.bottom + margin;

        if (left + popRect.width > window.innerWidth - margin) {
            left = Math.max(margin, window.innerWidth - popRect.width - margin);
        }
        if (top + popRect.height > window.innerHeight - margin) {
            top = Math.max(margin, rect.top - popRect.height - margin);
        }

        pop.style.left = `${left}px`;
        pop.style.top = `${top}px`;
    }

    function openPopoverForColumn(table, colKey, trigger) {
        const pop = ensurePopover();
        const colState = getColumnState(table, colKey);
        colState.pendingValues = null;

        activeContext = { table, colKey, trigger, filteredValues: [] };
        const dot = pop.querySelector('.col-filter-dot');
        if (dot) dot.classList.toggle('is-inactive', !isColumnFilterActive(colState));

        pop.querySelector('.col-filter-title').textContent = getColumnLabel(table, colKey).toUpperCase();
        pop.querySelector('.col-filter-search-input').value = '';
        pop.querySelector('.col-filter-auto-input').checked = colState.autoApply;
        pop.querySelector('.col-filter-actions').hidden = colState.autoApply;

        highlightSortButtons(pop, colKey, table);
        renderValueList(pop, table, colKey);
        positionPopover(pop, trigger);
        pop.classList.add('open');

        const searchInput = pop.querySelector('.col-filter-search-input');
        requestAnimationFrame(() => searchInput.focus());
    }

    function navigateColumn(delta) {
        if (!activeContext) return;
        const cols = getFilterableColumns(activeContext.table);
        const idx = cols.indexOf(activeContext.colKey);
        if (idx < 0) return;
        const next = cols[(idx + delta + cols.length) % cols.length];
        const th = activeContext.table.querySelector(`thead th[data-col="${next}"]`);
        const trigger = th?.querySelector('.col-filter-trigger');
        if (trigger) openPopoverForColumn(activeContext.table, next, trigger);
    }

    function enhanceHeader(th, table) {
        const colKey = th.dataset.col;
        if (!colKey || SKIP_COLS.has(colKey) || th.dataset.colFilterInit === '1') return;
        th.dataset.colFilterInit = '1';

        const labelText = normalizeText(th.textContent);
        while (th.firstChild) th.removeChild(th.firstChild);
        th.classList.add('col-filterable-th');

        const inner = document.createElement('div');
        inner.className = 'th-inner';

        const label = document.createElement('span');
        label.className = 'th-label';
        label.textContent = labelText;

        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'col-filter-trigger';
        trigger.title = `Sort & search ${labelText}`;
        trigger.setAttribute('aria-label', `Sort and search ${labelText}`);
        trigger.innerHTML = '<i class="fas fa-filter" aria-hidden="true"></i>';

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            if (activePopover?.classList.contains('open') && activeContext?.colKey === colKey && activeContext?.table === table) {
                closePopover();
                return;
            }
            openPopoverForColumn(table, colKey, trigger);
        });

        inner.appendChild(label);
        inner.appendChild(trigger);
        th.appendChild(inner);
    }

    function initColumnFiltersForTable(table) {
        if (!table || !table.classList.contains('list-table')) return;
        if (table.dataset.columnFilterInit === '1') return;
        table.dataset.columnFilterInit = '1';

        table.querySelectorAll('thead th[data-col]').forEach((th) => enhanceHeader(th, table));
        updateFilterIndicators(table);
        updateSortIndicators(table);
    }

    function initAllColumnFilters(root) {
        (root || document).querySelectorAll('table.list-table').forEach(initColumnFiltersForTable);
    }

    function refreshListTableFilters(tbodyOrId) {
        const tbody = typeof tbodyOrId === 'string'
            ? document.getElementById(tbodyOrId)
            : tbodyOrId;
        if (!tbody) return;
        const table = tbody.closest('table.list-table');
        if (!table) return;
        applyListTableFilters(tbody.id, getSearchInputForTable(table));
        updateFilterIndicators(table);
        updateRecordsCountForTable(table);
    }

    window.applyListTableFilters = applyListTableFilters;
    window.initColumnFiltersForTable = initColumnFiltersForTable;
    window.initAllColumnFilters = initAllColumnFilters;
    window.refreshListTableFilters = refreshListTableFilters;

    document.addEventListener('DOMContentLoaded', () => {
        initAllColumnFilters();
    });
})();
