// Main Dashboard Logic
let enquiries = [];
let PAGE_SIZE = 10;
const paginationState = {
    allEnquiries: { currentPage: 1 },
    quotes: { currentPage: 1 },
    tracking: { currentPage: 1 },
    finance: { currentPage: 1 }
};

document.addEventListener('DOMContentLoaded', async function () {
    // Topbar user label
    try {
        const user = localStorage.getItem('user') || 'User';
        const u = document.getElementById('pageUserName');
        if (u) u.textContent = user;
    } catch { }

    // Refresh button
    const refreshBtn = document.getElementById('refreshDashboardBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.disabled = true;
            try {
                await Promise.all([fetchDashboardStats(), fetchDashboardAnalytics(), fetchAllEnquiries()]);
            } finally {
                refreshBtn.disabled = false;
            }
        });
    }

    const analyticsDetailsBtn = document.getElementById('analyticsViewDetailsBtn');
    const analyticsDetailsPanel = document.getElementById('analyticsDetailsPanel');
    if (analyticsDetailsBtn && analyticsDetailsPanel) {
        analyticsDetailsBtn.addEventListener('click', () => {
            const expanded = analyticsDetailsBtn.getAttribute('aria-expanded') === 'true';
            analyticsDetailsBtn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
            analyticsDetailsPanel.hidden = expanded;
        });
    }

    // Run stats and enquiry fetch in parallel — stats show immediately, tables fill in alongside
    await Promise.all([
        fetchDashboardStats(),
        fetchDashboardAnalytics(),
        fetchAllEnquiries()
    ]);

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.rail-group')) {
            closeOtherRailGroups(null);
        }
    });

    // Initial routing
    handleRouting();

    // Enquiries list UI (search/export/columns)
    initEnquiriesListUI();
    initTrackingListUI();
    initFinanceListUI();
    initQuotesListUI();
    initStatusSections();
    initFinanceCompletionTabs();
});

function escapeHtml(s) {
    if (s == null || s === '') return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
}

function escapeAttr(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}

let cachedBulkStatus = {};
let financeReceivedCount = 0;
let currentFinanceCompletionTab = 'pending';

const STATUS_SECTION_LABELS = {
    sales: {
        pending_pricing: 'Pending at Pricing',
        pending_confirmation: 'Pending Confirmation',
        all: 'All Enquiries'
    },
    tracking: {
        pending_booking: 'Booking Pending',
        pending_si: 'SI Pending',
        pending_bl: 'BL Pending',
        pending_sob: 'SOB Remaining'
    },
    finance: {
        payments: 'Payment to Shipping Line',
        invoices: 'Create Invoice',
        received: 'Payments Received'
    }
};

function formatEnquiryDateTime(val) {
    if (!val) return '—';
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return '—';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function truncateText(text, max = 34) {
    const s = String(text || '—');
    return s.length > max ? `${s.slice(0, max)}…` : s;
}

function getUrgencyMeta(dateVal) {
    if (!dateVal) return { text: '—', className: '' };
    const target = new Date(dateVal);
    if (Number.isNaN(target.getTime())) return { text: '—', className: '' };
    const diffHrs = (target.getTime() - Date.now()) / (1000 * 60 * 60);
    if (diffHrs <= 24) return { text: '<24 HRS', className: 'urgent' };
    if (diffHrs <= 48) return { text: '<48 HRS', className: 'soon' };
    return { text: 'SCHEDULED', className: '' };
}

function getShipmentTypeShort(e) {
    const raw = (e.shipment_type || 'ENQUIRY').toUpperCase();
    if (raw.includes('FCL')) return 'FCL';
    if (raw.includes('LCL')) return 'LCL';
    if (raw.includes('AIR')) return 'AIR';
    return raw.split(' ')[0].slice(0, 8);
}

function renderRowActionsMenu(e, extraItemsHtml = '', quoteStatus = null) {
    return `
        <div class="actions-dropdown">
            <button class="row-actions-btn actions-btn" type="button" title="Actions" aria-label="Actions">
                <i class="fas fa-ellipsis-vertical"></i>
            </button>
            <div class="actions-menu">
                ${extraItemsHtml}
                ${renderEnquiryActions(e, quoteStatus)}
            </div>
        </div>`;
}

function renderListTableRow(e, status = null, options = {}) {
    const {
        statusHtml = statusBadge(e, status),
        extraActionsHtml = '',
        quoteStatus = null,
        actionHtml = null,
        compact = false
    } = options;

    if (compact) {
        const opacity = e.is_void ? ' style="opacity:0.55"' : '';
        return `
            <tr class="list-row"${opacity}>
                <td class="job-no-cell"><a class="cell-enquiry-id" href="#" onclick="openActionModal('view-sale', ${e.id}); return false;">${escapeHtml(e.enquiry_number)}</a></td>
                <td>${escapeHtml(e.client_name || '—')}</td>
                <td>${escapeHtml(e.origin)} → ${escapeHtml(e.destination)}</td>
                <td>${statusHtml}</td>
                <td>${actionHtml || renderRowActionsMenu(e, extraActionsHtml, quoteStatus)}</td>
            </tr>`;
    }

    const urgency = getUrgencyMeta(e.stuffing_date || e.created_at);
    const created = formatEnquiryDateTime(e.created_at);
    const required = formatEnquiryDateTime(e.stuffing_date);
    const opacity = e.is_void ? ' style="opacity:0.55"' : '';

    return `
        <tr class="list-row"${opacity}>
            <td data-col="details">
                <div class="cell-enquiry">
                    <a class="cell-enquiry-id" href="#" onclick="openActionModal('view-sale', ${e.id}); return false;">${escapeHtml(e.enquiry_number)}</a>
                    <div class="cell-enquiry-meta">${created}</div>
                    <span class="cell-urgency ${urgency.className}">${urgency.text}</span>
                </div>
            </td>
            <td data-col="client" class="cell-upper">${escapeHtml(e.client_name || '—')}</td>
            <td data-col="location">
                <div class="cell-location">
                    <span class="cell-location-origin">${escapeHtml(truncateText(e.origin, 30))}</span>
                    <span class="cell-location-arrow">→ ${escapeHtml(truncateText(e.destination, 30))}</span>
                </div>
            </td>
            <td data-col="required" class="cell-muted">${required}</td>
            <td data-col="status">${statusHtml}</td>
            <td data-col="action">${actionHtml || renderRowActionsMenu(e, extraActionsHtml, quoteStatus)}</td>
        </tr>`;
}

function renderFinanceActionCell(e, subView, completionTab = 'pending') {
    const isCompleted = completionTab === 'completed';
    if (subView === 'payments') {
        return (e.payment_done || isCompleted)
            ? renderFinanceDrawerActionBtn('finance-payment', e.id, { primary: false, icon: 'check-circle', label: 'View', title: 'View payment' })
            : renderFinanceDrawerActionBtn('finance-payment', e.id, { icon: 'money-bill-wave', label: 'Pay', title: 'Make payment to shipping line' });
    }
    if (subView === 'invoices') {
        if (isCompleted || e.invoice_complete) {
            return renderFinanceDrawerActionBtn('finance-invoice', e.id, { primary: false, icon: 'check-circle', label: 'View', title: 'View recorded invoice' });
        }
        return e.bl_received
            ? renderFinanceDrawerActionBtn('finance-invoice', e.id, { icon: 'file-invoice', label: 'Invoice', title: 'Create client invoice' })
            : `<button class="btn btn-secondary table-tool-btn finance-row-action-btn" type="button" disabled title="Wait for BL Received status"><i class="fas fa-clock"></i> Awaiting BL</button>`;
    }
    return renderFinanceDrawerActionBtn('finance-payment', e.id, { icon: 'coins', label: 'Record', title: 'Record client payment' });
}

function renderFinanceDrawerActionBtn(mode, id, { primary = true, icon, label, title } = {}) {
    const btnClass = primary ? 'btn-primary' : 'btn-secondary';
    return `<button type="button" class="btn ${btnClass} table-tool-btn finance-row-action-btn" onclick="openActionModal('${mode}', ${id})" title="${escapeAttr(title || label)}"><i class="fas fa-${icon}"></i> ${escapeHtml(label)}</button>`;
}

function updateFinanceTableChrome(subView) {
    const title = document.querySelector('#financeTableWrap .table-head-title');
    const sub = document.querySelector('#financeTableWrap .table-head-sub');
    const requiredHeader = document.querySelector('#financeDataTable th[data-col="required"]');
    const wrap = document.getElementById('financeTableWrap');

    if (subView === 'received') {
        if (title) title.textContent = 'Payments Received';
        if (sub) sub.textContent = 'Record client payments against raised invoices';
        if (requiredHeader) requiredHeader.textContent = 'Due On';
        wrap?.classList.add('has-row-action-btns');
        return;
    }

    if (title) title.textContent = 'Finance Details';
    if (sub) sub.textContent = 'Payments, invoices and receipts';
    if (requiredHeader) requiredHeader.textContent = 'Required On';
    wrap?.classList.add('has-row-action-btns');
}

function renderFinanceReceivedInvoiceRow(inv) {
    const paid = !!inv.is_paid;
    const statusHtml = paid
        ? '<span class="badge badge-completed"><i class="fas fa-check-circle"></i> PAID</span>'
        : '<span class="badge badge-pending"><i class="fas fa-clock"></i> AWAITING PAYMENT</span>';
    const required = inv.payment_due_date ? formatEnquiryDateTime(inv.payment_due_date) : '—';
    const invoiceNo = escapeHtml(inv.invoice_number || '—');
    const actionHtml = paid
        ? renderFinanceDrawerActionBtn('finance-received', inv.id, { primary: false, icon: 'check-circle', label: 'View', title: 'View payment receipt' })
        : renderFinanceDrawerActionBtn('finance-received', inv.id, { icon: 'money-bill-wave', label: 'Record', title: 'Record client payment' });

    return `
        <tr class="list-row">
            <td data-col="details">
                <div class="cell-enquiry">
                    <a class="cell-enquiry-id" href="#" onclick="openActionModal('view-sale', ${inv.enquiry_id || 0}); return false;">${escapeHtml(inv.enquiry_number || '—')}</a>
                    <div class="cell-enquiry-meta">Invoice ${invoiceNo}</div>
                </div>
            </td>
            <td data-col="client" class="cell-upper">${escapeHtml(inv.client_name || '—')}</td>
            <td data-col="location">
                <div class="cell-location">
                    <span class="cell-location-origin">${escapeHtml(truncateText(inv.origin, 30))}</span>
                    <span class="cell-location-arrow">→ ${escapeHtml(truncateText(inv.destination, 30))}</span>
                </div>
            </td>
            <td data-col="required" class="cell-muted">${required}</td>
            <td data-col="status">${statusHtml}</td>
            <td data-col="action">${actionHtml}</td>
        </tr>`;
}

async function renderFinanceReceivedTable(invoices) {
    const tbody = document.getElementById('financeTable');
    if (!tbody) return;

    updateFinanceTableChrome('received');
    updateFinanceStats();
    financeReceivedCount = (invoices || []).filter((inv) => !inv.is_paid).length;
    updateFinanceCompletionCounts();
    updateStatusSectionCounts();

    const showCompleted = currentFinanceCompletionTab === 'completed';
    const filtered = (invoices || []).filter((inv) => showCompleted ? !!inv.is_paid : !inv.is_paid);

    if (!filtered.length) {
        const emptyMsg = showCompleted
            ? 'No completed client payments yet.'
            : 'No pending client payments. Save an invoice from <strong>Create Invoice</strong> first.';
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">${emptyMsg}</td></tr>`;
        renderPagination('financePagination', 0, 1, 'changeFinancePage');
        updateTableRecordsCount('financeTable', 'financeRecordsCount');
        return;
    }

    const page = paginationState.finance.currentPage;
    const total = filtered.length;
    const startIdx = (page - 1) * PAGE_SIZE;
    const slice = filtered.slice(startIdx, startIdx + PAGE_SIZE);

    tbody.innerHTML = slice.map((inv) => renderFinanceReceivedInvoiceRow(inv)).join('');

    renderPagination('financePagination', total, page, 'changeFinancePage');
    afterListTableRender('financeTable', 'financeSearchInput', 'financeRecordsCount');
    if (typeof initListTableColumnResize === 'function') {
        initListTableColumnResize(document.getElementById('financeDataTable'));
    }
}

function financeStatusBadge(e, subView, completionTab = 'pending') {
    const isCompleted = completionTab === 'completed';
    if (subView === 'payments') {
        return (e.payment_done || isCompleted)
            ? '<span class="badge badge-completed"><i class="fas fa-check-circle"></i> Payment Done</span>'
            : '<span class="badge badge-pending"><i class="fas fa-clock"></i> Payment Pending</span>';
    }
    if (subView === 'invoices') {
        if (isCompleted || e.invoice_complete) {
            return '<span class="badge badge-completed"><i class="fas fa-check-circle"></i> Invoice Complete</span>';
        }
        return e.bl_received
            ? '<span class="badge badge-pending"><i class="fas fa-clock"></i> IRN / Invoice Pending</span>'
            : '<span class="badge badge-pending"><i class="fas fa-clock"></i> Awaiting BL</span>';
    }
    return e.bl_received
        ? '<span class="badge badge-completed"><i class="fas fa-check-circle"></i> BL Received</span>'
        : '<span class="badge badge-pending"><i class="fas fa-clock"></i> Awaiting BL</span>';
}

function setActiveStatusSection(view, section) {
    const map = {
        sales: 'salesStatusSections',
        tracking: 'trackingStatusSections',
        finance: 'financeStatusSections'
    };
    const el = document.getElementById(map[view]);
    if (!el) return;

    const key = view === 'sales' && (!section || section === 'all') ? 'all' : section;
    el.querySelectorAll('.status-section-card').forEach((btn) => {
        const active = btn.dataset.section === key;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    updateViewStatusPill(view, key);
}

function updateViewStatusPill(view, section) {
    const pillMap = {
        sales: 'enquiriesStatusPill',
        tracking: 'trackingStatusPill',
        finance: 'financeStatusPill'
    };
    const pill = document.getElementById(pillMap[view]);
    if (!pill) return;
    const labelEl = pill.querySelector('.status-text');
    if (!labelEl) return;
    const labels = STATUS_SECTION_LABELS[view] || {};
    labelEl.textContent = labels[section] || section || 'All';
}

function countSalesSection(section) {
    const active = enquiries.filter((e) => !e.is_void);
    if (section === 'pending_pricing') return active.filter((e) => (e.stage || 1) <= 1).length;
    if (section === 'pending_confirmation') return active.filter((e) => e.stage === 2).length;
    return active.length;
}

function countTrackingSection(section) {
    const ops = enquiries.filter((e) => e.stage >= 3 && !e.is_void);
    return ops.filter((e) => {
        const s = cachedBulkStatus[e.id] || null;
        if (section === 'pending_booking') return !(s && s.booking_confirmed);
        if (section === 'pending_si') return !(s && s.si_submitted);
        if (section === 'pending_bl') return !(s && s.bl_received);
        if (section === 'pending_sob') return !(s && s.sob);
        return true;
    }).length;
}

function isShippingLinePaymentDone(status) {
    if (!status) return false;
    return !!(status.pay_line || status.shipping_payment_done);
}

function isInvoiceCreateCompleted(invoice) {
    if (!invoice) return false;
    const invoiceNumber = (invoice.invoice_number || '').trim();
    const irn = (invoice.irn || '').trim();
    return !!(invoiceNumber && irn);
}

async function fetchFinanceInvoicesCache() {
    try {
        const res = await fetch(`${CONFIG.API_URL}/api/invoice/list`);
        if (!res.ok) return window._financeInvoiceByEnquiry || {};
        const payload = await res.json();
        if (!Array.isArray(payload)) return window._financeInvoiceByEnquiry || {};
        window._financeInvoicesList = payload;
        const byEnquiry = {};
        for (const inv of payload) {
            if (inv.enquiry_id != null) byEnquiry[inv.enquiry_id] = inv;
        }
        window._financeInvoiceByEnquiry = byEnquiry;
        return byEnquiry;
    } catch (e) {
        console.error('fetchFinanceInvoicesCache:', e);
        return window._financeInvoiceByEnquiry || {};
    }
}

function getInvoiceForEnquiry(enquiryId) {
    return (window._financeInvoiceByEnquiry || {})[enquiryId] || null;
}

function countFinanceSection(section) {
    return countFinanceCompletion(section, 'pending');
}

function countFinanceCompletion(section, completionTab) {
    const ops = enquiries.filter((e) => e.stage >= 3 && !e.is_void);
    const showCompleted = completionTab === 'completed';

    if (section === 'payments') {
        return ops.filter((e) => {
            const s = cachedBulkStatus[e.id];
            if (!s || !s.shipping_invoice) return false;
            const done = isShippingLinePaymentDone(s);
            return showCompleted ? done : !done;
        }).length;
    }
    if (section === 'invoices') {
        return ops.filter((e) => {
            const s = cachedBulkStatus[e.id];
            if (!s || !s.shipping_invoice || !s.bl_received) return false;
            const done = isInvoiceCreateCompleted(getInvoiceForEnquiry(e.id));
            return showCompleted ? done : !done;
        }).length;
    }
    if (section === 'received') {
        // Pending count for main card comes from financeReceivedCount (invoice list).
        if (!window._financeReceivedInvoices) return showCompleted ? 0 : financeReceivedCount;
        return window._financeReceivedInvoices.filter((inv) => showCompleted ? !!inv.is_paid : !inv.is_paid).length;
    }
    return 0;
}

function updateFinanceCompletionCounts() {
    const tabs = document.getElementById('financeCompletionTabs');
    if (!tabs || !currentFinanceSubView) return;
    const pendingEl = tabs.querySelector('[data-completion-count="pending"]');
    const completedEl = tabs.querySelector('[data-completion-count="completed"]');
    if (pendingEl) pendingEl.textContent = countFinanceCompletion(currentFinanceSubView, 'pending');
    if (completedEl) completedEl.textContent = countFinanceCompletion(currentFinanceSubView, 'completed');
}

function setFinanceCompletionTab(tab) {
    currentFinanceCompletionTab = tab === 'completed' ? 'completed' : 'pending';
    const tabs = document.getElementById('financeCompletionTabs');
    if (tabs) {
        tabs.querySelectorAll('.finance-completion-tab').forEach((btn) => {
            const active = btn.dataset.completion === currentFinanceCompletionTab;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });
    }
    updateFinanceCompletionCounts();
}

function initFinanceCompletionTabs() {
    const tabs = document.getElementById('financeCompletionTabs');
    if (!tabs || tabs.dataset.bound) return;
    tabs.dataset.bound = '1';
    tabs.querySelectorAll('.finance-completion-tab').forEach((btn) => {
        btn.addEventListener('click', () => {
            setFinanceCompletionTab(btn.dataset.completion);
            paginationState.finance.currentPage = 1;
            updateFinanceTable(currentFinanceSubView);
        });
    });
}

function updateStatusSectionCounts() {
    const salesEl = document.getElementById('salesStatusSections');
    if (salesEl) {
        ['pending_pricing', 'pending_confirmation', 'all'].forEach((section) => {
            const span = salesEl.querySelector(`[data-count="${section}"]`);
            if (span) span.textContent = countSalesSection(section);
        });
    }

    const trackingEl = document.getElementById('trackingStatusSections');
    if (trackingEl) {
        ['pending_booking', 'pending_si', 'pending_bl', 'pending_sob'].forEach((section) => {
            const span = trackingEl.querySelector(`[data-count="${section}"]`);
            if (span) span.textContent = countTrackingSection(section);
        });
    }

    const financeEl = document.getElementById('financeStatusSections');
    if (financeEl) {
        ['payments', 'invoices', 'received'].forEach((section) => {
            const span = financeEl.querySelector(`[data-count="${section}"]`);
            if (span) span.textContent = countFinanceSection(section);
        });
    }
}

async function refreshBulkStatusCache() {
    const ids = enquiries.filter((e) => e.stage >= 3 && !e.is_void).map((e) => e.id);
    cachedBulkStatus = ids.length ? await fetchBulkStatus(ids) : {};
    updateStatusSectionCounts();
}

function initStatusSections() {
    document.querySelectorAll('.status-section-card').forEach((btn) => {
        if (btn.dataset.bound) return;
        btn.dataset.bound = '1';
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            const section = btn.dataset.section;
            setActiveStatusSection(view, section);

            if (view === 'sales') {
                paginationState.allEnquiries.currentPage = 1;
                const filter = section === 'all' ? null : section;
                updateAllEnquiriesTable(filter);
            } else if (view === 'tracking') {
                paginationState.tracking.currentPage = 1;
                updateTrackingTable(section);
            } else if (view === 'finance') {
                paginationState.finance.currentPage = 1;
                currentFinanceCompletionTab = 'pending';
                setFinanceCompletionTab('pending');
                const hash = section === 'payments' ? '#finance-payments'
                    : section === 'invoices' ? '#finance-invoices'
                        : '#finance-received';
                if (window.location.hash !== hash) window.location.hash = hash;
                updateFinanceTable(section);
            }
        });
    });
}

function initListTableUI(config) {
    const {
        searchId,
        exportId,
        toggleBtnId,
        menuId,
        dropdownId,
        cardId,
        tableId,
        tbodyId,
        exportName
    } = config;

    const input = document.getElementById(searchId);
    if (input && !input.dataset.bound) {
        input.dataset.bound = '1';
        input.addEventListener('input', () => {
            applyTableSearchFilter(tbodyId, input);
            updateTableRecordsCount(tbodyId, config.recordsCountId);
        });
    }

    const exportBtn = document.getElementById(exportId);
    if (exportBtn && !exportBtn.dataset.bound) {
        exportBtn.dataset.bound = '1';
        exportBtn.addEventListener('click', () => exportVisibleTableToCsv(tableId, tbodyId, exportName));
    }

    const menu = document.getElementById(menuId);
    const toggleBtn = document.getElementById(toggleBtnId);
    const card = document.getElementById(cardId);

    if (toggleBtn && menu && !toggleBtn.dataset.bound) {
        toggleBtn.dataset.bound = '1';
        toggleBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            menu.classList.toggle('open');
        });
    }

    if (menu && card && !menu.dataset.bound) {
        menu.dataset.bound = '1';
        menu.addEventListener('change', (e) => {
            const cb = e.target.closest('input[type="checkbox"][data-col]');
            if (!cb) return;
            const cls = `cols-hide-${cb.dataset.col}`;
            if (cb.checked) card.classList.remove(cls);
            else card.classList.add(cls);
        });
    }

    if (dropdownId && !document.body.dataset[`dropdownBound_${dropdownId}`]) {
        document.body.dataset[`dropdownBound_${dropdownId}`] = '1';
        document.addEventListener('click', (e) => {
            const wrap = document.getElementById(dropdownId);
            const menuEl = document.getElementById(menuId);
            if (!wrap || !menuEl) return;
            if (wrap.contains(e.target)) return;
            menuEl.classList.remove('open');
        });
    }
}

function applyTableSearchFilter(tbodyId, input) {
    if (typeof window.applyListTableFilters === 'function') {
        window.applyListTableFilters(tbodyId, input);
        return;
    }
    const tbody = document.getElementById(tbodyId);
    if (!tbody || !input) return;
    const q = (input.value || '').trim().toLowerCase();
    Array.from(tbody.querySelectorAll('tr')).forEach((tr) => {
        const text = (tr.textContent || '').toLowerCase();
        tr.style.display = !q || text.includes(q) ? '' : 'none';
    });
}

function afterListTableRender(tbodyId, searchInputId, recordsCountId) {
    const input = searchInputId ? document.getElementById(searchInputId) : null;
    applyTableSearchFilter(tbodyId, input);
    if (recordsCountId) updateTableRecordsCount(tbodyId, recordsCountId);
    if (typeof window.refreshListTableFilters === 'function') {
        window.refreshListTableFilters(tbodyId);
    }
}

function updateTableRecordsCount(tbodyId, countId) {
    const tbody = document.getElementById(tbodyId);
    const out = countId ? document.getElementById(countId) : null;
    if (!tbody || !out) return;
    const visible = Array.from(tbody.querySelectorAll('tr')).filter((tr) => tr.style.display !== 'none');
    out.textContent = String(visible.length);
}

function exportVisibleTableToCsv(tableId, tbodyId, filenamePrefix) {
    const table = document.getElementById(tableId);
    const tbody = document.getElementById(tbodyId);
    if (!table || !tbody) return;

    const headers = Array.from(table.querySelectorAll('thead th'))
        .filter((th) => th.offsetParent !== null)
        .map((th) => (th.textContent || '').trim());

    const rows = Array.from(tbody.querySelectorAll('tr'))
        .filter((tr) => tr.style.display !== 'none')
        .map((tr) => Array.from(tr.querySelectorAll('td'))
            .filter((td) => td.offsetParent !== null)
            .map((td) => {
                const t = (td.textContent || '').trim().replace(/\s+/g, ' ');
                return `"${t.replace(/"/g, '""')}"`;
            }).join(','));

    const csv = [headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

async function fetchDashboardStats() {
    try {
        const response = await fetch(`${CONFIG.API_URL}/api/dashboard/stats`);
        if (!response.ok) {
            console.error('Dashboard stats HTTP error:', response.status, await response.text());
            return;
        }
        const data = await response.json();
        const setStat = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val ?? 0;
        };
        setStat('totalEnquiry', data.total_enquiries);
        setStat('pendingPricing', data.pending_at_pricing);
        setStat('pendingConfirmation', data.pending_client_confirmation);
        setStat('bookingPendingCount', data.booking_pending);
        setStat('siPendingCount', data.si_pending);
        setStat('blPendingCount', data.bl_pending);
        setStat('sobPendingCount', data.sob_pending);
        setStat('financeInvoicesRaised', data.invoices_raised);
        setStat('paymentPendingCount', data.payment_pending);

        // Section header totals (derived)
        setStat('salesTotalInline', (data.pending_at_pricing ?? 0) + (data.pending_client_confirmation ?? 0));
        setStat('trafficTotalInline', (data.booking_pending ?? 0) + (data.si_pending ?? 0) + (data.bl_pending ?? 0));
        setStat('opsTotalInline', (data.sob_pending ?? 0) + (data.invoices_raised ?? 0) + (data.payment_pending ?? 0));
        updateStatusSectionCounts();
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
    }
}

function formatInrAmount(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

function formatInrLakhs(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    const abs = Math.abs(n);
    if (abs >= 100000) {
        return `₹${(n / 100000).toFixed(2)} L`;
    }
    if (abs >= 1000) {
        return `₹${(n / 1000).toFixed(2)} K`;
    }
    return formatInrAmount(n);
}

function formatMarginPct(value, digits = 1) {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    return `${Number(value).toFixed(digits)}%`;
}

function analyticsValueClass(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n === 0) return '';
    return n > 0 ? 'positive' : 'negative';
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function buildMarginGaugeSvg(pct) {
    const p = Math.min(100, Math.max(0, Number(pct) || 0));
    const r = 34;
    const c = 2 * Math.PI * r;
    const offset = c - (p / 100) * c;
    return `<svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="8" /><circle cx="40" cy="40" r="${r}" fill="none" stroke="#f97316" stroke-width="8" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" stroke-linecap="round" transform="rotate(-90 40 40)" /></svg>`;
}

function renderAnalyticsSummary(summary) {
    const total = summary.total_enquiries ?? 0;
    const marginPct = summary.margin_pct;
    const marginClass = analyticsValueClass(marginPct);

    setText('analyticsTripsBadge', `${total} Total`);
    setText('analyticsTripsValue', String(total));
    setText('analyticsRecordsBadge', `${total} Records`);

    setText('analyticsRevenue', formatInrLakhs(summary.total_revenue_inr));
    setText('analyticsCost', formatInrLakhs(summary.total_cost_inr));
    setText('analyticsCostMarginPill', `Net Margin: ${formatMarginPct(marginPct, 1)}`);
    setText('analyticsCapture', formatInrLakhs(summary.capture_inr));

    const captureEl = document.getElementById('analyticsCapture');
    if (captureEl) {
        captureEl.classList.remove('positive', 'negative');
        if (marginClass) captureEl.classList.add(marginClass);
    }

    const marginPctText = formatMarginPct(marginPct, 2);
    setText('analyticsMarginPct', marginPctText);

    const trendBadge = document.getElementById('analyticsMarginTrendBadge');
    if (trendBadge) {
        const positive = Number(marginPct) >= 0;
        trendBadge.textContent = `${positive ? '↗' : '↘'} ${marginPctText}`;
        trendBadge.classList.toggle('positive', positive);
        trendBadge.classList.toggle('negative', !positive && marginPct != null);
    }

    const gaugeWrap = document.getElementById('analyticsMarginGauge');
    if (gaugeWrap) {
        const iconHtml = '<div class="biz-kpi-gauge-icon"><i class="fas fa-bullseye"></i></div>';
        gaugeWrap.innerHTML = buildMarginGaugeSvg(marginPct) + iconHtml;
    }
}

async function fetchDashboardAnalytics() {
    const tbody = document.getElementById('analyticsEnquiryTable');
    if (tbody) {
        tbody.innerHTML = '<tr class="analytics-loading-row"><td colspan="8">Loading analytics…</td></tr>';
    }

    try {
        const response = await fetch(`${CONFIG.API_URL}/api/dashboard/analytics`);
        if (!response.ok) {
            console.error('Dashboard analytics HTTP error:', response.status, await response.text());
            if (tbody) {
                tbody.innerHTML = '<tr class="analytics-empty-row"><td colspan="8">Could not load analytics.</td></tr>';
            }
            return;
        }

        const data = await response.json();
        const summary = data.summary || {};
        renderAnalyticsSummary(summary);

        if (!tbody) return;

        const rows = Array.isArray(data.enquiries) ? data.enquiries : [];
        if (!rows.length) {
            tbody.innerHTML = '<tr class="analytics-empty-row"><td colspan="8">No economics data yet. Add rows to enquiry_economics.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map((row) => `
                <tr>
                    <td><a href="#shipment/${row.enquiry_id}" class="table-link">${escapeHtml(row.enquiry_number || '—')}</a></td>
                    <td>${escapeHtml(row.master_number || '—')}</td>
                    <td>${escapeHtml(row.client_name || '—')}</td>
                    <td>${escapeHtml(row.route || '—')}</td>
                    <td class="num">${formatInrAmount(row.cost_inr)}</td>
                    <td class="num">${formatInrAmount(row.revenue_inr)}</td>
                    <td class="num ${analyticsValueClass(row.capture_inr)}">${formatInrAmount(row.capture_inr)}</td>
                    <td class="num ${analyticsValueClass(row.margin_pct)}">${formatMarginPct(row.margin_pct)}</td>
                </tr>
            `).join('');
    } catch (error) {
        console.error('Error fetching dashboard analytics:', error);
        if (tbody) {
            tbody.innerHTML = '<tr class="analytics-empty-row"><td colspan="8">Could not load analytics.</td></tr>';
        }
    }
}

window.addEventListener('hashchange', handleRouting);

function handleRouting() {
    const hash = window.location.hash;
    const shipmentMatch = hash.match(/^#shipment\/(\d+)$/);
    if (shipmentMatch) {
        showShipmentDetailView(parseInt(shipmentMatch[1], 10));
        return;
    }

    if (hash === '#enquiries') {
        showEnquiriesView();
    } else if (hash === '#quotes') {
        showQuotesView();
    } else if (hash === '#tracking') {
        showTrackingView();
    } else if (hash === '#finance' || hash === '#finance-payments' || hash === '#finance-invoices' || hash === '#finance-received') {
        const subView = hash.replace('#finance-', '');
        showFinanceView(subView === '#finance' ? null : subView);
    } else if (hash === '#masters') {
        showMastersDashboard();
    } else if (hash === '#masters-clients') {
        showMastersClientList();
    } else if (hash === '#masters-shipping-lines') {
        showMastersShippingList();
    } else {
        showDashboardView();
        updateNavPricingLink();
    }
    if (typeof window.updateGlobalSearchVisibility === 'function') {
        window.updateGlobalSearchVisibility();
    }
}

function updateNavPricingLink() {
    // If there's a recent enquiry, set the sidebar link to its pricing page
    if (enquiries.length > 0) {
        const latest = enquiries[0];
        const navPricing = document.getElementById('navPricing');
        if (navPricing && navPricing.tagName === 'A') {
            // Keep the hashtag, but we might want to store the ID for the first click
            // For now, the sidebar link is #quotes, which triggers showQuotesView
        }
    }
}

async function fetchAllEnquiries() {
    try {
        const response = await fetch(`${CONFIG.API_URL}/api/enquiry/`);
        if (response.ok) {
            enquiries = await response.json();
            // Sort by recent first
            enquiries.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            updateDashboardTable();
            updateAllEnquiriesTable();
            // Fire table refreshes without blocking — they render as data arrives
            updateQuotesTable();
            updateTrackingTable();
            updateFinanceTable();
            await refreshBulkStatusCache();
        }
    } catch (error) {
        console.error('Error fetching enquiries:', error);
    }
}

/**
 * Fetch shipment statuses for multiple enquiry IDs in a single API call.
 * Returns a dict: { enquiry_id (number): status_object }
 */
async function fetchBulkStatus(ids) {
    if (!ids || ids.length === 0) return {};
    try {
        const res = await fetch(`${CONFIG.API_URL}/api/tracking/status/bulk?ids=${ids.join(',')}`);
        if (!res.ok) return {};
        const data = await res.json();
        // Keys come back as strings from JSON — normalize to numbers
        const normalized = {};
        for (const [k, v] of Object.entries(data)) normalized[parseInt(k)] = v;
        return normalized;
    } catch (e) {
        console.error('Bulk status fetch failed:', e);
        return {};
    }
}

function showDashboardView() {
    hideAllViews();
    setActiveLink('navDashboard');
    document.getElementById('dashboardView').style.display = 'block';
}

function showEnquiriesView(filterType = null) {
    hideAllViews();
    setActiveLink('navEnquiries');
    document.getElementById('enquiriesView').style.display = 'block';

    const section = filterType || currentAllEnquiriesFilter || 'all';
    setActiveStatusSection('sales', section);

    const title = document.querySelector('#enquiriesView .view-h1');
    if (title) {
        if (section === 'pending_pricing') title.textContent = 'Sales - Pending at Pricing';
        else if (section === 'pending_confirmation') title.textContent = 'Sales - Pending Confirmation';
        else title.textContent = 'Sales';
    }

    paginationState.allEnquiries.currentPage = 1;
    updateAllEnquiriesTable(section === 'all' ? null : section);
}

function showQuotesView() {
    hideAllViews();
    setActiveLink('navPricing');
    document.getElementById('quotesView').style.display = 'block';
    paginationState.quotes.currentPage = 1;
    updateQuotesTable();
}

function showTrackingView(filterType = null) {
    hideAllViews();
    setActiveLink('navTracking');
    document.getElementById('trackingView').style.display = 'block';

    const section = filterType || currentTrackingFilter || 'pending_booking';
    setActiveStatusSection('tracking', section);

    const title = document.querySelector('#trackingView .view-h1');
    if (title) {
        if (section === 'pending_si') title.textContent = 'Tracking - Pending SI';
        else if (section === 'pending_bl') title.textContent = 'Tracking - Pending BL';
        else if (section === 'pending_sob') title.textContent = 'Tracking - SOB Remaining';
        else if (section === 'pending_booking') title.textContent = 'Tracking - Booking Pending';
        else title.textContent = 'Tracking & Documents';
    }

    paginationState.tracking.currentPage = 1;
    updateTrackingTable(section);
}

async function showFinanceView(subView = null) {
    hideAllViews();
    setActiveLink('navFinance');
    document.getElementById('financeView').style.display = 'block';

    const financeGroup = document.getElementById('financeRailGroup');
    closeOtherRailGroups(financeGroup);

    const section = subView || currentFinanceSubView || 'payments';
    setActiveStatusSection('finance', section);

    const title = document.querySelector('#financeView .view-h1');
    const desc = document.querySelector('#financeView .view-subtitle');

    if (section === 'payments') {
        if (title) title.textContent = 'Payment to Shipping Line';
        if (desc) desc.textContent = 'Manage and record payments made to shipping lines';
        setActiveLink('navFinancePayments');
    } else if (section === 'invoices') {
        if (title) title.textContent = 'Create Client Invoice';
        if (desc) desc.textContent = 'Review BL status and generate invoices for clients';
        setActiveLink('navFinanceInvoices');
    } else if (section === 'received') {
        if (title) title.textContent = 'Payments Received from Client';
        if (desc) desc.textContent = 'Record and track payments received from clients for invoices';
        setActiveLink('navFinanceReceived');
    } else {
        if (title) title.textContent = 'Finance';
        if (desc) desc.textContent = 'Manage payments and client invoices';
    }

    paginationState.finance.currentPage = 1;
    setFinanceCompletionTab(currentFinanceCompletionTab);
    if (section === 'invoices') {
        await fetchFinanceInvoicesCache();
    }
    await updateFinanceTable(section);
}

function setActiveLink(id) {
    document.querySelectorAll('.sidebar-link').forEach(link => link.classList.remove('active'));
    const active = document.getElementById(id);
    if (active) active.classList.add('active');
}

function closeOtherRailGroups(exceptGroup) {
    document.querySelectorAll('.rail-group.is-open').forEach((group) => {
        if (group !== exceptGroup) group.classList.remove('is-open');
    });
}

window.toggleFinanceNav = function toggleFinanceNav(e) {
    e.preventDefault();
    e.stopPropagation();
    const group = document.getElementById('financeRailGroup');
    if (!group) return;
    const willOpen = !group.classList.contains('is-open');
    closeOtherRailGroups(group);
    group.classList.toggle('is-open', willOpen);
    setActiveLink('navFinance');
};

function toggleSettingsNav(e) {
    e.preventDefault();
    e.stopPropagation();
    const group = document.getElementById('settingsRailGroup');
    if (!group) return;
    const willOpen = !group.classList.contains('is-open');
    closeOtherRailGroups(group);
    group.classList.toggle('is-open', willOpen);
    setActiveLink('navSettings');
}

function hideAllViews() {
    document.getElementById('dashboardView').style.display = 'none';
    document.getElementById('enquiriesView').style.display = 'none';
    document.getElementById('quotesView').style.display = 'none';
    document.getElementById('trackingView').style.display = 'none';
    const financeView = document.getElementById('financeView');
    if (financeView) financeView.style.display = 'none';
    const shipmentView = document.getElementById('shipmentDetailView');
    if (shipmentView) shipmentView.style.display = 'none';

    ['mastersDashboardView', 'mastersClientListView', 'mastersShippingListView'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

async function updateDashboardTable() {
    const tbody = document.getElementById('enquiryTable');
    if (!tbody) return;
    tbody.innerHTML = '';

    const recent = enquiries.slice(0, 5);

    // One bulk call for any stage>=3 rows
    const opsIds = recent.filter(e => e.stage >= 3).map(e => e.id);
    const bulkStatus = opsIds.length > 0 ? await fetchBulkStatus(opsIds) : {};

    recent.forEach(e => {
        const s = e.stage >= 3 ? (bulkStatus[e.id] || null) : null;
        tbody.appendChild(createEnquiryRowWithStatus(e, s, true));
    });
}

function renderPagination(containerId, totalItems, currentPage, onPageChange) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (totalItems <= PAGE_SIZE) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'flex';
    const totalPages = Math.ceil(totalItems / PAGE_SIZE);

    const start = (currentPage - 1) * PAGE_SIZE + 1;
    const end = Math.min(currentPage * PAGE_SIZE, totalItems);

    let html = `
        <div class="pagination-info" style="display: flex; align-items: center; gap: 16px;">
            <span>Showing <strong>${start}-${end}</strong> of <strong>${totalItems}</strong></span>
            <div class="page-size-selector" style="display: flex; align-items: center; gap: 8px; margin-left: 8px; padding-left: 16px; border-left: 1px solid var(--border-light);">
                <label style="margin: 0; font-size: 13px; color: var(--text-tertiary); font-weight: 500;">Show:</label>
                <select onchange="changePageSize(this.value)" style="padding: 2px 8px; font-size: 12px; height: 28px; min-height: 28px;">
                    <option value="10" ${PAGE_SIZE === 10 ? 'selected' : ''}>10</option>
                    <option value="25" ${PAGE_SIZE === 25 ? 'selected' : ''}>25</option>
                    <option value="50" ${PAGE_SIZE === 50 ? 'selected' : ''}>50</option>
                    <option value="100" ${PAGE_SIZE === 100 ? 'selected' : ''}>100</option>
                </select>
            </div>
        </div>
        <div class="pagination-controls">
            <button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="${onPageChange}(${currentPage - 1})">
                <i class="fas fa-chevron-left"></i>
            </button>
    `;

    // Simple page numbers
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);

    if (endPage - startPage + 1 < maxVisible) {
        startPage = Math.max(1, endPage - maxVisible + 1);
    }

    if (startPage > 1) {
        html += `<button class="page-btn" onclick="${onPageChange}(1)">1</button>`;
        if (startPage > 2) html += `<span style="padding: 0 4px">...</span>`;
    }

    for (let i = startPage; i <= endPage; i++) {
        html += `
            <button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="${onPageChange}(${i})">
                ${i}
            </button>
        `;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += `<span style="padding: 0 4px">...</span>`;
        html += `<button class="page-btn" onclick="${onPageChange}(${totalPages})">${totalPages}</button>`;
    }

    html += `
            <button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="${onPageChange}(${currentPage + 1})">
                <i class="fas fa-chevron-right"></i>
            </button>
        </div>
    `;

    container.innerHTML = html;
}

window.changePageSize = (newSize) => {
    PAGE_SIZE = parseInt(newSize);

    // Reset all pages to 1 when page size changes to avoid out-of-bounds
    paginationState.allEnquiries.currentPage = 1;
    paginationState.quotes.currentPage = 1;
    paginationState.tracking.currentPage = 1;
    paginationState.finance.currentPage = 1;

    // Refresh whichever view is currently active
    const activeView = document.querySelector('.view-content:not([style*="display: none"])');
    if (activeView) {
        if (activeView.id === 'enquiriesView') updateAllEnquiriesTable(currentAllEnquiriesFilter);
        else if (activeView.id === 'quotesView') updateQuotesTable();
        else if (activeView.id === 'trackingView') updateTrackingTable(currentTrackingFilter);
        else if (activeView.id === 'financeView') updateFinanceTable(currentFinanceSubView);
    }
};

// Page change handlers
window.changeAllEnquiriesPage = (page) => {
    paginationState.allEnquiries.currentPage = page;
    updateAllEnquiriesTable(currentAllEnquiriesFilter);
};

window.changeQuotesPage = (page) => {
    paginationState.quotes.currentPage = page;
    updateQuotesTable();
};

window.changeTrackingPage = (page) => {
    paginationState.tracking.currentPage = page;
    updateTrackingTable(currentTrackingFilter);
};

window.changeFinancePage = (page) => {
    paginationState.finance.currentPage = page;
    updateFinanceTable(currentFinanceSubView);
};

// Filters state
let currentAllEnquiriesFilter = null;
let currentTrackingFilter = null;
let currentFinanceSubView = null;

async function updateAllEnquiriesTable(filterType = null) {
    currentAllEnquiriesFilter = filterType;
    const tbody = document.getElementById('allEnquiriesTable');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading...</td></tr>';

    let filteredEnquiries = enquiries;
    if (filterType === 'pending_pricing') {
        filteredEnquiries = enquiries.filter((e) => !e.is_void && (e.stage || 1) <= 1);
    } else if (filterType === 'pending_confirmation') {
        filteredEnquiries = enquiries.filter((e) => !e.is_void && e.stage === 2);
    }

    updateStatusSectionCounts();

    if (filteredEnquiries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No records found.</td></tr>';
        renderPagination('allEnquiriesPagination', 0, 1, 'changeAllEnquiriesPage');
        updateTableRecordsCount('allEnquiriesTable', 'enquiriesRecordsCount');
        updateViewStatusPill('sales', filterType || 'all');
        return;
    }

    const total = filteredEnquiries.length;
    const page = paginationState.allEnquiries.currentPage;
    const start = (page - 1) * PAGE_SIZE;
    const paginated = filteredEnquiries.slice(start, start + PAGE_SIZE);

    const opsIds = paginated.filter((e) => e.stage >= 3 && !e.is_void).map((e) => e.id);
    const bulkStatus = opsIds.length > 0 ? await fetchBulkStatus(opsIds) : {};

    tbody.innerHTML = paginated.map((e) => {
        const s = (e.stage >= 3 && !e.is_void) ? (bulkStatus[e.id] || null) : null;
        return renderListTableRow(e, s);
    }).join('');

    renderPagination('allEnquiriesPagination', total, page, 'changeAllEnquiriesPage');
    afterListTableRender('allEnquiriesTable', 'enquiriesSearchInput', 'enquiriesRecordsCount');
    updateViewStatusPill('sales', filterType || 'all');
}

function createEnquiryRowWithStatus(e, status = null, compact = false) {
    const wrapper = document.createElement('tbody');
    wrapper.innerHTML = renderListTableRow(e, status, { compact });
    return wrapper.firstElementChild;
}

function renderQuotesListRow(e, quoteInfo = {}) {
    const line = quoteInfo.line || '—';
    const total = quoteInfo.total || '—';
    const quoteStatus = quoteInfo.status || 'Draft';
    const statusKey = quoteStatus.toLowerCase();
    const statusHtml = e.is_void
        ? `<span style="display:inline-block; padding: 3px 10px; border-radius: 4px; font-size: 11px; font-weight: 800; background:#1f2937; color:#f9fafb; letter-spacing:0.06em; white-space: nowrap; text-transform:uppercase;">⊘ VOID</span>`
        : `<span class="badge badge-${statusKey}">${escapeHtml(quoteStatus)}</span>`;

    const urgency = getUrgencyMeta(e.stuffing_date || e.created_at);
    const created = formatEnquiryDateTime(e.created_at);
    const required = formatEnquiryDateTime(e.stuffing_date);
    const opacity = e.is_void ? ' style="opacity:0.55"' : '';

    return `
        <tr class="list-row"${opacity}>
            <td data-col="details">
                <div class="cell-enquiry">
                    <a class="cell-enquiry-id" href="#" onclick="openActionModal('view-sale', ${e.id}); return false;">${escapeHtml(e.enquiry_number)}</a>
                    <div class="cell-enquiry-meta">${created}</div>
                    <span class="cell-urgency ${urgency.className}">${urgency.text}</span>
                </div>
            </td>
            <td data-col="client" class="cell-upper">${escapeHtml(e.client_name || '—')}</td>
            <td data-col="location">
                <div class="cell-location">
                    <span class="cell-location-origin">${escapeHtml(truncateText(e.origin, 30))}</span>
                    <span class="cell-location-arrow">→ ${escapeHtml(truncateText(e.destination, 30))}</span>
                </div>
            </td>
            <td data-col="required" class="cell-muted">${required}</td>
            <td data-col="line" class="cell-muted">${escapeHtml(line)}</td>
            <td data-col="total" class="cell-muted cell-amount">${escapeHtml(total)}</td>
            <td data-col="status">${statusHtml}</td>
            <td data-col="action">${renderRowActionsMenu(e, '', quoteStatus)}</td>
        </tr>`;
}

function renderTrackingListRow(e, status = null, extraActionsHtml = '') {
    const statusHtml = statusBadge(e, status);
    const urgency = getUrgencyMeta(e.stuffing_date || e.created_at);
    const created = formatEnquiryDateTime(e.created_at);
    const required = formatEnquiryDateTime(e.stuffing_date);
    const opacity = e.is_void ? ' style="opacity:0.55"' : '';

    return `
        <tr class="list-row"${opacity}>
            <td data-col="details">
                <div class="cell-enquiry">
                    <a class="cell-enquiry-id" href="#" onclick="openActionModal('view-sale', ${e.id}); return false;">${escapeHtml(e.enquiry_number)}</a>
                    <div class="cell-enquiry-meta">${created}</div>
                    <span class="cell-urgency ${urgency.className}">${urgency.text}</span>
                </div>
            </td>
            <td data-col="client" class="cell-upper">${escapeHtml(e.client_name || '—')}</td>
            <td data-col="location">
                <div class="cell-location">
                    <span class="cell-location-origin">${escapeHtml(truncateText(e.origin, 30))}</span>
                    <span class="cell-location-arrow">→ ${escapeHtml(truncateText(e.destination, 30))}</span>
                </div>
            </td>
            <td data-col="required" class="cell-muted">${required}</td>
            <td data-col="status">${statusHtml}</td>
            <td data-col="action">${renderRowActionsMenu(e, extraActionsHtml)}</td>
        </tr>`;
}

function initEnquiriesListUI() {
    initListTableUI({
        searchId: 'enquiriesSearchInput',
        exportId: 'enquiriesExportBtn',
        toggleBtnId: 'enquiriesToggleColumnsBtn',
        menuId: 'enquiriesColumnsMenu',
        dropdownId: 'enquiriesColumnsDropdown',
        cardId: 'enquiriesTableCard',
        tableId: 'enquiriesDataTable',
        tbodyId: 'allEnquiriesTable',
        recordsCountId: 'enquiriesRecordsCount',
        exportName: 'enquiries'
    });
}

function initTrackingListUI() {
    initListTableUI({
        searchId: 'trackingSearchInput',
        exportId: 'trackingExportBtn',
        toggleBtnId: 'trackingToggleColumnsBtn',
        menuId: 'trackingColumnsMenu',
        dropdownId: 'trackingColumnsDropdown',
        cardId: 'trackingTableCard',
        tableId: 'trackingDataTable',
        tbodyId: 'trackingTable',
        recordsCountId: 'trackingRecordsCount',
        exportName: 'tracking'
    });
}

function initFinanceListUI() {
    initListTableUI({
        searchId: 'financeSearchInput',
        exportId: 'financeExportBtn',
        toggleBtnId: 'financeToggleColumnsBtn',
        menuId: 'financeColumnsMenu',
        dropdownId: 'financeColumnsDropdown',
        cardId: 'financeTableWrap',
        tableId: 'financeDataTable',
        tbodyId: 'financeTable',
        recordsCountId: 'financeRecordsCount',
        exportName: 'finance'
    });
}

function initQuotesListUI() {
    initListTableUI({
        searchId: 'quotesSearchInput',
        exportId: 'quotesExportBtn',
        toggleBtnId: 'quotesToggleColumnsBtn',
        menuId: 'quotesColumnsMenu',
        dropdownId: 'quotesColumnsDropdown',
        cardId: 'quotesTableCard',
        tableId: 'quotesDataTable',
        tbodyId: 'quotesTable',
        recordsCountId: 'quotesRecordsCount',
        exportName: 'quotes'
    });
}

async function updateQuotesTable() {
    const tbody = document.getElementById('quotesTable');
    if (!tbody) return;

    // Only show enquiries that have moved to pricing stage (Stage 2 or above)
    const pricingEnquiries = enquiries.filter(e => e.stage >= 2);
    const total = pricingEnquiries.length;
    const page = paginationState.quotes.currentPage;
    const startIdx = (page - 1) * PAGE_SIZE;
    const paginatedEnquiries = pricingEnquiries.slice(startIdx, startIdx + PAGE_SIZE);

    if (total === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No records found.</td></tr>';
        renderPagination('quotesPagination', 0, 1, 'changeQuotesPage');
        updateTableRecordsCount('quotesTable', 'quotesRecordsCount');
        return;
    }

    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Loading...</td></tr>';

    const rowsHtml = await Promise.all(paginatedEnquiries.map(async (e) => {
        let quoteInfo = { line: '—', total: '—', status: 'Draft' };
        try {
            const res = await fetch(`${CONFIG.API_URL}/api/quotes/enquiry/${e.id}`);
            if (res.ok) {
                const quotes = await res.json();
                const accepted = quotes.find((q) => q.status === 'accepted') || quotes[0];
                if (accepted) {
                    quoteInfo.line = accepted.shipping_line || 'Multiple';
                    quoteInfo.total = accepted.final_quote_inr ? `₹${accepted.final_quote_inr.toLocaleString()}` : '—';
                    quoteInfo.status = accepted.status.charAt(0).toUpperCase() + accepted.status.slice(1);
                }
            }
        } catch (err) {
            console.error('Error fetching quote info:', err);
        }

        return renderQuotesListRow(e, quoteInfo);
    }));

    tbody.innerHTML = rowsHtml.join('');
    renderPagination('quotesPagination', total, page, 'changeQuotesPage');
    afterListTableRender('quotesTable', 'quotesSearchInput', 'quotesRecordsCount');
}




async function updateTrackingTable(filterType = null) {
    currentTrackingFilter = filterType || 'pending_booking';
    const tbody = document.getElementById('trackingTable');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading...</td></tr>';

    const trackingEnquiries = enquiries.filter((e) => e.stage >= 3 && !e.is_void);
    if (trackingEnquiries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No records found.</td></tr>';
        renderPagination('trackingPagination', 0, 1, 'changeTrackingPage');
        updateTableRecordsCount('trackingTable', 'trackingRecordsCount');
        updateViewStatusPill('tracking', currentTrackingFilter);
        return;
    }

    const ids = trackingEnquiries.map((e) => e.id);
    const bulkStatus = Object.keys(cachedBulkStatus).length
        ? cachedBulkStatus
        : await fetchBulkStatus(ids);
    if (!Object.keys(cachedBulkStatus).length) cachedBulkStatus = bulkStatus;

    const filteredResults = trackingEnquiries.filter((e) => {
        const s = bulkStatus[e.id] || null;
        if (filterType === 'pending_si') return !(s && s.si_submitted);
        if (filterType === 'pending_bl') return !(s && s.bl_received);
        if (filterType === 'pending_sob') return !(s && s.sob);
        if (filterType === 'pending_booking') return !(s && s.booking_confirmed);
        return true;
    });

    updateStatusSectionCounts();

    const total = filteredResults.length;
    if (total === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No records found.</td></tr>';
        renderPagination('trackingPagination', 0, 1, 'changeTrackingPage');
        updateTableRecordsCount('trackingTable', 'trackingRecordsCount');
        updateViewStatusPill('tracking', currentTrackingFilter);
        return;
    }

    const page = paginationState.tracking.currentPage;
    const startIdx = (page - 1) * PAGE_SIZE;
    const paginatedResults = filteredResults.slice(startIdx, startIdx + PAGE_SIZE);

    tbody.innerHTML = paginatedResults.map((e) => {
        const s = bulkStatus[e.id] || null;
        const extra = `
            <button class="actions-item" onclick="openActionModal('view-tracking', ${e.id})">
                <i class="fas fa-shipping-fast"></i> View Tracking
            </button>`;
        return renderTrackingListRow(e, s, extra);
    }).join('');

    renderPagination('trackingPagination', total, page, 'changeTrackingPage');
    afterListTableRender('trackingTable', 'trackingSearchInput', 'trackingRecordsCount');
    updateViewStatusPill('tracking', currentTrackingFilter);
}

async function updateFinanceTable(subView = null) {
    currentFinanceSubView = subView || 'payments';
    const tbody = document.getElementById('financeTable');
    const tableWrap = document.getElementById('financeTableWrap');
    const receivedEl = document.getElementById('financeReceivedSections');

    setActiveStatusSection('finance', currentFinanceSubView);
    updateViewStatusPill('finance', currentFinanceSubView);

    if (currentFinanceSubView === 'received') {
        if (!tbody) return;
        if (tableWrap) tableWrap.style.display = 'block';
        if (receivedEl) {
            receivedEl.style.display = 'none';
            receivedEl.innerHTML = '';
        }
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading invoices…</td></tr>';
        try {
            const res = await fetch(`${CONFIG.API_URL}/api/invoice/list`);
            let payload;
            try {
                payload = await res.json();
            } catch (je) {
                throw new Error('Server did not return JSON (check API URL / login).');
            }
            if (res.ok && Array.isArray(payload)) {
                window._financeReceivedInvoices = payload;
                financeReceivedCount = payload.filter((inv) => !inv.is_paid).length;
                updateStatusSectionCounts();
                updateFinanceCompletionCounts();
                try {
                    await renderFinanceReceivedTable(payload);
                } catch (re) {
                    console.error('renderFinanceReceivedTable:', re);
                    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);">Could not render invoice list. ${escapeHtml(re.message || String(re))}</td></tr>`;
                    renderPagination('financePagination', 0, 1, 'changeFinancePage');
                    updateFinanceStats();
                }
            } else {
                const detail = payload && payload.detail != null ? String(payload.detail) : `HTTP ${res.status}`;
                tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);">Could not load invoices. ${escapeHtml(detail)}</td></tr>`;
                renderPagination('financePagination', 0, 1, 'changeFinancePage');
                updateFinanceStats();
            }
        } catch (err) {
            console.error('Error fetching invoices:', err);
            const hint = err && err.message ? err.message : String(err);
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);">Error loading invoices. ${escapeHtml(hint)}</td></tr>`;
            renderPagination('financePagination', 0, 1, 'changeFinancePage');
            updateFinanceStats();
        }
        return;
    }

    if (!tbody) return;

    if (tableWrap) tableWrap.style.display = 'block';
    if (receivedEl) {
        receivedEl.style.display = 'none';
        receivedEl.innerHTML = '';
    }

    updateFinanceTableChrome(currentFinanceSubView);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading...</td></tr>';

    const operationalEnquiries = enquiries.filter((e) => e.stage >= 3 && !e.is_void);
    if (operationalEnquiries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No records found.</td></tr>';
        renderPagination('financePagination', 0, 1, 'changeFinancePage');
        updateFinanceStats();
        updateStatusSectionCounts();
        return;
    }

    const ids = operationalEnquiries.map((e) => e.id);
    const [bulkStatus] = await Promise.all([
        fetchBulkStatus(ids),
        currentFinanceSubView === 'invoices' ? fetchFinanceInvoicesCache() : Promise.resolve(null),
    ]);
    cachedBulkStatus = { ...cachedBulkStatus, ...bulkStatus };

    const financeEnquiries = operationalEnquiries
        .map((e) => {
            const s = bulkStatus[e.id] || null;
            if (!s || !s.shipping_invoice) return null;
            const savedInvoice = getInvoiceForEnquiry(e.id);
            return {
                ...e,
                bl_received: !!s.bl_received,
                payment_done: isShippingLinePaymentDone(s),
                invoice_complete: isInvoiceCreateCompleted(savedInvoice),
            };
        })
        .filter(Boolean)
        .filter((e) => {
            const s = bulkStatus[e.id] || null;
            const showCompleted = currentFinanceCompletionTab === 'completed';
            if (currentFinanceSubView === 'payments') {
                if (!s) return false;
                const done = isShippingLinePaymentDone(s);
                return showCompleted ? done : !done;
            }
            if (currentFinanceSubView === 'invoices') {
                if (!s || !s.bl_received) return false;
                return showCompleted ? e.invoice_complete : !e.invoice_complete;
            }
            return true;
        });

    updateStatusSectionCounts();
    updateFinanceCompletionCounts();

    const total = financeEnquiries.length;
    if (total === 0) {
        const emptyMsg = currentFinanceCompletionTab === 'completed'
            ? 'No completed records in this section yet.'
            : 'No pending records found.';
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">${emptyMsg}</td></tr>`;
        renderPagination('financePagination', 0, 1, 'changeFinancePage');
        updateFinanceStats();
        updateTableRecordsCount('financeTable', 'financeRecordsCount');
        return;
    }

    const page = paginationState.finance.currentPage;
    const startIdx = (page - 1) * PAGE_SIZE;
    const paginatedFinance = financeEnquiries.slice(startIdx, startIdx + PAGE_SIZE);

    tbody.innerHTML = paginatedFinance.map((e) => renderListTableRow(e, bulkStatus[e.id] || null, {
        statusHtml: financeStatusBadge(e, currentFinanceSubView, currentFinanceCompletionTab),
        actionHtml: renderFinanceActionCell(e, currentFinanceSubView, currentFinanceCompletionTab)
    })).join('');

    renderPagination('financePagination', total, page, 'changeFinancePage');
    afterListTableRender('financeTable', 'financeSearchInput', 'financeRecordsCount');
    updateFinanceStats();
}

window.refreshFinanceView = function refreshFinanceView() {
    return updateFinanceTable(currentFinanceSubView);
};

window.applyFinanceSavedRefresh = async function applyFinanceSavedRefresh(options = {}) {
    if (options.section) {
        currentFinanceSubView = options.section;
        setActiveStatusSection('finance', options.section);
    }
    if (options.moveToCompleted) {
        currentFinanceCompletionTab = 'completed';
        setFinanceCompletionTab('completed');
    }
    if (typeof refreshBulkStatusCache === 'function') await refreshBulkStatusCache();
    if (options.section === 'invoices' || currentFinanceSubView === 'invoices') {
        await fetchFinanceInvoicesCache();
    }
    await updateFinanceTable(currentFinanceSubView || 'payments');
    if (typeof updateFinanceStats === 'function') updateFinanceStats();
    if (typeof updateStatusSectionCounts === 'function') updateStatusSectionCounts();
    if (typeof updateFinanceCompletionCounts === 'function') updateFinanceCompletionCounts();
    if (typeof fetchDashboardStats === 'function') fetchDashboardStats();
};

window.setFinanceCompletionTab = setFinanceCompletionTab;

async function updateFinanceStats() {
    const invoicesRaised = document.getElementById('financeInvoicesRaised');
    const paymentPending = document.getElementById('paymentPendingCount');
    if (!invoicesRaised && !paymentPending) return;

    try {
        const statsRes = await fetch(`${CONFIG.API_URL}/api/dashboard/stats`);
        if (statsRes.ok) {
            const sData = await statsRes.json();
            if (invoicesRaised) invoicesRaised.textContent = sData.invoices_raised || '0';
            if (paymentPending) paymentPending.textContent = sData.payment_pending || '0';
        }
    } catch (e) {
        console.error(e);
    }
}

window.openPaymentModal = function (invoiceId) {
    openActionModal('finance-received', invoiceId);
};

/** Client receipt: open record-payment drawer if this sale has a saved invoice, else Finance Received list */
window.recordAmountForEnquiry = async function (enquiryId) {
    try {
        const res = await fetch(`${CONFIG.API_URL}/api/invoice/details/${enquiryId}`);
        if (res.ok) {
            const inv = await res.json();
            if (inv && inv.id) {
                openActionModal('finance-received', inv.id);
                return;
            }
        }
    } catch (err) {
        console.error('recordAmountForEnquiry:', err);
    }
    showFinanceView('received');
};

/**
 * Maps an enquiry's numeric stage (and optional shipment status flags)
 * to one of the 9 meaningful pipeline labels.
 */
function getEnquiryStatusLabel(e, status = null) {
    const stage = e.stage || 1;

    if (stage <= 1) return { label: 'Pending at Pricing', color: '#7c3aed', bg: '#ede9fe' };
    if (stage === 2) return { label: 'Pending for Client Confirmation', color: '#d97706', bg: '#fef3c7' };

    // Stage 3+ — in operations; refine using shipment status flags
    if (stage >= 3) {
        if (status) {
            if (!status.booking_confirmed) return { label: 'Booking to be secured', color: '#0369a1', bg: '#e0f2fe' };
            if (!status.si_submitted) return { label: 'SI to be submitted', color: '#0891b2', bg: '#cffafe' };
            if (!status.bl_received) return { label: 'BL to be received', color: '#b45309', bg: '#fef9c3' };
            if (!status.sob) return { label: 'SOB Remaining', color: '#6d28d9', bg: '#ede9fe' };
            if (!isShippingLinePaymentDone(status)) return { label: 'Payment Pending at Shipping Line', color: '#dc2626', bg: '#fee2e2' };
            if (!status.inv_raised) return { label: 'Pending Invoices', color: '#b45309', bg: '#fef3c7' };
            if (!status.pay_client) return { label: 'Payment Pending for Client', color: '#0f766e', bg: '#ccfbf1' };
            return { label: 'Completed', color: '#059669', bg: '#d1fae5' };
        }
        // No status loaded yet — show generic operational label
        return { label: 'Booking to be secured', color: '#0369a1', bg: '#e0f2fe' };
    }

    return { label: e.status || 'Unknown', color: '#6b7280', bg: '#f3f4f6' };
}

/**
 * Common helper to render enquiry action items for the dropdown menu.
 * @param {object} e - Enquiry object
 * @param {string} quoteStatus - Optional status for quote-specific actions
 */
function renderEnquiryActions(e, quoteStatus = null) {
    let isAdmin = false;
    try {
        const currentUser = (localStorage.getItem('user') || '').toLowerCase();
        if (window.CONFIG && CONFIG.adminUsers) {
            let admins = CONFIG.adminUsers;
            if (typeof admins === 'string') admins = JSON.parse(admins);
            isAdmin = admins.map(u => u.toLowerCase()).includes(currentUser);
        } else if (currentUser === 'admin') {
            isAdmin = true; // Hard-coded fallback for the 'admin' user
        }
    } catch (err) {
        console.error('isAdmin check failed:', err);
    }

    const voidLabel = e.is_void ? 'Un-void Enquiry' : 'Mark as Void';
    const voidIcon = e.is_void ? 'fa-undo' : 'fa-ban';
    const voidStyle = e.is_void ? 'color:#10b981;' : 'color:#ef4444;'; // emerald-500 and red-500
    
    const voidBtn = isAdmin ? `
        <button class="actions-item" style="${voidStyle} font-weight:600;" onclick="voidEnquiry(${e.id}, event)">
            <i class="fas ${voidIcon}"></i> ${voidLabel}
        </button>` : '';

    // Standard buttons
    let html = `
        <button class="actions-item" onclick="openActionModal('view-sale', ${e.id})">
            <i class="fas fa-file-invoice"></i> View Sale
        </button>
    `;

    // Pricing context — amounts are locked once quote is accepted (stage 3+)
    if (!e.is_void) {
        if (e.stage >= 3 || quoteStatus === 'Accepted') {
            html += `
                <button class="actions-item" onclick="openActionModal('view-quotes', ${e.id})">
                    <i class="fas fa-file-invoice-dollar"></i> View Quotes
                </button>
            `;
        } else if (quoteStatus === 'Draft' || !quoteStatus) {
            html += `
                <button class="actions-item" onclick="openActionModal('edit-quotes', ${e.id})">
                    <i class="fas fa-edit"></i> Edit Quotes
                </button>
            `;
            if (e.stage === 2) {
                html += `
                    <button class="actions-item confirm-item confirm-action" onclick="openActionModal('confirm-quote', ${e.id})">
                        <i class="fas fa-check-double"></i> Confirm Quote
                    </button>
                `;
            }
        } else if (e.stage === 2) {
            html += `
                <button class="actions-item confirm-item confirm-action" onclick="openActionModal('confirm-quote', ${e.id})">
                    <i class="fas fa-check-double"></i> Confirm Quote
                </button>
            `;
        }
    }

    // Add Admin Void/Restore at the end
    html += voidBtn;

    return html;
}

function statusBadge(e, status = null) {
    if (e.is_void) {
        return `<span style="display:inline-block; padding: 3px 10px; border-radius: 4px; font-size: 11px; font-weight: 800; background:#1f2937; color:#f9fafb; letter-spacing:0.06em; white-space: nowrap; text-transform:uppercase;">⊘ VOID</span>`;
    }
    const s = getEnquiryStatusLabel(e, status);
    return `<span style="display:inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; background:${s.bg}; color:${s.color}; white-space: nowrap;">${s.label}</span>`;
}

function createEnquiryRow(e, showDate = false) {
    const tr = document.createElement('tr');
    if (e.is_void) tr.style.opacity = '0.55';
    tr.innerHTML = `
        <td class="job-no-cell">${escapeHtml(e.enquiry_number)}</td>
        <td>${e.client_name}</td>
        <td>${e.origin} → ${e.destination}</td>
        <td>${statusBadge(e)}</td>
        ${showDate ? `<td>${e.stuffing_date ? new Date(e.stuffing_date).toLocaleDateString() : '---'}</td>` : ''}
        <td>
            <div class="actions-dropdown">
                <button class="actions-btn">Actions <i class="fas fa-chevron-down"></i></button>
                <div class="actions-menu">
                    ${renderEnquiryActions(e)}
                </div>
            </div>
        </td>
    `;
    return tr;
}

function viewEnquiry(id) {
    openActionModal('view-sale', id);
}

function startNewEnquiry() {
    openActionModal('new-sale');
}

window.voidEnquiry = async function (enquiryId, event) {
    if (event) event.stopPropagation();
    const enq = enquiries.find(e => e.id === enquiryId);
    if (!enq) return;

    const actionLabel = enq.is_void ? 'un-void' : 'void';
    const confirmed = await new Promise(resolve => {
        showModal(
            enq.is_void ? 'Restore Enquiry' : 'Mark Enquiry as Void',
            enq.is_void
                ? `Are you sure you want to <strong>restore</strong> enquiry <strong>${enq.enquiry_number}</strong>? It will become active again.`
                : `Are you sure you want to mark enquiry <strong>${enq.enquiry_number}</strong> as <strong>VOID</strong>? It will be deemed cancelled / null.`,
            enq.is_void ? 'info' : 'warning',
            () => resolve(true)
        );
        // If user closes without confirming
        setTimeout(() => resolve(false), 30000);
    });

    if (!confirmed) return;

    const token = localStorage.getItem('token') || '';
    try {
        const res = await fetch(`${CONFIG.API_URL}/api/enquiry/${enquiryId}/void`, {
            method: 'PATCH',
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            showModal('Error', err.detail || 'Could not update enquiry.', 'error');
            return;
        }
        const updated = await res.json();
        // Update local cache
        const idx = enquiries.findIndex(e => e.id === enquiryId);
        if (idx !== -1) enquiries[idx] = updated;

        // Refresh the current view
        updateAllEnquiriesTable(currentAllEnquiriesFilter);
        updateDashboardTable();

        showModal(
            updated.is_void ? 'Enquiry Voided' : 'Enquiry Restored',
            updated.is_void
                ? `Enquiry <strong>${updated.enquiry_number}</strong> has been marked as <strong>VOID</strong> and deemed cancelled.`
                : `Enquiry <strong>${updated.enquiry_number}</strong> has been <strong>restored</strong> and is now active again.`,
            updated.is_void ? 'warning' : 'success'
        );
    } catch (err) {
        showModal('Network Error', err.message, 'error');
    }
};
