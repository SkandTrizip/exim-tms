/**
 * Masters hub — dashboard grid, list tables, drawer integration.
 */
'use strict';

const mastersState = {
    clients: [],
    shippingLines: [],
    clientsPage: 1,
    shippingPage: 1,
    pageSize: 20,
    activeList: null
};

function formatMasterDate(val) {
    if (!val) return '—';
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return '—';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function masterStatusBadge(status) {
    const raw = (status || 'pending').toLowerCase();
    const label = raw === 'verified' ? 'APPROVED' : raw.toUpperCase();
    const cls = raw === 'verified' || raw === 'approved' ? 'approved' : raw;
    return `<span class="master-status-badge ${escapeHtml(cls)}">${escapeHtml(label)}</span>`;
}

function openMasterDrawer(mode, id) {
    if (typeof closeOtherRailGroups === 'function') closeOtherRailGroups(null);
    if (typeof openActionModal === 'function') {
        openActionModal(mode, id);
    }
}

function renderMasterRowActions(type, id) {
    const editMode = type === 'client' ? 'edit-client' : 'edit-shipping-line';
    const viewMode = type === 'client' ? 'view-client' : 'view-shipping-line';
    return `
        <div class="actions-dropdown">
            <button class="row-actions-btn actions-btn" type="button" title="Actions" aria-label="Actions">
                <i class="fas fa-ellipsis"></i>
            </button>
            <div class="actions-menu">
                <button class="actions-item" type="button" onclick="openMasterDrawer('${editMode}', ${id})">
                    <i class="fas fa-pen"></i> Edit
                </button>
                <button class="actions-item" type="button" onclick="openMasterDrawer('${viewMode}', ${id})">
                    <i class="fas fa-eye"></i> View
                </button>
            </div>
        </div>`;
}

window.openMasterDrawer = openMasterDrawer;

function renderMastersPagination(containerId, totalItems, currentPage, onPageChange, pageSize) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (totalItems <= pageSize) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'flex';
    const totalPages = Math.ceil(totalItems / pageSize);
    const start = (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, totalItems);

    container.innerHTML = `
        <div class="pagination-info">Showing ${start}–${end} of ${totalItems}</div>
        <div class="pagination-controls">
            <label class="pagination-size">
                Rows
                <select id="${containerId}_size">
                    <option value="10" ${pageSize === 10 ? 'selected' : ''}>10</option>
                    <option value="20" ${pageSize === 20 ? 'selected' : ''}>20</option>
                    <option value="50" ${pageSize === 50 ? 'selected' : ''}>50</option>
                </select>
            </label>
            <button type="button" class="btn btn-secondary btn-sm" ${currentPage <= 1 ? 'disabled' : ''} data-page="${currentPage - 1}">Previous</button>
            <span class="pagination-page">Page ${currentPage} of ${totalPages}</span>
            <button type="button" class="btn btn-secondary btn-sm" ${currentPage >= totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">Next</button>
        </div>`;

    container.querySelectorAll('button[data-page]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const page = parseInt(btn.dataset.page, 10);
            if (!Number.isNaN(page)) onPageChange(page);
        });
    });

    const sizeSel = document.getElementById(`${containerId}_size`);
    if (sizeSel) {
        sizeSel.addEventListener('change', () => {
            mastersState.pageSize = parseInt(sizeSel.value, 10) || 20;
            onPageChange(1);
        });
    }
}

async function fetchMastersClients() {
    const res = await fetch(`${CONFIG.API_URL}/api/client/masters`);
    if (!res.ok) throw new Error('Failed to load clients');
    return res.json();
}

async function fetchMastersShippingLines() {
    const res = await fetch(`${CONFIG.API_URL}/api/shipping-lines/`);
    if (!res.ok) throw new Error('Failed to load shipping lines');
    return res.json();
}

async function loadMastersDashboard() {
    const badge = document.getElementById('mastersTotalBadge');
    const clientCountEl = document.getElementById('masterCardClientCount');
    const shippingCountEl = document.getElementById('masterCardShippingCount');

    try {
        const [clients, shipping] = await Promise.all([
            fetchMastersClients().catch(() => []),
            fetchMastersShippingLines().catch(() => [])
        ]);
        mastersState.clients = clients;
        mastersState.shippingLines = shipping;
        const total = clients.length + shipping.length;
        if (badge) badge.textContent = String(total);
        if (clientCountEl) clientCountEl.textContent = `${clients.length} records`;
        if (shippingCountEl) shippingCountEl.textContent = `${shipping.length} records`;
    } catch (err) {
        console.error('Masters dashboard load failed:', err);
    }
}

function renderClientMastersTable() {
    const tbody = document.getElementById('mastersClientsTable');
    const countEl = document.getElementById('mastersClientsRecordsCount');
    if (!tbody) return;

    const input = document.getElementById('mastersClientsSearchInput');
    const q = (input?.value || '').trim().toLowerCase();
    let rows = [...mastersState.clients];
    if (q) {
        rows = rows.filter((c) => JSON.stringify(c).toLowerCase().includes(q));
    }

    if (countEl) countEl.textContent = String(rows.length);

    const page = mastersState.clientsPage;
    const pageSize = mastersState.pageSize;
    const start = (page - 1) * pageSize;
    const slice = rows.slice(start, start + pageSize);

    if (slice.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="padding:24px;text-align:center;color:var(--text-tertiary);font-weight:600;">No client masters found.</td></tr>';
    } else {
        tbody.innerHTML = slice.map((c) => `
            <tr class="list-row">
                <td data-col="code" class="master-code-cell">
                    <a href="#" class="cell-enquiry-id" onclick="openMasterDrawer('view-client', ${c.id}); return false;">
                        <strong>${escapeHtml(c.client_code || '—')}</strong>
                    </a>
                    <span class="sub">${escapeHtml(formatMasterDate(c.created_at))}</span>
                </td>
                <td data-col="status">${masterStatusBadge(c.status)}</td>
                <td data-col="company" class="cell-upper">${escapeHtml(c.unique_client_name || c.client_name || '—')}</td>
                <td data-col="branch" class="cell-upper">${escapeHtml(c.client_name || '—')}</td>
                <td data-col="phone">${escapeHtml(c.contact_no || '—')}</td>
                <td data-col="location">${escapeHtml(c.office_location || '—')}</td>
                <td data-col="action">${renderMasterRowActions('client', c.id)}</td>
            </tr>`).join('');
    }

    renderMastersPagination('mastersClientsPagination', rows.length, page, (p) => {
        mastersState.clientsPage = p;
        renderClientMastersTable();
    }, pageSize);
}

function renderShippingLinesTable() {
    const tbody = document.getElementById('mastersShippingTable');
    const countEl = document.getElementById('mastersShippingRecordsCount');
    if (!tbody) return;

    const input = document.getElementById('mastersShippingSearchInput');
    const q = (input?.value || '').trim().toLowerCase();
    let rows = [...mastersState.shippingLines];
    if (q) {
        rows = rows.filter((s) => JSON.stringify(s).toLowerCase().includes(q));
    }

    if (countEl) countEl.textContent = String(rows.length);

    const page = mastersState.shippingPage;
    const pageSize = mastersState.pageSize;
    const start = (page - 1) * pageSize;
    const slice = rows.slice(start, start + pageSize);

    if (slice.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="padding:24px;text-align:center;color:var(--text-tertiary);font-weight:600;">No shipping lines found.</td></tr>';
    } else {
        tbody.innerHTML = slice.map((s) => `
            <tr class="list-row">
                <td data-col="code" class="master-code-cell">
                    <a href="#" class="cell-enquiry-id" onclick="openMasterDrawer('view-shipping-line', ${s.id}); return false;">
                        <strong>SL${String(s.id).padStart(3, '0')}</strong>
                    </a>
                    <span class="sub">${escapeHtml(formatMasterDate(s.created_at))}</span>
                </td>
                <td data-col="status">${masterStatusBadge(s.status)}</td>
                <td data-col="name" class="cell-upper">${escapeHtml(s.shipping_line_name || '—')}</td>
                <td data-col="contact">${escapeHtml(s.primary_contact_person || '—')}</td>
                <td data-col="phone">${escapeHtml(s.primary_contact_number || '—')}</td>
                <td data-col="location">${escapeHtml(s.office_location || '—')}</td>
                <td data-col="action">${renderMasterRowActions('shipping', s.id)}</td>
            </tr>`).join('');
    }

    renderMastersPagination('mastersShippingPagination', rows.length, page, (p) => {
        mastersState.shippingPage = p;
        renderShippingLinesTable();
    }, pageSize);
}

window.loadMastersClientList = async function loadMastersClientList() {
    const tbody = document.getElementById('mastersClientsTable');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="padding:24px;text-align:center;"><i class="fas fa-spinner fa-spin"></i></td></tr>';
    try {
        mastersState.clients = await fetchMastersClients();
        mastersState.clientsPage = 1;
        renderClientMastersTable();
    } catch (err) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="padding:24px;text-align:center;color:var(--error);">${escapeHtml(err.message)}</td></tr>`;
    }
}

window.loadMastersShippingList = async function loadMastersShippingList() {
    const tbody = document.getElementById('mastersShippingTable');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="padding:24px;text-align:center;"><i class="fas fa-spinner fa-spin"></i></td></tr>';
    try {
        mastersState.shippingLines = await fetchMastersShippingLines();
        mastersState.shippingPage = 1;
        renderShippingLinesTable();
    } catch (err) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="padding:24px;text-align:center;color:var(--error);">${escapeHtml(err.message)}</td></tr>`;
    }
}

function hideMastersSubViews() {
    ['mastersDashboardView', 'mastersClientListView', 'mastersShippingListView'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

function openMastersRailGroup() {
    const group = document.getElementById('settingsRailGroup');
    closeOtherRailGroups(group);
    if (group) group.classList.add('is-open');
}

window.showMastersDashboard = function showMastersDashboard() {
    hideAllViews();
    hideMastersSubViews();
    setActiveLink('navSettings');
    openMastersRailGroup();
    const view = document.getElementById('mastersDashboardView');
    if (view) view.style.display = 'block';
    mastersState.activeList = null;
    if (window.location.hash !== '#masters') window.location.hash = '#masters';
    loadMastersDashboard();
};

window.showMastersClientList = function showMastersClientList() {
    hideAllViews();
    hideMastersSubViews();
    setActiveLink('navSettings');
    openMastersRailGroup();
    const view = document.getElementById('mastersClientListView');
    if (view) view.style.display = 'block';
    mastersState.activeList = 'clients';
    if (window.location.hash !== '#masters-clients') window.location.hash = '#masters-clients';
    loadMastersClientList();
};

window.showMastersShippingList = function showMastersShippingList() {
    hideAllViews();
    hideMastersSubViews();
    setActiveLink('navSettings');
    openMastersRailGroup();
    const view = document.getElementById('mastersShippingListView');
    if (view) view.style.display = 'block';
    mastersState.activeList = 'shipping';
    if (window.location.hash !== '#masters-shipping-lines') window.location.hash = '#masters-shipping-lines';
    loadMastersShippingList();
};

window.refreshMastersList = function refreshMastersList() {
    if (mastersState.activeList === 'clients') loadMastersClientList();
    else if (mastersState.activeList === 'shipping') loadMastersShippingList();
    else loadMastersDashboard();
};

function initMastersUI() {
    const clientSearch = document.getElementById('mastersClientsSearchInput');
    if (clientSearch && !clientSearch.dataset.bound) {
        clientSearch.dataset.bound = '1';
        clientSearch.addEventListener('input', () => {
            mastersState.clientsPage = 1;
            renderClientMastersTable();
        });
    }

    const shippingSearch = document.getElementById('mastersShippingSearchInput');
    if (shippingSearch && !shippingSearch.dataset.bound) {
        shippingSearch.dataset.bound = '1';
        shippingSearch.addEventListener('input', () => {
            mastersState.shippingPage = 1;
            renderShippingLinesTable();
        });
    }

    const clientExport = document.getElementById('mastersClientsExportBtn');
    if (clientExport && !clientExport.dataset.bound) {
        clientExport.dataset.bound = '1';
        clientExport.addEventListener('click', () => exportVisibleTableToCsv('mastersClientsDataTable', 'mastersClientsTable', 'client_masters'));
    }

    const shippingExport = document.getElementById('mastersShippingExportBtn');
    if (shippingExport && !shippingExport.dataset.bound) {
        shippingExport.dataset.bound = '1';
        shippingExport.addEventListener('click', () => exportVisibleTableToCsv('mastersShippingDataTable', 'mastersShippingTable', 'shipping_lines'));
    }

    initListTableUI({
        searchId: 'mastersClientsSearchInput',
        exportId: 'mastersClientsExportBtn',
        toggleBtnId: 'mastersClientsToggleColumnsBtn',
        menuId: 'mastersClientsColumnsMenu',
        dropdownId: 'mastersClientsColumnsDropdown',
        cardId: 'mastersClientsTableCard',
        tableId: 'mastersClientsDataTable',
        tbodyId: 'mastersClientsTable',
        exportName: 'client_masters'
    });

    initListTableUI({
        searchId: 'mastersShippingSearchInput',
        exportId: 'mastersShippingExportBtn',
        toggleBtnId: 'mastersShippingToggleColumnsBtn',
        menuId: 'mastersShippingColumnsMenu',
        dropdownId: 'mastersShippingColumnsDropdown',
        cardId: 'mastersShippingTableCard',
        tableId: 'mastersShippingDataTable',
        tbodyId: 'mastersShippingTable',
        exportName: 'shipping_lines'
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initMastersUI();
});
