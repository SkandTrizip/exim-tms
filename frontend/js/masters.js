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

function getMastersUsername() {
    try {
        const raw = localStorage.getItem('user') || '';
        if (!raw) return '';
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'string') return parsed;
        return parsed.username || '';
    } catch (_) {
        return localStorage.getItem('user') || '';
    }
}

function isMastersAdmin() {
    try {
        const currentUser = (getMastersUsername() || '').toLowerCase();
        if (!currentUser) return false;
        if (window.CONFIG && CONFIG.adminUsers) {
            let admins = CONFIG.adminUsers;
            if (typeof admins === 'string') admins = JSON.parse(admins);
            if (Array.isArray(admins)) {
                return admins.map((u) => String(u).toLowerCase()).includes(currentUser);
            }
        }
        return currentUser === 'admin';
    } catch (_) {
        return false;
    }
}

function mastersAuthHeaders() {
    const t = localStorage.getItem('token') || '';
    return t
        ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }
        : { 'Content-Type': 'application/json' };
}

function openMasterDrawer(mode, id) {
    if (typeof closeOtherRailGroups === 'function') closeOtherRailGroups(null);
    if (typeof openActionModal === 'function') {
        openActionModal(mode, id);
    }
}

function renderMasterRowActions(type, id, status = null) {
    const editMode = type === 'client' ? 'edit-client' : 'edit-shipping-line';
    const viewMode = type === 'client' ? 'view-client' : 'view-shipping-line';
    const statusKey = String(status || 'pending').toLowerCase();
    const canApprove = isMastersAdmin() && statusKey !== 'verified' && statusKey !== 'approved';

    let adminItems = '';
    if (canApprove) {
        adminItems = `
                <button class="actions-item confirm-item" type="button" style="color:#059669;font-weight:700;"
                    onclick="event.stopPropagation(); approveMasterRecord('${type}', ${id})">
                    <i class="fas fa-check-circle"></i> Verify / Approve
                </button>
                <button class="actions-item" type="button" style="color:#dc2626;font-weight:700;"
                    onclick="event.stopPropagation(); rejectMasterRecord('${type}', ${id})">
                    <i class="fas fa-times-circle"></i> Reject
                </button>`;
    }

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
                ${adminItems}
            </div>
        </div>`;
}

function formatMasterApiDetail(detail, fallback) {
    if (!detail) return fallback;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
        return detail.map((d) => (typeof d === 'string' ? d : d.msg || JSON.stringify(d))).join(' ');
    }
    return String(detail);
}

function closeMastersActionMenus() {
    if (typeof closeActionDropdowns === 'function') {
        closeActionDropdowns();
        return;
    }
    document.querySelectorAll('.actions-menu.open, .actions-menu.actions-menu-floating').forEach((m) => {
        m.classList.remove('open', 'actions-menu-floating');
        m.style.display = 'none';
    });
}

async function approveMasterRecord(type, id) {
    const label = type === 'client' ? 'client master' : 'shipping line';
    closeMastersActionMenus();

    const run = async () => {
        try {
            const url = type === 'client'
                ? `${CONFIG.API_URL}/api/client/master/${id}/verify`
                : `${CONFIG.API_URL}/api/shipping-lines/${id}/verify`;
            const res = await fetch(url, { method: 'PATCH', headers: mastersAuthHeaders() });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(formatMasterApiDetail(err.detail, `Could not verify ${label}.`));
            }
            showModal('Verified', `The ${label} has been approved.`, 'success');
            refreshMastersList();
        } catch (err) {
            showModal('Error', err.message || `Could not verify ${label}.`, 'error');
        }
    };

    showModal(
        'Confirm Approval',
        `Approve this ${label}? This marks it as verified for use in Sales.`,
        'warning',
        run
    );
    const confirmBtn = document.getElementById('modalConfirmBtn');
    if (confirmBtn) confirmBtn.textContent = 'Approve';
}

async function rejectMasterRecord(type, id) {
    const label = type === 'client' ? 'client master' : 'shipping line';
    closeMastersActionMenus();

    const run = async () => {
        try {
            const url = type === 'client'
                ? `${CONFIG.API_URL}/api/client/master/${id}/reject`
                : `${CONFIG.API_URL}/api/shipping-lines/${id}/reject`;
            const res = await fetch(url, { method: 'PATCH', headers: mastersAuthHeaders() });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(formatMasterApiDetail(err.detail, `Could not reject ${label}.`));
            }
            showModal('Rejected', `The ${label} has been rejected.`, 'warning');
            refreshMastersList();
        } catch (err) {
            showModal('Error', err.message || `Could not reject ${label}.`, 'error');
        }
    };

    showModal(
        'Confirm Rejection',
        `Reject this ${label}? It will no longer be treated as approved.`,
        'warning',
        run
    );
    const confirmBtn = document.getElementById('modalConfirmBtn');
    if (confirmBtn) confirmBtn.textContent = 'Reject';
}

window.openMasterDrawer = openMasterDrawer;
window.approveMasterRecord = approveMasterRecord;
window.rejectMasterRecord = rejectMasterRecord;

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
                <td data-col="action">${renderMasterRowActions('client', c.id, c.status)}</td>
            </tr>`).join('');
    }

    renderMastersPagination('mastersClientsPagination', rows.length, page, (p) => {
        mastersState.clientsPage = p;
        renderClientMastersTable();
    }, pageSize);
    if (typeof window.refreshListTableFilters === 'function') {
        window.refreshListTableFilters('mastersClientsTable');
    }
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
                <td data-col="action">${renderMasterRowActions('shipping', s.id, s.status)}</td>
            </tr>`).join('');
    }

    renderMastersPagination('mastersShippingPagination', rows.length, page, (p) => {
        mastersState.shippingPage = p;
        renderShippingLinesTable();
    }, pageSize);
    if (typeof window.refreshListTableFilters === 'function') {
        window.refreshListTableFilters('mastersShippingTable');
    }
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
