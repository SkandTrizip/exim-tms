// Main Dashboard Logic
let enquiries = [];
let PAGE_SIZE = 10;
const paginationState = {
    allEnquiries: { currentPage: 1 },
    quotes: { currentPage: 1 },
    tracking: { currentPage: 1 },
    finance: { currentPage: 1 },
    analyticsDetails: { currentPage: 1 },
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
            if (expanded) {
                analyticsDetailsBtn.setAttribute('aria-expanded', 'false');
                analyticsDetailsPanel.hidden = true;
                return;
            }
            openAnalyticsDetailsPanel({ statusFilter: 'all' });
        });
    }

    applyAnalyticsDateRangePreset('this_month', { fetch: false });

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

function isTrackingMilestoneDone(status, field) {
    if (!status || !field) return false;
    const val = status[field];
    return val != null && val !== '' && val !== false;
}

function isTrackingCompleted(status) {
    return isTrackingMilestoneDone(status, 'sob');
}

/** Map legacy milestone filters (booking/SI/BL/SOB) to pending | completed. */
function isBookingCancelledStatus(status) {
    return !!(status && status.booking_cancelled_at);
}

function normalizeTrackingSection(section) {
    if (section === 'completed') return 'completed';
    if (section === 'cancelled') return 'cancelled';
    return 'pending';
}

function matchesTrackingSection(section, status) {
    const cancelled = isBookingCancelledStatus(status);
    const key = normalizeTrackingSection(section);
    if (key === 'cancelled') return cancelled;
    if (cancelled) return false;
    const done = isTrackingCompleted(status);
    return key === 'completed' ? done : !done;
}

const STATUS_SECTION_LABELS = {
    sales: {
        pending_pricing: 'Pending at Pricing',
        pending_confirmation: 'Pending Confirmation',
        all: 'All Enquiries'
    },
    tracking: {
        pending: 'Not Completed',
        completed: 'Completed',
        cancelled: 'Cancelled',
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

function renderRowActionsMenu(e, extraItemsHtml = '', quoteStatus = null, status = null) {
    return `
        <div class="actions-dropdown">
            <button class="row-actions-btn actions-btn" type="button" title="Actions" aria-label="Actions">
                <i class="fas fa-ellipsis-vertical"></i>
            </button>
            <div class="actions-menu">
                ${extraItemsHtml}
                ${renderEnquiryActions(e, quoteStatus, status)}
            </div>
        </div>`;
}

function renderListTableRow(e, status = null, options = {}) {
    const {
        statusHtml = statusBadge(e, status),
        extraActionsHtml = '',
        quoteStatus = null,
        actionHtml = null,
        compact = false,
        detailsExtraHtml = ''
    } = options;

    if (compact) {
        const opacity = e.is_void ? ' style="opacity:0.55"' : '';
        return `
            <tr class="list-row"${opacity}>
                <td class="job-no-cell"><a class="cell-enquiry-id" href="#" onclick="openActionModal('view-sale', ${e.id}); return false;">${escapeHtml(e.enquiry_number)}</a></td>
                <td>${escapeHtml(e.client_name || '—')}</td>
                <td>${escapeHtml(e.origin)} → ${escapeHtml(e.destination)}</td>
                <td>${statusHtml}</td>
                <td>${actionHtml || renderRowActionsMenu(e, extraActionsHtml, quoteStatus, status)}</td>
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
                    ${detailsExtraHtml}
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
            <td data-col="action">${actionHtml || renderRowActionsMenu(e, extraActionsHtml, quoteStatus, status)}</td>
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
        const isAdditional = e && e.__finance_invoice_kind === 'additional';
        const bookingCancelled = !!(e && e.__finance_booking_cancelled);
        const additionalOpts = isAdditional
            ? { item_type: 'additional', additional_doc_id: e.__finance_additional_doc_id || null }
            : (e.__finance_currency_mode
                ? { currency_mode: e.__finance_currency_mode }
                : null);
        if (isCompleted || e.invoice_complete) {
            return renderFinanceDrawerActionBtn('finance-invoice', e.id, { primary: false, icon: 'check-circle', label: 'View', title: 'View recorded invoice' }, additionalOpts);
        }
        if (bookingCancelled || isAdditional) {
            if (!isAdditional) {
                return `<button class="btn btn-secondary table-tool-btn finance-row-action-btn" type="button" disabled title="Upload an additional invoice in Tracking first"><i class="fas fa-clock"></i> Awaiting charge upload</button>`;
            }
            return renderFinanceDrawerActionBtn('finance-invoice', e.id, { icon: 'file-invoice', label: 'Invoice', title: 'Create additional client invoice' }, additionalOpts);
        }
        return e.bl_received
            ? renderFinanceDrawerActionBtn('finance-invoice', e.id, { icon: 'file-invoice', label: 'Invoice', title: 'Create client invoice' }, additionalOpts)
            : `<button class="btn btn-secondary table-tool-btn finance-row-action-btn" type="button" disabled title="Wait for BL Received status"><i class="fas fa-clock"></i> Awaiting BL</button>`;
    }
    return renderFinanceDrawerActionBtn('finance-payment', e.id, { icon: 'coins', label: 'Record', title: 'Record client payment' });
}

function renderFinanceDrawerActionBtn(mode, id, { primary = true, icon, label, title } = {}, modalOptions = null) {
    const btnClass = primary ? 'btn-primary' : 'btn-secondary';
    const optsEncoded = modalOptions ? btoa(unescape(encodeURIComponent(JSON.stringify(modalOptions)))) : '';
    const onclick = optsEncoded
        ? `openActionModal('${mode}', ${id}, null, '${optsEncoded}')`
        : `openActionModal('${mode}', ${id})`;
    return `<button type="button" class="btn ${btnClass} table-tool-btn finance-row-action-btn" onclick="${onclick}" title="${escapeAttr(title || label)}"><i class="fas fa-${icon}"></i> ${escapeHtml(label)}</button>`;
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
        const remarkHtml = renderFinanceInvoiceRemark(e);
        if (isCompleted || e.invoice_complete) {
            return `<span class="badge badge-completed"><i class="fas fa-check-circle"></i> Invoice Complete</span>${remarkHtml}`;
        }
        return e.bl_received
            ? `<span class="badge badge-pending"><i class="fas fa-clock"></i> IRN / Invoice Pending</span>${remarkHtml}`
            : `<span class="badge badge-pending"><i class="fas fa-clock"></i> Awaiting BL</span>${remarkHtml}`;
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
    if (view === 'tracking' && shouldBypassTrackingSectionFilter()) {
        labelEl.textContent = 'All sections (search)';
        return;
    }
    if (view === 'sales' && shouldBypassSalesSectionFilter()) {
        labelEl.textContent = 'All enquiries (search)';
        return;
    }
    labelEl.textContent = labels[section] || section || 'All';
}

function shouldBypassTrackingSectionFilter() {
    const table = document.getElementById('trackingDataTable');
    return typeof window.isListTableSearchBypassActive === 'function'
        && window.isListTableSearchBypassActive(table);
}

function shouldBypassSalesSectionFilter() {
    const table = document.getElementById('enquiriesDataTable');
    return typeof window.isListTableSearchBypassActive === 'function'
        && window.isListTableSearchBypassActive(table);
}

function countSalesSection(section) {
    const active = enquiries.filter((e) => !e.is_void);
    if (section === 'pending_pricing') return active.filter((e) => (e.stage || 1) <= 1).length;
    if (section === 'pending_confirmation') return active.filter((e) => e.stage === 2).length;
    return active.length;
}

function countTrackingSection(section) {
    const ops = enquiries.filter((e) => isTrackingListEnquiry(e));
    return ops.filter((e) => {
        const s = cachedBulkStatus[e.id] || null;
        return matchesTrackingSection(section, s);
    }).length;
}

function isTrackingListEnquiry(e) {
    return !!(e && !e.is_void && (e.stage || 1) >= 3);
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

async function fetchFinanceInvoicingTypesCache() {
    const ops = enquiries.filter((e) => e.stage >= 3 && !e.is_void);
    const ids = ops.map((e) => e.id);
    if (!ids.length) {
        window._financeInvoicingTypeByEnquiry = {};
        return {};
    }
    try {
        const res = await fetch(`${CONFIG.API_URL}/api/client/invoicing-types-by-enquiry`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enquiry_ids: ids }),
        });
        window._financeInvoicingTypeByEnquiry = res.ok ? await res.json() : {};
    } catch (e) {
        console.error('fetchFinanceInvoicingTypesCache:', e);
        window._financeInvoicingTypeByEnquiry = {};
    }
    return window._financeInvoicingTypeByEnquiry || {};
}

function getCustomerInvoicingType(enquiryId) {
    const map = window._financeInvoicingTypeByEnquiry || {};
    return map[enquiryId] || map[String(enquiryId)] || 'standard';
}

function isDualInvoicingEnquiry(enquiryId) {
    return getCustomerInvoicingType(enquiryId) === 'dual_usd_inr';
}

function getMainInvoiceForEnquiry(enquiryId, currencyMode) {
    const byMode = (window._financeMainInvoicesByEnquiryMode || {})[enquiryId] || {};
    if (currencyMode === 'usd') return byMode.usd || null;
    if (currencyMode === 'inr') return byMode.inr || null;
    return getInvoiceForEnquiry(enquiryId);
}

async function fetchFinanceInvoicesCache() {
    try {
        await fetchFinanceInvoicingTypesCache();
        const res = await fetch(`${CONFIG.API_URL}/api/invoice/list`);
        if (!res.ok) return window._financeInvoiceByEnquiry || {};
        const payload = await res.json();
        if (!Array.isArray(payload)) return window._financeInvoiceByEnquiry || {};
        window._financeInvoicesList = payload;
        const byEnquiry = {};
        const mainByEnquiryMode = {};
        const additionalByEnquiryDoc = {};
        for (const inv of payload) {
            if (inv.enquiry_id == null) continue;
            const it = String(inv.item_type || 'all').toLowerCase();
            if (it === 'additional') {
                const docId = inv.additional_doc_id != null ? String(inv.additional_doc_id) : '';
                if (!additionalByEnquiryDoc[inv.enquiry_id]) additionalByEnquiryDoc[inv.enquiry_id] = {};
                if (docId) additionalByEnquiryDoc[inv.enquiry_id][docId] = inv;
                continue;
            }
            // main invoice (all/main)
            byEnquiry[inv.enquiry_id] = inv;
            const cm = String(inv.currency_mode || 'inr').toLowerCase() === 'usd' ? 'usd' : 'inr';
            if (!mainByEnquiryMode[inv.enquiry_id]) mainByEnquiryMode[inv.enquiry_id] = {};
            mainByEnquiryMode[inv.enquiry_id][cm] = inv;
        }
        window._financeInvoiceByEnquiry = byEnquiry;
        window._financeMainInvoicesByEnquiryMode = mainByEnquiryMode;
        window._financeAdditionalInvoiceByEnquiryDoc = additionalByEnquiryDoc;
        return byEnquiry;
    } catch (e) {
        console.error('fetchFinanceInvoicesCache:', e);
        return window._financeInvoiceByEnquiry || {};
    }
}

function getInvoiceForEnquiry(enquiryId) {
    return (window._financeInvoiceByEnquiry || {})[enquiryId] || null;
}

function getAdditionalInvoiceForEnquiryDoc(enquiryId, docId) {
    const map = window._financeAdditionalInvoiceByEnquiryDoc || {};
    const byDoc = map[enquiryId] || {};
    return byDoc[String(docId)] || null;
}

function getFinanceInvoiceKindLabel(kind, currencyMode) {
    if (kind === 'additional') return 'Additional invoice';
    if (kind === 'main') {
        if (currencyMode === 'usd') return 'USD invoice';
        if (currencyMode === 'inr') return 'INR invoice';
        return 'Main invoice';
    }
    return '';
}

function renderFinanceInvoiceTypeBadge(e) {
    const label = getFinanceInvoiceKindLabel(e && e.__finance_invoice_kind, e && e.__finance_currency_mode);
    if (!label) return '';
    const isAdditional = e.__finance_invoice_kind === 'additional';
    const isUsd = e.__finance_currency_mode === 'usd';
    const bg = isAdditional ? '#ede9fe' : (isUsd ? '#fef3c7' : '#e0f2fe');
    const color = isAdditional ? '#6d28d9' : (isUsd ? '#b45309' : '#0369a1');
    return `<span class="finance-invoice-type-badge" style="display:inline-block;margin-top:6px;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;background:${bg};color:${color};">${escapeHtml(label)}</span>`;
}

function renderFinanceInvoiceRemark(e) {
    const label = (e && e.__finance_remark) || getFinanceInvoiceKindLabel(e && e.__finance_invoice_kind, e && e.__finance_currency_mode);
    if (!label) return '';
    return `<div class="cell-muted" style="margin-top:4px;font-size:12px;">Remark: ${escapeHtml(label)}</div>`;
}

function buildFinanceInvoiceTaskRows(operationalEnquiries, bulkStatus, additionalInvBulk, completionTab) {
    const showCompleted = completionTab === 'completed';
    const rows = [];

    for (const e of operationalEnquiries) {
        const s = bulkStatus[e.id] || null;
        if (!s) continue;

        const bookingCancelled = !!s.booking_cancelled_at;
        if (!bookingCancelled && (!s.shipping_invoice || !s.bl_received)) continue;

        const base = {
            ...e,
            bl_received: !!s.bl_received,
            payment_done: isShippingLinePaymentDone(s),
            __finance_booking_cancelled: bookingCancelled,
        };

        if (bookingCancelled) {
            if (showCompleted) {
                const allInvoices = window._financeInvoicesList || [];
                for (const inv of allInvoices) {
                    if (inv.enquiry_id !== e.id) continue;
                    if (String(inv.item_type || '').toLowerCase() !== 'additional') continue;
                    if (!isInvoiceCreateCompleted(inv)) continue;
                    rows.push({
                        ...base,
                        __finance_invoice_kind: 'additional',
                        __finance_additional_doc_id: inv.additional_doc_id || null,
                        __finance_remark: inv.remark || 'Additional invoice (booking cancelled)',
                        invoice_complete: true,
                    });
                }
            } else {
                const docs = (additionalInvBulk && (additionalInvBulk[String(e.id)] || additionalInvBulk[e.id])) || [];
                for (const doc of docs) {
                    if (!doc || !doc.id) continue;
                    const addInv = getAdditionalInvoiceForEnquiryDoc(e.id, doc.id);
                    const addComplete = isInvoiceCreateCompleted(addInv);
                    if (addComplete) continue;
                    rows.push({
                        ...base,
                        __finance_invoice_kind: 'additional',
                        __finance_additional_doc_id: doc.id,
                        __finance_remark: 'Additional invoice (booking cancelled)',
                        invoice_complete: false,
                    });
                }
            }
            continue;
        }

        if (isDualInvoicingEnquiry(e.id)) {
            for (const mode of ['usd', 'inr']) {
                const mainInv = getMainInvoiceForEnquiry(e.id, mode);
                const mainComplete = isInvoiceCreateCompleted(mainInv);
                if (showCompleted ? mainComplete : !mainComplete) {
                    rows.push({
                        ...base,
                        __finance_invoice_kind: 'main',
                        __finance_currency_mode: mode,
                        __finance_remark: mode === 'usd'
                            ? 'USD invoice (USD charge lines)'
                            : 'INR invoice (INR charge lines)',
                        invoice_complete: mainComplete,
                    });
                }
            }
        } else {
            const mainInv = getInvoiceForEnquiry(e.id);
            const mainComplete = isInvoiceCreateCompleted(mainInv);
            if (showCompleted ? mainComplete : !mainComplete) {
                rows.push({
                    ...base,
                    __finance_invoice_kind: 'main',
                    __finance_remark: 'Main invoice',
                    invoice_complete: mainComplete,
                });
            }
        }

        if (showCompleted) {
            const allInvoices = window._financeInvoicesList || [];
            for (const inv of allInvoices) {
                if (inv.enquiry_id !== e.id) continue;
                if (String(inv.item_type || '').toLowerCase() !== 'additional') continue;
                if (!isInvoiceCreateCompleted(inv)) continue;
                rows.push({
                    ...base,
                    __finance_invoice_kind: 'additional',
                    __finance_additional_doc_id: inv.additional_doc_id || null,
                    __finance_remark: inv.remark || 'Additional invoice',
                    invoice_complete: true,
                });
            }
        } else {
            const docs = (additionalInvBulk && (additionalInvBulk[String(e.id)] || additionalInvBulk[e.id])) || [];
            for (const doc of docs) {
                if (!doc || !doc.id) continue;
                const addInv = getAdditionalInvoiceForEnquiryDoc(e.id, doc.id);
                const addComplete = isInvoiceCreateCompleted(addInv);
                if (addComplete) continue;
                rows.push({
                    ...base,
                    __finance_invoice_kind: 'additional',
                    __finance_additional_doc_id: doc.id,
                    __finance_remark: 'Additional invoice',
                    invoice_complete: false,
                });
            }
        }
    }

    return rows;
}

function countFinanceInvoiceTasks(completionTab) {
    const ops = enquiries.filter((e) => e.stage >= 3 && !e.is_void);
    const showCompleted = completionTab === 'completed';
    const docsByEnquiry = window._additionalInvoiceDocsByEnquiry || {};
    let count = 0;

    for (const e of ops) {
        const s = cachedBulkStatus[e.id];
        if (!s) continue;

        const bookingCancelled = !!s.booking_cancelled_at;
        if (!bookingCancelled && (!s.shipping_invoice || !s.bl_received)) continue;

        if (bookingCancelled) {
            const docs = docsByEnquiry[String(e.id)] || docsByEnquiry[e.id] || [];
            for (const doc of docs) {
                if (!doc || !doc.id) continue;
                const addInv = getAdditionalInvoiceForEnquiryDoc(e.id, doc.id);
                if (showCompleted ? isInvoiceCreateCompleted(addInv) : !isInvoiceCreateCompleted(addInv)) {
                    count += 1;
                }
            }
            continue;
        }

        if (isDualInvoicingEnquiry(e.id)) {
            for (const mode of ['usd', 'inr']) {
                const mainComplete = isInvoiceCreateCompleted(getMainInvoiceForEnquiry(e.id, mode));
                if (showCompleted ? mainComplete : !mainComplete) count += 1;
            }
        } else {
            const mainComplete = isInvoiceCreateCompleted(getInvoiceForEnquiry(e.id));
            if (showCompleted ? mainComplete : !mainComplete) count += 1;
        }

        if (showCompleted) {
            const allInvoices = window._financeInvoicesList || [];
            for (const inv of allInvoices) {
                if (inv.enquiry_id !== e.id) continue;
                if (String(inv.item_type || '').toLowerCase() !== 'additional') continue;
                if (!isInvoiceCreateCompleted(inv)) continue;
                count += 1;
            }
        } else {
            const docs = docsByEnquiry[String(e.id)] || docsByEnquiry[e.id] || [];
            for (const doc of docs) {
                if (!doc || !doc.id) continue;
                const addInv = getAdditionalInvoiceForEnquiryDoc(e.id, doc.id);
                if (!isInvoiceCreateCompleted(addInv)) count += 1;
            }
        }
    }

    return count;
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
        return countFinanceInvoiceTasks(completionTab);
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
        ['pending', 'completed', 'cancelled'].forEach((section) => {
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
    const ids = enquiries.filter((e) => isTrackingListEnquiry(e)).map((e) => e.id);
    cachedBulkStatus = ids.length ? await fetchBulkStatus(ids) : {};
    updateStatusSectionCounts();
    updateFinanceCompletionCounts();
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
                currentTrackingFilter = normalizeTrackingSection(section);
                updateTrackingTable(currentTrackingFilter);
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
            const table = tableId ? document.getElementById(tableId) : null;
            const bypassTables = new Set(['trackingDataTable', 'enquiriesDataTable', 'analyticsDetailsDataTable']);
            if (table && bypassTables.has(table.id)) {
                clearTimeout(listTableSearchTimers[tbodyId]);
                listTableSearchTimers[tbodyId] = setTimeout(() => {
                    if (tbodyId === 'trackingTable') {
                        paginationState.tracking.currentPage = 1;
                        updateTrackingTable(currentTrackingFilter);
                    } else if (tbodyId === 'allEnquiriesTable') {
                        paginationState.allEnquiries.currentPage = 1;
                        updateAllEnquiriesTable(currentAllEnquiriesFilter);
                    } else if (tbodyId === 'analyticsEnquiryTable') {
                        analyticsDetailsState.search = (input.value || '').trim().toLowerCase();
                        paginationState.analyticsDetails.currentPage = 1;
                        renderAnalyticsDetailsTable();
                    }
                }, LIST_TABLE_SEARCH_DEBOUNCE_MS);
                return;
            }
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
    // 100 lac = 1 crore
    if (abs > 10000000) {
        return `₹${(n / 10000000).toFixed(2)} Cr`;
    }
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

function formatSobDate(iso) {
    if (!iso) return '—';
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return escapeHtml(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
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

const analyticsFilterState = {
    fy: '',
    monthFrom: '',
    monthTo: '',
    metric: 'gross_margin',
    clientNames: [],
    containerType: '',
    dateRange: 'this_month',
    viewBy: 'month',
};

let analyticsClientLookupTimer = null;
let analyticsClientLookupResults = [];
let lastAnalyticsPayload = null;

let analyticsAvailableMonths = [];
let analyticsAvailableYears = [];
const analyticsDetailsState = {
    rows: [],
    search: '',
    statusFilter: 'all',
    pageSize: 20,
    viewMode: 'trips',
};

function currentAnalyticsFyValue() {
    const now = new Date();
    const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${y}-${String(y + 1).slice(-2)}`;
}

function analyticsMonthKeyFromDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function analyticsStartOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function analyticsAddMonths(date, delta) {
    return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function analyticsCalendarQuarterStart(date) {
    const q = Math.floor(date.getMonth() / 3);
    return new Date(date.getFullYear(), q * 3, 1);
}

function analyticsEnsureFyForMonthKey(monthKey) {
    if (!monthKey) return;
    const [y, m] = monthKey.split('-').map(Number);
    if (!y || !m) return;
    const fyStart = m >= 4 ? y : y - 1;
    analyticsFilterState.fy = `${fyStart}-${String(fyStart + 1).slice(-2)}`;
}

function applyAnalyticsDateRangePreset(preset, { fetch = true } = {}) {
    const now = new Date();
    analyticsFilterState.dateRange = preset || 'this_month';

    if (preset === 'this_year') {
        analyticsFilterState.fy = currentAnalyticsFyValue();
        analyticsFilterState.monthFrom = '';
        analyticsFilterState.monthTo = '';
    } else if (preset === 'custom') {
        // Keep month_from / month_to; user adjusts in the panel.
    } else {
        let fromDate = analyticsStartOfMonth(now);
        let toDate = analyticsStartOfMonth(now);

        if (preset === 'last_month') {
            fromDate = analyticsAddMonths(fromDate, -1);
            toDate = fromDate;
        } else if (preset === 'last_3_months') {
            fromDate = analyticsAddMonths(toDate, -2);
        } else if (preset === 'this_quarter') {
            fromDate = analyticsCalendarQuarterStart(now);
        } else if (preset === 'last_quarter') {
            const thisQuarterStart = analyticsCalendarQuarterStart(now);
            const lastQuarterEnd = analyticsAddMonths(thisQuarterStart, -1);
            fromDate = analyticsCalendarQuarterStart(lastQuarterEnd);
            toDate = lastQuarterEnd;
        }

        analyticsFilterState.monthFrom = analyticsMonthKeyFromDate(fromDate);
        analyticsFilterState.monthTo = analyticsMonthKeyFromDate(toDate);
        analyticsEnsureFyForMonthKey(analyticsFilterState.monthTo || analyticsFilterState.monthFrom);
    }

    updateAnalyticsViewByOptions();
    updateAnalyticsFiltersUi();

    const fromSelect = document.getElementById('analyticsMonthFromFilter');
    const toSelect = document.getElementById('analyticsMonthToFilter');
    if (fromSelect) fromSelect.value = analyticsFilterState.monthFrom || '';
    if (toSelect) toSelect.value = analyticsFilterState.monthTo || '';

    if (fetch) {
        fetchDashboardAnalytics();
    }
}

function updateAnalyticsViewByOptions() {
    const range = analyticsFilterState.dateRange || 'this_month';
    const allowDayWeek = ['this_month', 'last_month', 'last_3_months', 'custom'].includes(range);
    document.querySelectorAll('[data-view-by]').forEach((btn) => {
        const mode = btn.dataset.viewBy;
        const show = mode === 'month' || allowDayWeek;
        btn.hidden = !show;
        if (!show && btn.classList.contains('is-active')) {
            btn.classList.remove('is-active');
            const monthBtn = document.querySelector('[data-view-by="month"]');
            if (monthBtn) monthBtn.classList.add('is-active');
            analyticsFilterState.viewBy = 'month';
        }
    });
}

function countActiveAnalyticsFilters() {
    let count = 0;
    if ((analyticsFilterState.clientNames || []).length) count += 1;
    if (analyticsFilterState.containerType) count += 1;
    if (analyticsFilterState.dateRange && analyticsFilterState.dateRange !== 'this_month') count += 1;
    return count;
}

function syncAnalyticsFiltersPanelUi() {
    const toggle = document.getElementById('analyticsFiltersToggle');
    const panel = document.getElementById('analyticsCommandPanel');
    const commandBar = document.getElementById('analyticsCommandBar');
    const section = document.querySelector('.biz-analytics');
    const isOpen = !!(toggle && toggle.getAttribute('aria-expanded') === 'true' && panel && !panel.hidden);
    if (commandBar) {
        commandBar.classList.toggle('is-panel-open', isOpen);
    }
    if (section) {
        section.classList.toggle('is-filters-open', isOpen);
    }
}

function updateAnalyticsFiltersUi() {
    const count = countActiveAnalyticsFilters();
    const countEl = document.getElementById('analyticsFiltersCount');
    const toggle = document.getElementById('analyticsFiltersToggle');
    if (countEl) {
        if (count > 0) {
            countEl.hidden = false;
            countEl.textContent = String(count);
        } else {
            countEl.hidden = true;
        }
    }
    if (toggle) {
        toggle.classList.toggle('is-active-filters', count > 0);
    }

    const dateSelect = document.getElementById('analyticsDateRangeSelect');
    if (dateSelect && dateSelect.value !== analyticsFilterState.dateRange) {
        dateSelect.value = analyticsFilterState.dateRange;
    }

    const containerSelect = document.getElementById('analyticsContainerTypeFilter');
    if (containerSelect && containerSelect.value !== (analyticsFilterState.containerType || '')) {
        containerSelect.value = analyticsFilterState.containerType || '';
    }

    document.querySelectorAll('[data-view-by]').forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.viewBy === analyticsFilterState.viewBy);
    });

    syncAnalyticsFiltersPanelUi();
}

function populateAnalyticsContainerTypeFilter() {
    const select = document.getElementById('analyticsContainerTypeFilter');
    if (!select || select.dataset.populated) return;
    const types = (typeof CONFIG !== 'undefined' && Array.isArray(CONFIG.containerTypes))
        ? CONFIG.containerTypes
        : [];
    types.forEach((type) => {
        const opt = document.createElement('option');
        opt.value = type;
        opt.textContent = type;
        select.appendChild(opt);
    });
    select.dataset.populated = '1';
}

function analyticsWeekStartKey(isoDate) {
    if (!isoDate) return '';
    const d = new Date(`${isoDate.slice(0, 10)}T00:00:00`);
    if (Number.isNaN(d.getTime())) return '';
    const day = d.getDay();
    const diff = (day + 6) % 7;
    d.setDate(d.getDate() - diff);
    return analyticsMonthKeyFromDate(d);
}

function analyticsShortMonthLabel(monthKey) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const [y, m] = (monthKey || '').split('-').map(Number);
    if (!y || !m) return monthKey || '';
    return months[m - 1] || monthKey;
}

function aggregateAnalyticsChartSeries(rows, viewBy) {
    const buckets = new Map();
    const upsert = (key, label, shortLabel, row) => {
        if (!key) return;
        if (!buckets.has(key)) {
            buckets.set(key, {
                month: key,
                label,
                short_label: shortLabel,
                trips: 0,
                cost_inr: 0,
                revenue_inr: 0,
                capture_inr: 0,
                teu: 0,
                containers: 0,
            });
        }
        const bucket = buckets.get(key);
        bucket.cost_inr += Number(row.cost_inr) || 0;
        bucket.revenue_inr += Number(row.revenue_inr) || 0;
        bucket.capture_inr += Number(row.capture_inr) || 0;
        if (row.row_kind !== 'additional') {
            bucket.trips += 1;
            bucket.teu += Number(row.teu) || 0;
            bucket.containers += Number(row.container_count) || 0;
        }
    };

    (rows || []).forEach((row) => {
        const iso = row.si_date || row.sob_date;
        if (!iso) return;
        if (viewBy === 'day') {
            const key = iso.slice(0, 10);
            upsert(key, key, key.slice(5), row);
            return;
        }
        if (viewBy === 'week') {
            const key = analyticsWeekStartKey(iso);
            const label = key ? `Week of ${analyticsShortMonthLabel(key)} ${key.slice(8, 10)}` : '';
            upsert(key, label, label, row);
            return;
        }
        const key = row.si_month || iso.slice(0, 7);
        const short = analyticsShortMonthLabel(key);
        upsert(key, key, short, row);
    });

    return Array.from(buckets.values())
        .map((b) => {
            const cost = Math.round(b.cost_inr * 100) / 100;
            const revenue = Math.round(b.revenue_inr * 100) / 100;
            const capture = Math.round(b.capture_inr * 100) / 100;
            const marginPct = revenue > 0 ? Math.round(((capture / revenue) * 100) * 100) / 100 : null;
            return {
                ...b,
                cost_inr: cost,
                revenue_inr: revenue,
                capture_inr: capture,
                margin_pct: marginPct,
            };
        })
        .sort((a, b) => String(a.month).localeCompare(String(b.month)));
}

function getAnalyticsChartSeries() {
    if (!lastAnalyticsPayload) return [];
    const summary = lastAnalyticsPayload.summary || {};
    const ongoing = summary.ongoing || {};
    const includeOngoing = !!ongoing.included_in_gross;

    if (analyticsFilterState.viewBy === 'month') {
        const series = Array.isArray(lastAnalyticsPayload.monthly_series)
            ? lastAnalyticsPayload.monthly_series
            : [];
        return filterSeriesByMonthRange(
            series,
            analyticsFilterState.monthFrom,
            analyticsFilterState.monthTo,
            analyticsAvailableMonths,
        );
    }

    const rows = []
        .concat(Array.isArray(lastAnalyticsPayload.enquiries) ? lastAnalyticsPayload.enquiries : [])
        .concat(Array.isArray(lastAnalyticsPayload.ongoing_enquiries) ? lastAnalyticsPayload.ongoing_enquiries : []);
    return aggregateAnalyticsChartSeries(rows, analyticsFilterState.viewBy);
}

function rerenderAnalyticsChartFromCache() {
    if (!lastAnalyticsPayload) return;
    const summary = lastAnalyticsPayload.summary || {};
    const ongoing = summary.ongoing || {};
    const includeOngoing = !!ongoing.included_in_gross;
    const chartSeries = getAnalyticsChartSeries();
    renderMonthlyAnalyticsChart(chartSeries, analyticsFilterState.metric, {
        pipelineMargin: includeOngoing && analyticsFilterState.viewBy === 'month'
            ? (ongoing.capture_inr || 0)
            : 0,
        pipelineTrips: includeOngoing && analyticsFilterState.viewBy === 'month'
            ? (ongoing.trips || 0)
            : 0,
    });
}

function resetAnalyticsFilters() {
    analyticsFilterState.clientNames = [];
    analyticsFilterState.containerType = '';
    analyticsFilterState.viewBy = 'month';
    analyticsFilterState.metric = 'gross_margin';
    updateAnalyticsClientFilterUi({ activeName: '' });
    const metricSelect = document.getElementById('analyticsMetricFilter');
    if (metricSelect) metricSelect.value = 'gross_margin';
    applyAnalyticsDateRangePreset('this_month');
}

function bindAnalyticsCommandBar() {
    populateAnalyticsContainerTypeFilter();

    const dateSelect = document.getElementById('analyticsDateRangeSelect');
    if (dateSelect && !dateSelect.dataset.bound) {
        dateSelect.dataset.bound = '1';
        dateSelect.addEventListener('change', () => {
            const preset = dateSelect.value || 'this_month';
            if (preset === 'custom') {
                analyticsFilterState.dateRange = 'custom';
                const panel = document.getElementById('analyticsCommandPanel');
                const toggle = document.getElementById('analyticsFiltersToggle');
                if (panel) panel.hidden = false;
                if (toggle) {
                    toggle.classList.add('is-open');
                    toggle.setAttribute('aria-expanded', 'true');
                }
                updateAnalyticsViewByOptions();
                syncAnalyticsFiltersPanelUi();
                updateAnalyticsFiltersUi();
                return;
            }
            applyAnalyticsDateRangePreset(preset);
        });
    }

    document.querySelectorAll('[data-view-by]').forEach((btn) => {
        if (btn.dataset.bound) return;
        btn.dataset.bound = '1';
        btn.addEventListener('click', () => {
            analyticsFilterState.viewBy = btn.dataset.viewBy || 'month';
            updateAnalyticsFiltersUi();
            rerenderAnalyticsChartFromCache();
        });
    });

    const toggle = document.getElementById('analyticsFiltersToggle');
    const panel = document.getElementById('analyticsCommandPanel');
    if (toggle && panel && !toggle.dataset.bound) {
        toggle.dataset.bound = '1';
        toggle.addEventListener('click', () => {
            const open = toggle.getAttribute('aria-expanded') === 'true';
            toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
            toggle.classList.toggle('is-open', !open);
            panel.hidden = open;
            syncAnalyticsFiltersPanelUi();
        });
    }

    const refreshBtn = document.getElementById('analyticsCommandRefresh');
    if (refreshBtn && !refreshBtn.dataset.bound) {
        refreshBtn.dataset.bound = '1';
        refreshBtn.addEventListener('click', () => {
            refreshBtn.disabled = true;
            fetchDashboardAnalytics().finally(() => {
                refreshBtn.disabled = false;
            });
        });
    }

    const containerSelect = document.getElementById('analyticsContainerTypeFilter');
    if (containerSelect && !containerSelect.dataset.bound) {
        containerSelect.dataset.bound = '1';
        containerSelect.addEventListener('change', () => {
            analyticsFilterState.containerType = containerSelect.value || '';
            updateAnalyticsFiltersUi();
            fetchDashboardAnalytics();
        });
    }

    const resetBtn = document.getElementById('analyticsResetFilters');
    if (resetBtn && !resetBtn.dataset.bound) {
        resetBtn.dataset.bound = '1';
        resetBtn.addEventListener('click', () => resetAnalyticsFilters());
    }

    updateAnalyticsViewByOptions();
    updateAnalyticsFiltersUi();
}

function openAnalyticsDetailsPanel({ statusFilter = null } = {}) {
    const btn = document.getElementById('analyticsViewDetailsBtn');
    const panel = document.getElementById('analyticsDetailsPanel');
    if (!btn || !panel) return;
    btn.setAttribute('aria-expanded', 'true');
    panel.hidden = false;
    if (statusFilter) {
        setAnalyticsDetailsStatusFilter(statusFilter, { render: false });
    }
    paginationState.analyticsDetails.currentPage = 1;
    renderAnalyticsDetailsTable();
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function buildMarginGaugeSvg(pct) {
    const p = Math.min(100, Math.max(0, Number(pct) || 0));
    const r = 34;
    const c = 2 * Math.PI * r;
    const offset = c - (p / 100) * c;
    return `<svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="8" /><circle cx="40" cy="40" r="${r}" fill="none" stroke="#f97316" stroke-width="8" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" stroke-linecap="round" transform="rotate(-90 40 40)" /></svg>`;
}

function renderAnalyticsSummary(summary) {
    const completed = summary.total_enquiries ?? 0;
    const active = (summary.ongoing && summary.ongoing.trips) ? summary.ongoing.trips : 0;
    const total = completed + active;
    const marginPct = summary.margin_pct;
    const marginClass = analyticsValueClass(marginPct);

    setText('analyticsTripsBadge', `${total} Total`);
    setText('analyticsTripsValue', String(total));
    setText('analyticsTripsActive', String(active));
    setText('analyticsTripsCompleted', String(completed));
    setText('analyticsRecordsBadge', `${total} Records`);

    setText('analyticsRevenue', formatInrLakhs(summary.total_revenue_inr));
    setText('analyticsGrossRevenue', formatInrLakhs(summary.gross_revenue_inr));
    setText('analyticsCost', formatInrLakhs(summary.total_cost_inr));
    setText('analyticsCostMarginPill', `Net Margin: ${formatMarginPct(marginPct, 1)}`);
    setText('analyticsCapture', formatInrLakhs(summary.capture_inr));

    const captureEl = document.getElementById('analyticsCapture');
    if (captureEl) {
        captureEl.classList.remove('positive', 'negative');
        if (marginClass) captureEl.classList.add(marginClass);
    }

    setText('analyticsGrossCost', formatInrLakhs(summary.gross_cost_inr));

    const grossMarginPct = summary.gross_margin_pct;
    const grossMarginClass = analyticsValueClass(grossMarginPct);
    setText('analyticsGrossMargin', formatInrLakhs(summary.gross_margin_inr));
    setText('analyticsGrossMarginPct', formatMarginPct(grossMarginPct, 2));

    const grossMarginEl = document.getElementById('analyticsGrossMargin');
    if (grossMarginEl) {
        grossMarginEl.classList.remove('positive', 'negative');
        if (grossMarginClass) grossMarginEl.classList.add(grossMarginClass);
    }
    const grossMarginPctEl = document.getElementById('analyticsGrossMarginPct');
    if (grossMarginPctEl) {
        grossMarginPctEl.classList.remove('positive', 'negative');
        if (grossMarginClass) grossMarginPctEl.classList.add(grossMarginClass);
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

    const fySub = document.getElementById('analyticsFySubtitle');
    if (fySub) {
        const label = summary.fy_label || summary.filter_fy || 'Financial year';
        const range = summary.fy_range || 'Apr – Mar';
        const from = summary.filter_month_from;
        const to = summary.filter_month_to;
        let monthNote = 'all months';
        if (from || to) {
            monthNote = from && to && from !== to ? `${from} – ${to}` : (from || to);
        }
        fySub.textContent = `${label} · ${range} · ${monthNote} · by SI date (from Jul)`;
    }

    const pendingNote = document.getElementById('analyticsPendingSobNote');
    const ongoing = summary.ongoing;
    if (pendingNote) {
        const showOngoing = ongoing && ongoing.trips > 0 && ongoing.included_in_gross;
        if (showOngoing) {
            pendingNote.hidden = false;
            pendingNote.innerHTML =
                `${ongoing.trips} ongoing enquir${ongoing.trips === 1 ? 'y' : 'ies'} ` +
                `(SI submitted, no final quote) · ` +
                `Capture ${formatInrLakhs(ongoing.capture_inr)}` +
                `<button type="button" class="analytics-pending-note__action" id="analyticsViewOngoingBtn">View list</button>`;
            const viewBtn = document.getElementById('analyticsViewOngoingBtn');
            if (viewBtn) {
                viewBtn.addEventListener('click', () => openAnalyticsDetailsPanel({ statusFilter: 'ongoing' }));
            }
        } else {
            pendingNote.hidden = true;
            pendingNote.textContent = '';
        }
    }
}

function populateAnalyticsFyFilter(years) {
    const select = document.getElementById('analyticsFyFilter');
    if (!select) return;

    const list = Array.isArray(years) && years.length
        ? years
        : [{ value: currentAnalyticsFyValue(), label: `FY ${currentAnalyticsFyValue()}` }];

    if (!analyticsFilterState.fy) {
        analyticsFilterState.fy = currentAnalyticsFyValue();
    }

    const options = list.map((y) => {
        const value = y.value || '';
        const label = y.label || `FY ${value}`;
        return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
    });
    select.innerHTML = options.join('');

    const hasCurrent = list.some((y) => y.value === analyticsFilterState.fy);
    select.value = hasCurrent ? analyticsFilterState.fy : (list[0]?.value || '');
    analyticsFilterState.fy = select.value;
}

function populateAnalyticsMonthRangeFilters(months) {
    const fromSelect = document.getElementById('analyticsMonthFromFilter');
    const toSelect = document.getElementById('analyticsMonthToFilter');
    if (!fromSelect || !toSelect) return;

    const list = Array.isArray(months) ? months : [];
    const fromOptions = ['<option value="">All</option>']
        .concat(list.map((m) => {
            const value = m.value || m.month || '';
            const label = m.label || m.short_label || value;
            return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
        }));
    const toOptions = ['<option value="">All</option>']
        .concat(list.map((m) => {
            const value = m.value || m.month || '';
            const label = m.label || m.short_label || value;
            return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
        }));

    fromSelect.innerHTML = fromOptions.join('');
    toSelect.innerHTML = toOptions.join('');

    const validValues = new Set(list.map((m) => m.value || m.month));
    let monthFrom = analyticsFilterState.monthFrom && validValues.has(analyticsFilterState.monthFrom)
        ? analyticsFilterState.monthFrom
        : '';
    let monthTo = analyticsFilterState.monthTo && validValues.has(analyticsFilterState.monthTo)
        ? analyticsFilterState.monthTo
        : '';
    ({ monthFrom, monthTo } = clampAnalyticsMonthRange(monthFrom, monthTo, list));
    fromSelect.value = monthFrom;
    toSelect.value = monthTo;
    analyticsFilterState.monthFrom = fromSelect.value;
    analyticsFilterState.monthTo = toSelect.value;
}

function monthIndexInFy(monthKey, months) {
    if (!monthKey) return -1;
    return months.findIndex((m) => (m.value || m.month) === monthKey);
}

/** Clamp To so it cannot be before From in FY order (Apr→Mar). */
function clampAnalyticsMonthRange(monthFrom, monthTo, availableMonths) {
    if (!monthFrom || !monthTo) {
        return { monthFrom: monthFrom || '', monthTo: monthTo || '' };
    }
    const startIdx = monthIndexInFy(monthFrom, availableMonths);
    const endIdx = monthIndexInFy(monthTo, availableMonths);
    if (startIdx >= 0 && endIdx >= 0 && endIdx < startIdx) {
        return { monthFrom, monthTo: monthFrom };
    }
    return { monthFrom, monthTo };
}

function filterSeriesByMonthRange(series, monthFrom, monthTo, availableMonths) {
    const rows = Array.isArray(series) ? series : [];
    if (!monthFrom && !monthTo) return rows;

    // One bound only → that single month
    if (monthFrom && !monthTo) {
        return rows.filter((r) => r.month === monthFrom);
    }
    if (monthTo && !monthFrom) {
        return rows.filter((r) => r.month === monthTo);
    }

    const monthKeys = (availableMonths || []).map((m) => m.value || m.month);
    const startIdx = monthIndexInFy(monthFrom, availableMonths);
    const endIdx = monthIndexInFy(monthTo, availableMonths);
    // Unknown keys or backward range → match nothing (do not expand to full FY)
    if (startIdx < 0 || endIdx < 0 || startIdx > endIdx) {
        return [];
    }
    const allowed = new Set(monthKeys.slice(startIdx, endIdx + 1));
    return rows.filter((r) => allowed.has(r.month));
}

function getAnalyticsSliceValue(row, metric) {
    if (metric === 'cost') return Math.max(0, Number(row.cost_inr) || 0);
    if (metric === 'revenue') return Math.max(0, Number(row.revenue_inr) || 0);
    if (metric === 'net_margin' || metric === 'both') {
        return Math.max(0, Number(row.capture_inr) || 0);
    }
    return Math.max(0, Number(row.capture_inr) || 0);
}

function getAnalyticsMetricLabel(metric) {
    if (metric === 'cost') return 'Cost';
    if (metric === 'revenue') return 'Revenue';
    if (metric === 'net_margin' || metric === 'both') return 'Net Margin';
    return 'Gross Margin';
}

const ANALYTICS_PIE_COLORS = [
    '#0284c7', '#059669', '#f59e0b', '#7c3aed', '#dc2626',
    '#0d9488', '#db2777', '#2563eb', '#ca8a04', '#475569',
    '#0891b2', '#4f46e5',
];

function buildAnalyticsPiePath(cx, cy, radius, startAngle, endAngle) {
    const toXY = (angle) => {
        const rad = ((angle - 90) * Math.PI) / 180;
        return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
    };
    const [x1, y1] = toXY(startAngle);
    const [x2, y2] = toXY(endAngle);
    const large = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`;
}

function renderMonthlyAnalyticsChart(series, metric, options = {}) {
    const wrap = document.getElementById('analyticsMonthlyChart');
    if (!wrap) return;

    const rows = Array.isArray(series) ? series : [];
    const metricKey = metric || 'gross_margin';
    const metricLabel = getAnalyticsMetricLabel(metricKey);
    const pipelineMargin = Number(options.pipelineMargin) || 0;
    const showPipeline = metricKey === 'gross_margin' && pipelineMargin > 0;

    // Keep FY month order; only draw pie slices with positive value
    const ordered = rows.map((r, idx) => ({
        label: r.short_label || r.label,
        fullLabel: r.label,
        month: r.month,
        trips: r.trips || 0,
        margin_pct: r.margin_pct,
        value: getAnalyticsSliceValue(r, metricKey),
        color: ANALYTICS_PIE_COLORS[idx % ANALYTICS_PIE_COLORS.length],
        cost_inr: r.cost_inr,
        revenue_inr: r.revenue_inr,
        capture_inr: r.capture_inr,
    }));

    if (showPipeline) {
        ordered.push({
            label: 'Ongoing',
            fullLabel: 'Ongoing (SI submitted, no final quote)',
            month: '__ongoing__',
            trips: options.pipelineTrips || 0,
            value: pipelineMargin,
            color: '#94a3b8',
        });
    }

    const slices = ordered.filter((s) => s.value > 0);
    if (!slices.length) {
        wrap.innerHTML = `<div class="analytics-chart-empty">No ${escapeHtml(metricLabel.toLowerCase())} for this filter yet. Final quotes with SI from Jul onward will appear here.</div>`;
        return;
    }

    const total = slices.reduce((sum, s) => sum + s.value, 0);
    const size = 260;
    const cx = size / 2;
    const cy = size / 2;
    const radius = 108;
    let angle = 0;

    const paths = slices.map((s) => {
        const portion = (s.value / total) * 360;
        const start = angle;
        const end = angle + portion;
        angle = end;
        const d = portion >= 359.999
            ? `M ${cx} ${cy - radius} A ${radius} ${radius} 0 1 1 ${cx - 0.01} ${cy - radius} Z`
            : buildAnalyticsPiePath(cx, cy, radius, start, end);
        const pct = ((s.value / total) * 100).toFixed(1);
        return `<path d="${d}" fill="${s.color}" stroke="#fff" stroke-width="2.5">
            <title>${escapeHtml(s.fullLabel)}: ${formatInrAmount(s.value)} (${pct}%)</title>
        </path>`;
    }).join('');

    // Legend: months with trips, plus ongoing pipeline slice when shown
    const legendMonths = ordered.filter((s) => (s.trips || 0) > 0 || s.month === '__ongoing__');
    const legend = legendMonths.map((s) => {
        const hasValue = s.value > 0;
        const pct = hasValue && total > 0 ? ((s.value / total) * 100).toFixed(1) : '0.0';
        const clickable = s.month === '__ongoing__';
        return `
            <li class="analytics-pie-card${clickable ? ' is-clickable' : ''}"${clickable ? ' data-ongoing-slice="1" tabindex="0" role="button" aria-label="View ongoing enquiries"' : ''}>
                <span class="analytics-pie-swatch" style="background:${s.color}"></span>
                <div class="analytics-pie-card-body">
                    <div class="analytics-pie-card-top">
                        <strong>${escapeHtml(s.label)}</strong>
                        <em>${hasValue ? `${pct}%` : '—'}</em>
                    </div>
                    <div class="analytics-pie-card-meta">
                        ${hasValue ? formatInrLakhs(s.value) : '₹0'} · ${s.trips} trip${s.trips === 1 ? '' : 's'}
                    </div>
                </div>
            </li>`;
    }).join('');

    if (!legendMonths.length) {
        wrap.innerHTML = `<div class="analytics-chart-empty">No trips in this financial year yet.</div>`;
        return;
    }

    wrap.innerHTML = `
        <div class="analytics-pie-layout">
            <div class="analytics-pie-visual">
                <svg viewBox="0 0 ${size} ${size}" class="analytics-pie-svg" role="img" aria-label="${escapeHtml(metricLabel)} by financial year month">
                    ${paths}
                    <circle cx="${cx}" cy="${cy}" r="58" fill="#fff"></circle>
                    <text x="${cx}" y="${cy - 8}" text-anchor="middle" class="analytics-pie-center-label">${escapeHtml(metricLabel)}</text>
                    <text x="${cx}" y="${cy + 14}" text-anchor="middle" class="analytics-pie-center-value">${formatInrLakhs(total)}</text>
                </svg>
            </div>
            <ul class="analytics-pie-legend">${legend}</ul>
        </div>`;

    wrap.querySelectorAll('[data-ongoing-slice]').forEach((el) => {
        const open = () => openAnalyticsDetailsPanel({ statusFilter: 'ongoing' });
        el.addEventListener('click', open);
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                open();
            }
        });
    });
}

function analyticsRowSearchText(row) {
    return [
        row.enquiry_number,
        row.client_name,
        row.origin,
        row.destination,
        row.container_type,
        row.master_number,
        row.route,
        row.economics_status,
        row.item_description,
        row.row_kind,
        row.revenue_inr,
        row.cost_inr,
        row.capture_inr,
    ].map((v) => String(v ?? '').toLowerCase()).join(' ');
}

function getAnalyticsDetailsStatusFilteredRows() {
    const status = analyticsDetailsState.statusFilter || 'all';
    return (analyticsDetailsState.rows || []).filter((row) => {
        if (status === 'final' && row.economics_status !== 'final') return false;
        if (status === 'ongoing' && row.economics_status !== 'ongoing') return false;
        return true;
    });
}

function getAnalyticsDetailsFilteredRows() {
    const q = (analyticsDetailsState.search || '').trim().toLowerCase();
    return getAnalyticsDetailsStatusFilteredRows().filter((row) => {
        if (!q) return true;
        return analyticsRowSearchText(row).includes(q);
    });
}

function buildAnalyticsClientWiseRows(rows) {
    const groups = {};
    (rows || []).forEach((row) => {
        const client = (row.client_name || '—').trim();
        if (!groups[client]) {
            groups[client] = {
                client_name: client,
                trips: 0,
                revenue_inr: 0,
                cost_inr: 0,
                capture_inr: 0,
            };
        }
        if (row.row_kind !== 'additional') {
            groups[client].trips += 1;
        }
        groups[client].revenue_inr += Number(row.revenue_inr || 0);
        groups[client].cost_inr += Number(row.cost_inr || 0);
        groups[client].capture_inr += Number(row.capture_inr || 0);
    });
    return Object.values(groups)
        .map((g) => {
            const revenue = Math.round(g.revenue_inr * 100) / 100;
            const cost = Math.round(g.cost_inr * 100) / 100;
            const capture = Math.round(g.capture_inr * 100) / 100;
            return {
                client_name: g.client_name,
                trips: g.trips,
                revenue_inr: revenue,
                cost_inr: cost,
                capture_inr: capture,
                margin_pct: revenue > 0 ? Math.round(((capture / revenue) * 100) * 100) / 100 : null,
            };
        })
        .sort((a, b) => a.client_name.localeCompare(b.client_name));
}

function clientWiseRowSearchText(row) {
    return [
        row.client_name,
        row.trips,
        row.revenue_inr,
        row.cost_inr,
        row.capture_inr,
        row.margin_pct,
    ]
        .map((v) => String(v ?? '').toLowerCase())
        .join(' ');
}

function getAnalyticsDetailsDisplayRows() {
    if (analyticsDetailsState.viewMode !== 'client_wise') {
        return getAnalyticsDetailsFilteredRows();
    }
    const aggregated = buildAnalyticsClientWiseRows(getAnalyticsDetailsStatusFilteredRows());
    const q = (analyticsDetailsState.search || '').trim().toLowerCase();
    if (!q) return aggregated;
    return aggregated.filter((row) => clientWiseRowSearchText(row).includes(q));
}

function syncAnalyticsDetailsTableHead() {
    const head = document.getElementById('analyticsDetailsTableHead');
    if (!head) return;
    if (analyticsDetailsState.viewMode === 'client_wise') {
        head.innerHTML = `
            <tr>
                <th data-col="client">Client</th>
                <th class="num" data-col="trips">Trips</th>
                <th class="num" data-col="revenue">Revenue</th>
                <th class="num" data-col="cost">Cost</th>
                <th class="num" data-col="margin">Margin</th>
                <th class="num" data-col="margin_pct">Margin %</th>
            </tr>`;
        return;
    }
    head.innerHTML = `
        <tr>
            <th data-col="enquiry">Enquiry No</th>
            <th data-col="client">Client Name</th>
            <th data-col="origin">Origin</th>
            <th data-col="destination">Destination</th>
            <th data-col="container">Container</th>
            <th data-col="head">Head</th>
            <th class="num" data-col="revenue">Revenue</th>
            <th class="num" data-col="cost">Cost</th>
            <th class="num" data-col="margin">Margin</th>
            <th data-col="status">Status</th>
        </tr>`;
}

function setAnalyticsDetailsViewMode(mode) {
    analyticsDetailsState.viewMode = mode === 'client_wise' ? 'client_wise' : 'trips';
    document.querySelectorAll('[data-analytics-mode]').forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.analyticsMode === analyticsDetailsState.viewMode);
    });
    const card = document.getElementById('analyticsDetailsTableCard');
    if (card) {
        card.classList.toggle('is-client-wise', analyticsDetailsState.viewMode === 'client_wise');
    }
    const searchInput = document.getElementById('analyticsDetailsSearchInput');
    if (searchInput) {
        searchInput.placeholder = analyticsDetailsState.viewMode === 'client_wise'
            ? 'Search clients…'
            : 'Search all columns…';
    }
    syncAnalyticsDetailsTableHead();
    paginationState.analyticsDetails.currentPage = 1;
    renderAnalyticsDetailsTable();
}

function analyticsClientNameKey(name) {
    const text = (name || '').trim();
    if (!text) return '';
    if (typeof text.casefold === 'function') {
        return text.casefold();
    }
    return text.toLowerCase();
}

function isAnalyticsClientSelected(name) {
    const key = analyticsClientNameKey(name);
    return (analyticsFilterState.clientNames || []).some((n) => analyticsClientNameKey(n) === key);
}

function analyticsClientFilterLabel() {
    const names = analyticsFilterState.clientNames || [];
    if (!names.length) return '';
    if (names.length === 1) return names[0];
    if (names.length <= 3) return names.join(', ');
    return `${names.slice(0, 2).join(', ')} +${names.length - 2} more`;
}

function renderAnalyticsClientChips() {
    const wrap = document.getElementById('analyticsClientFilterChips');
    if (!wrap) return;
    const names = analyticsFilterState.clientNames || [];
    if (!names.length) {
        wrap.innerHTML = '';
        wrap.hidden = true;
        return;
    }
    wrap.hidden = false;
    wrap.innerHTML = names
        .map(
            (name) => `
        <span class="analytics-client-chip">
            <span class="analytics-client-chip__label">${escapeHtml(name)}</span>
            <button type="button" class="analytics-client-chip__remove" data-client-chip="${encodeURIComponent(name)}" aria-label="Remove ${escapeHtml(name)}">
                <i class="fas fa-xmark" aria-hidden="true"></i>
            </button>
        </span>`,
        )
        .join('');
}

function renderAnalyticsClientLookupList() {
    const list = document.getElementById('analyticsClientFilterList');
    if (!list || !analyticsClientLookupResults.length) return;
    list.innerHTML = analyticsClientLookupResults
        .map((item, idx) => {
            const isAll = !item.client_name;
            const selected = isAll
                ? !(analyticsFilterState.clientNames || []).length
                : isAnalyticsClientSelected(item.client_name);
            const check = selected
                ? '<i class="fas fa-check analytics-client-check" aria-hidden="true"></i>'
                : '<span class="analytics-client-check" aria-hidden="true"></span>';
            return `<li role="option" data-client-idx="${idx}" aria-selected="${selected ? 'true' : 'false'}" class="${selected ? 'is-selected' : ''}">${check}<span>${escapeHtml(item.label)}</span></li>`;
        })
        .join('');
}

function updateAnalyticsClientFilterUi() {
    const input = document.getElementById('analyticsClientFilterInput');
    const clearBtn = document.getElementById('analyticsClientFilterClear');
    const hasClients = (analyticsFilterState.clientNames || []).length > 0;
    if (clearBtn) {
        clearBtn.hidden = !hasClients;
    }
    renderAnalyticsClientChips();
    updateAnalyticsFiltersUi();
}

function clearAnalyticsClientFilters({ fetch = true } = {}) {
    analyticsFilterState.clientNames = [];
    const input = document.getElementById('analyticsClientFilterInput');
    if (input) input.value = '';
    updateAnalyticsClientFilterUi();
    renderAnalyticsClientLookupList();
    if (fetch) fetchDashboardAnalytics();
}

function toggleAnalyticsClientSelection(clientName) {
    const name = (clientName || '').trim();
    if (!name) {
        clearAnalyticsClientFilters();
        return;
    }
    const key = analyticsClientNameKey(name);
    const current = analyticsFilterState.clientNames || [];
    const existingIdx = current.findIndex((n) => analyticsClientNameKey(n) === key);
    if (existingIdx >= 0) {
        current.splice(existingIdx, 1);
    } else {
        current.push(name);
    }
    analyticsFilterState.clientNames = current;
    updateAnalyticsClientFilterUi();
    renderAnalyticsClientLookupList();
    fetchDashboardAnalytics();
}

function removeAnalyticsClientChip(encodedName) {
    const name = decodeURIComponent(encodedName || '');
    analyticsFilterState.clientNames = (analyticsFilterState.clientNames || []).filter(
        (n) => analyticsClientNameKey(n) !== analyticsClientNameKey(name),
    );
    updateAnalyticsClientFilterUi();
    renderAnalyticsClientLookupList();
    fetchDashboardAnalytics();
}

function closeAnalyticsClientFilterList() {
    const list = document.getElementById('analyticsClientFilterList');
    const input = document.getElementById('analyticsClientFilterInput');
    if (list) list.hidden = true;
    if (input) input.setAttribute('aria-expanded', 'false');
}

function normalizeAnalyticsClientOption(entry) {
    const name = typeof entry === 'string'
        ? entry
        : (entry?.client_name || entry?.label || '');
    const trimmed = (name || '').trim();
    if (!trimmed) return null;
    return { client_name: trimmed, label: trimmed };
}

function filterAnalyticsClientOptionsByTerm(options, term) {
    const q = analyticsClientNameKey(term);
    if (!q) return options;
    return options.filter((opt) => analyticsClientNameKey(opt.client_name).includes(q));
}

async function fetchAnalyticsClientOptionsFallback(term) {
    const seen = new Set();
    const options = [];

    const addName = (raw) => {
        const opt = normalizeAnalyticsClientOption(raw);
        if (!opt) return;
        const key = analyticsClientNameKey(opt.client_name);
        if (seen.has(key)) return;
        seen.add(key);
        options.push(opt);
    };

    if (typeof CONFIG !== 'undefined' && Array.isArray(CONFIG.clients)) {
        CONFIG.clients.forEach(addName);
    }

    try {
        const res = await fetch(`${CONFIG.API_URL}/api/client/masters`);
        if (res.ok) {
            const masters = await res.json();
            if (Array.isArray(masters)) {
                masters.forEach((m) => addName(m?.client_name || m?.unique_client_name));
            }
        }
    } catch (err) {
        console.warn('Client masters fallback failed:', err);
    }

    return filterAnalyticsClientOptionsByTerm(options, term).slice(0, 25);
}

function applyAnalyticsClientLookupResults(clientRows) {
    const list = document.getElementById('analyticsClientFilterList');
    if (!list) return;

    const normalized = (Array.isArray(clientRows) ? clientRows : [])
        .map(normalizeAnalyticsClientOption)
        .filter(Boolean);

    analyticsClientLookupResults = [{ client_name: '', label: 'All clients' }].concat(normalized);

    if (analyticsClientLookupResults.length <= 1) {
        list.innerHTML = '<li class="is-empty" role="option">No clients found.</li>';
        return;
    }

    renderAnalyticsClientLookupList();
}

async function fetchAnalyticsClientOptions(query) {
    const list = document.getElementById('analyticsClientFilterList');
    const input = document.getElementById('analyticsClientFilterInput');
    if (!list) return;

    const term = (query || '').trim();
    list.innerHTML = '<li class="is-empty" role="option">Searching…</li>';
    list.hidden = false;
    if (input) input.setAttribute('aria-expanded', 'true');

    try {
        const params = new URLSearchParams();
        if (term) params.set('q', term);
        params.set('limit', '25');
        const response = await fetch(`${CONFIG.API_URL}/api/client/lookup?${params.toString()}`);
        if (!response.ok) throw new Error(`lookup HTTP ${response.status}`);
        const payload = await response.json();
        if (payload?.success === false) {
            throw new Error(payload?.error || 'lookup failed');
        }
        const clients = payload?.data?.clients ?? payload?.clients ?? [];
        if (!clients.length) {
            const fallback = await fetchAnalyticsClientOptionsFallback(term);
            if (fallback.length) {
                applyAnalyticsClientLookupResults(fallback);
                return;
            }
        }
        applyAnalyticsClientLookupResults(clients);
    } catch (err) {
        console.error('Client lookup failed:', err);
        try {
            const fallback = await fetchAnalyticsClientOptionsFallback(term);
            if (fallback.length) {
                applyAnalyticsClientLookupResults(fallback);
                return;
            }
        } catch (fallbackErr) {
            console.error('Client lookup fallback failed:', fallbackErr);
        }
        list.innerHTML = '<li class="is-empty" role="option">Could not load clients. Check connection and refresh.</li>';
    }
}

function bindAnalyticsClientFilter() {
    const input = document.getElementById('analyticsClientFilterInput');
    const list = document.getElementById('analyticsClientFilterList');
    const clearBtn = document.getElementById('analyticsClientFilterClear');
    const chips = document.getElementById('analyticsClientFilterChips');
    const wrap = document.getElementById('analyticsClientFilterWrap');
    if (!input || !list || input.dataset.bound) return;
    input.dataset.bound = '1';

    input.addEventListener('focus', () => {
        fetchAnalyticsClientOptions(input.value || '');
    });
    input.addEventListener('input', () => {
        window.clearTimeout(analyticsClientLookupTimer);
        analyticsClientLookupTimer = window.setTimeout(() => {
            fetchAnalyticsClientOptions(input.value || '');
        }, 250);
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAnalyticsClientFilterList();
            input.blur();
        }
    });

    list.addEventListener('click', (e) => {
        const item = e.target.closest('li[data-client-idx]');
        if (!item || item.classList.contains('is-empty')) return;
        const idx = parseInt(item.getAttribute('data-client-idx'), 10);
        const picked = analyticsClientLookupResults[idx];
        toggleAnalyticsClientSelection(picked ? picked.client_name : '');
    });

    if (chips && !chips.dataset.bound) {
        chips.dataset.bound = '1';
        chips.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-client-chip]');
            if (!btn) return;
            e.preventDefault();
            removeAnalyticsClientChip(btn.getAttribute('data-client-chip'));
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', (e) => {
            e.preventDefault();
            clearAnalyticsClientFilters();
            input.focus();
        });
    }

    document.addEventListener('click', (e) => {
        if (!wrap || wrap.contains(e.target)) return;
        closeAnalyticsClientFilterList();
    });

    renderAnalyticsClientChips();
}

function setAnalyticsDetailsStatusFilter(status, { render = true } = {}) {
    analyticsDetailsState.statusFilter = status || 'all';
    document.querySelectorAll('.analytics-status-chip').forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.status === analyticsDetailsState.statusFilter);
    });
    const label =
        analyticsDetailsState.statusFilter === 'ongoing' ? 'Ongoing'
            : analyticsDetailsState.statusFilter === 'final' ? 'Settled'
                : 'All';
    setText('analyticsDetailsStatusText', label);
    if (render) {
        paginationState.analyticsDetails.currentPage = 1;
        renderAnalyticsDetailsTable();
    }
}

function renderAnalyticsDetailsSummary(rows, { isClientWise = false } = {}) {
    const trips = isClientWise
        ? rows.reduce((sum, r) => sum + (Number(r.trips) || 0), 0)
        : rows.filter((r) => r.row_kind !== 'additional').length;
    const revenue = rows.reduce((sum, r) => sum + (Number(r.revenue_inr) || 0), 0);
    const cost = rows.reduce((sum, r) => sum + (Number(r.cost_inr) || 0), 0);
    const margin = revenue - cost;
    const marginClass = analyticsValueClass(margin);

    setText('analyticsDetailsTrips', String(trips));
    setText('analyticsDetailsRevenue', formatInrAmount(revenue));
    setText('analyticsDetailsCost', formatInrAmount(cost));
    setText('analyticsDetailsMargin', formatInrAmount(margin));
    setText('analyticsDetailsRecordsCount', String(rows.length));

    const marginEl = document.getElementById('analyticsDetailsMargin');
    if (marginEl) {
        marginEl.classList.remove('positive', 'negative');
        if (marginClass) marginEl.classList.add(marginClass);
    }
}

function renderAnalyticsDetailsPagination(totalItems, currentPage, pageSize) {
    const container = document.getElementById('analyticsDetailsPagination');
    if (!container) return;

    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize) || 1);
    const page = Math.min(Math.max(1, currentPage), totalPages);

    if (totalItems === 0) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    container.style.display = 'flex';
    container.innerHTML = `
        <div class="pagination-info" style="display: flex; align-items: center; gap: 16px;">
            <div class="page-size-selector" style="display: flex; align-items: center; gap: 8px;">
                <label style="margin: 0; font-size: 13px; color: var(--text-tertiary); font-weight: 500;">Rows per page</label>
                <select data-analytics-page-size style="padding: 2px 8px; font-size: 12px; height: 28px; min-height: 28px;">
                    <option value="10" ${pageSize === 10 ? 'selected' : ''}>10</option>
                    <option value="20" ${pageSize === 20 ? 'selected' : ''}>20</option>
                    <option value="25" ${pageSize === 25 ? 'selected' : ''}>25</option>
                    <option value="50" ${pageSize === 50 ? 'selected' : ''}>50</option>
                    <option value="100" ${pageSize === 100 ? 'selected' : ''}>100</option>
                </select>
            </div>
        </div>
        <div class="pagination-controls">
            <button class="page-btn" type="button" ${page <= 1 ? 'disabled' : ''} data-analytics-page="first" title="First page">&laquo;</button>
            <button class="page-btn" type="button" ${page <= 1 ? 'disabled' : ''} data-analytics-page="prev" title="Previous">Previous</button>
            <span style="padding: 0 8px; font-size: 13px; color: var(--text-secondary);">Page ${page} of ${totalPages}</span>
            <button class="page-btn" type="button" ${page >= totalPages ? 'disabled' : ''} data-analytics-page="next" title="Next">Next</button>
            <button class="page-btn" type="button" ${page >= totalPages ? 'disabled' : ''} data-analytics-page="last" title="Last page">&raquo;</button>
        </div>
    `;

    if (!container.dataset.bound) {
        container.dataset.bound = '1';
        container.addEventListener('change', (e) => {
            const select = e.target.closest('[data-analytics-page-size]');
            if (!select) return;
            analyticsDetailsState.pageSize = parseInt(select.value, 10) || 20;
            paginationState.analyticsDetails.currentPage = 1;
            renderAnalyticsDetailsTable();
        });
        container.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-analytics-page]');
            if (!btn || btn.disabled) return;
            const action = btn.getAttribute('data-analytics-page');
            const current = paginationState.analyticsDetails.currentPage || 1;
            const size = analyticsDetailsState.pageSize || 20;
            const total = getAnalyticsDetailsDisplayRows().length;
            const pages = Math.max(1, Math.ceil(total / size) || 1);
            let next = current;
            if (action === 'first') next = 1;
            else if (action === 'prev') next = current - 1;
            else if (action === 'next') next = current + 1;
            else if (action === 'last') next = pages;
            window.changeAnalyticsDetailsPage(next);
        });
    }
}

function renderAnalyticsClientWiseRowHtml(row) {
    const marginClass = analyticsValueClass(row.margin_pct);
    return `
            <tr class="list-row">
                <td data-col="client">${escapeHtml(row.client_name || '—')}</td>
                <td class="num" data-col="trips">${row.trips}</td>
                <td class="num" data-col="revenue">${formatInrAmount(row.revenue_inr)}</td>
                <td class="num" data-col="cost">${formatInrAmount(row.cost_inr)}</td>
                <td class="num ${analyticsValueClass(row.capture_inr)}" data-col="margin">${formatInrAmount(row.capture_inr)}</td>
                <td class="num ${marginClass}" data-col="margin_pct">${formatMarginPct(row.margin_pct, 2)}</td>
            </tr>`;
}

function renderAnalyticsEnquiryRowHtml(row) {
    const isOngoing = row.economics_status === 'ongoing';
    const isExtra = row.row_kind === 'additional';
    const statusLabel = isOngoing ? 'Ongoing' : 'Settled';
    const statusClass = isOngoing ? 'analytics-status-pill' : 'analytics-status-pill is-settled';
    const headLabel = isExtra
        ? (row.item_description || 'Additional Charge')
        : (row.booking_cancelled
            ? ((row.cost_inr || row.revenue_inr) ? 'Overheads (booking cancelled)' : 'Booking cancelled (no freight)')
            : 'Freight');
    const rowClass = isExtra ? 'list-row analytics-extra-row' : 'list-row';
    return `
            <tr class="${rowClass}">
                <td data-col="enquiry"><a href="#shipment/${row.enquiry_id}" class="table-link">${escapeHtml(row.enquiry_number || '—')}</a></td>
                <td data-col="client">${escapeHtml(row.client_name || '—')}</td>
                <td data-col="origin">${escapeHtml(row.origin || '—')}</td>
                <td data-col="destination">${escapeHtml(row.destination || '—')}</td>
                <td data-col="container">${escapeHtml(row.container_type || '—')}</td>
                <td data-col="head">${escapeHtml(headLabel)}</td>
                <td class="num" data-col="revenue">${formatInrAmount(row.revenue_inr)}</td>
                <td class="num" data-col="cost">${formatInrAmount(row.cost_inr)}</td>
                <td class="num ${analyticsValueClass(row.capture_inr)}" data-col="margin">${formatInrAmount(row.capture_inr)}</td>
                <td data-col="status"><span class="${statusClass}">${statusLabel}</span></td>
            </tr>`;
}

function renderAnalyticsDetailsTable() {
    const tbody = document.getElementById('analyticsEnquiryTable');
    if (!tbody) return;

    const isClientWise = analyticsDetailsState.viewMode === 'client_wise';
    const colSpan = isClientWise ? 6 : 10;
    const filtered = getAnalyticsDetailsDisplayRows();
    renderAnalyticsDetailsSummary(filtered, { isClientWise });

    const pageSize = analyticsDetailsState.pageSize || 20;
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
    let page = paginationState.analyticsDetails.currentPage || 1;
    if (page > totalPages) page = totalPages;
    if (page < 1) page = 1;
    paginationState.analyticsDetails.currentPage = page;

    const start = (page - 1) * pageSize;
    const pageRows = filtered.slice(start, start + pageSize);

    if (!total) {
        tbody.innerHTML = `<tr class="analytics-empty-row"><td colspan="${colSpan}">No economics data for this filter.</td></tr>`;
    } else if (isClientWise) {
        tbody.innerHTML = pageRows.map((row) => renderAnalyticsClientWiseRowHtml(row)).join('');
    } else {
        tbody.innerHTML = pageRows.map((row) => renderAnalyticsEnquiryRowHtml(row)).join('');
    }

    renderAnalyticsDetailsPagination(total, page, pageSize);

    const subtitle = document.getElementById('analyticsDetailsSubtitle');
    if (subtitle) {
        if (isClientWise) {
            const clientLabel = analyticsClientFilterLabel();
            subtitle.textContent = clientLabel
                ? `Client-wise totals for ${clientLabel}`
                : 'Client-wise cost, revenue, and trips for the selected period';
        } else {
            const ongoingCount = (analyticsDetailsState.rows || []).filter((r) => r.economics_status === 'ongoing').length;
            subtitle.textContent = ongoingCount
                ? `Settled + ongoing · ${ongoingCount} ongoing in pipeline`
                : 'SOB-settled trips for the selected period';
        }
    }
}

function setAnalyticsDetailsRows(settledRows, ongoingRows) {
    const settled = (Array.isArray(settledRows) ? settledRows : []).map((r) => ({
        ...r,
        economics_status: 'final',
    }));
    const ongoing = (Array.isArray(ongoingRows) ? ongoingRows : []).map((r) => ({
        ...r,
        economics_status: 'ongoing',
    }));
    analyticsDetailsState.rows = settled.concat(ongoing);
    paginationState.analyticsDetails.currentPage = 1;
    renderAnalyticsDetailsTable();
}

function bindAnalyticsDetailsUI() {
    initListTableUI({
        searchId: 'analyticsDetailsSearchInput',
        exportId: 'analyticsDetailsExportBtn',
        toggleBtnId: 'analyticsDetailsToggleColumnsBtn',
        menuId: 'analyticsDetailsColumnsMenu',
        dropdownId: 'analyticsDetailsColumnsDropdown',
        cardId: 'analyticsDetailsTableCard',
        tableId: 'analyticsDetailsDataTable',
        tbodyId: 'analyticsEnquiryTable',
        recordsCountId: 'analyticsDetailsRecordsCount',
        exportName: 'enquiry-economics',
    });

    document.querySelectorAll('.analytics-status-chip').forEach((btn) => {
        if (btn.dataset.bound) return;
        btn.dataset.bound = '1';
        btn.addEventListener('click', () => {
            setAnalyticsDetailsStatusFilter(btn.dataset.status || 'all');
        });
    });

    document.querySelectorAll('[data-analytics-mode]').forEach((btn) => {
        if (btn.dataset.bound) return;
        btn.dataset.bound = '1';
        btn.addEventListener('click', () => {
            setAnalyticsDetailsViewMode(btn.dataset.analyticsMode || 'trips');
        });
    });

    syncAnalyticsDetailsTableHead();
    bindAnalyticsClientFilter();
    updateAnalyticsClientFilterUi();
}

window.changeAnalyticsDetailsPage = (page) => {
    paginationState.analyticsDetails.currentPage = page;
    renderAnalyticsDetailsTable();
};

function formatTeu(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function renderTeuBarChart(series) {
    const wrap = document.getElementById('analyticsTeuBarChart');
    if (!wrap) return;

    const rows = Array.isArray(series) ? series : [];
    if (!rows.length) {
        wrap.innerHTML = '<div class="analytics-chart-empty">No TEU data for this period.</div>';
        return;
    }

    const maxTeu = Math.max(0, ...rows.map((r) => Number(r.teu) || 0));
    const bars = rows.map((r) => {
        const teu = Number(r.teu) || 0;
        const pct = maxTeu > 0 ? Math.max(2, (teu / maxTeu) * 100) : 2;
        const height = teu > 0 ? pct : 2;
        const empty = teu <= 0;
        return `
            <div class="analytics-teu-bar${empty ? ' is-empty' : ''}" title="${escapeHtml(r.label || r.month)}: ${formatTeu(teu)} TEU">
                <span class="analytics-teu-bar__value">${empty ? '' : formatTeu(teu)}</span>
                <div class="analytics-teu-bar__track">
                    <div class="analytics-teu-bar__fill" style="height:${height}%"></div>
                </div>
                <span class="analytics-teu-bar__label">${escapeHtml(r.short_label || r.label || '')}</span>
            </div>`;
    }).join('');

    wrap.innerHTML = `<div class="analytics-teu-bars" style="grid-template-columns: repeat(${rows.length}, minmax(0, 1fr));">${bars}</div>`;
}

function renderContainerTeuMatrix(matrix, months) {
    const head = document.getElementById('analyticsTeuMatrixHead');
    const body = document.getElementById('analyticsTeuMatrixBody');
    if (!head || !body) return;

    const monthList = Array.isArray(months) ? months : [];
    const rows = Array.isArray(matrix) ? matrix : [];

    if (!monthList.length) {
        head.innerHTML = '';
        body.innerHTML = '<tr class="analytics-empty-row"><td>No container data yet.</td></tr>';
        return;
    }

    head.innerHTML = `
        <tr>
            <th>Container Type</th>
            ${monthList.map((m) => `<th class="num">${escapeHtml(m.short_label || m.label || m.value || '')}</th>`).join('')}
            <th class="num is-total">Total TEU</th>
        </tr>`;

    if (!rows.length) {
        body.innerHTML = `<tr class="analytics-empty-row"><td colspan="${monthList.length + 2}">No container TEUs for this period.</td></tr>`;
        return;
    }

    const monthKeys = monthList.map((m) => m.value || m.month);
    const colTotals = monthKeys.map(() => 0);
    let grandTotal = 0;

    const dataRows = rows.map((row) => {
        const cells = monthKeys.map((key, idx) => {
            const teu = Number((row.months || {})[key]) || 0;
            colTotals[idx] += teu;
            return `<td class="num">${teu > 0 ? formatTeu(teu) : '—'}</td>`;
        }).join('');
        const total = Number(row.total_teu) || 0;
        grandTotal += total;
        const factor = Number(row.teu_factor) || 1;
        return `
            <tr>
                <td class="type-cell">
                    ${escapeHtml(row.container_type || 'Unknown')}
                    <span class="factor-pill">${factor}× TEU</span>
                </td>
                ${cells}
                <td class="num is-total">${formatTeu(total)}</td>
            </tr>`;
    }).join('');

    const footer = `
        <tr class="is-total">
            <td class="type-cell">Total</td>
            ${colTotals.map((t) => `<td class="num">${t > 0 ? formatTeu(t) : '—'}</td>`).join('')}
            <td class="num">${formatTeu(grandTotal)}</td>
        </tr>`;

    body.innerHTML = dataRows + footer;
}

function filterContainerMatrixByMonths(matrix, monthKeys) {
    const keys = Array.isArray(monthKeys) ? monthKeys : [];
    const keySet = new Set(keys);
    return (Array.isArray(matrix) ? matrix : []).map((row) => {
        const months = {};
        const containers = {};
        let totalTeu = 0;
        let totalContainers = 0;
        keys.forEach((key) => {
            const teu = Number((row.months || {})[key]) || 0;
            const count = Number((row.containers || {})[key]) || 0;
            months[key] = teu;
            containers[key] = count;
            totalTeu += teu;
            totalContainers += count;
        });
        return {
            ...row,
            months,
            containers,
            total_teu: Math.round(totalTeu * 100) / 100,
            total_containers: totalContainers,
        };
    }).filter((row) => {
        if (!keySet.size) return true;
        return row.total_teu > 0 || row.total_containers > 0;
    });
}

function renderAnalyticsTeuSection(data) {
    const teuSeries = filterSeriesByMonthRange(
        Array.isArray(data.monthly_teu_series) ? data.monthly_teu_series : (data.monthly_series || []),
        analyticsFilterState.monthFrom,
        analyticsFilterState.monthTo,
        analyticsAvailableMonths,
    );
    // Prefer explicit teu series; fall back to monthly_series.teu
    const barRows = teuSeries.map((r) => ({
        month: r.month,
        label: r.label,
        short_label: r.short_label,
        teu: r.teu != null ? r.teu : 0,
        containers: r.containers || 0,
        trips: r.trips || 0,
    }));

    renderTeuBarChart(barRows);

    const monthKeys = barRows.map((r) => r.month);
    const monthMeta = barRows.map((r) => ({
        value: r.month,
        label: r.label,
        short_label: r.short_label,
    }));
    const matrix = filterContainerMatrixByMonths(
        Array.isArray(data.container_matrix) ? data.container_matrix : [],
        monthKeys,
    );
    renderContainerTeuMatrix(matrix, monthMeta);

    const totalTeu = barRows.reduce((sum, r) => sum + (Number(r.teu) || 0), 0);
    const totalContainers = barRows.reduce((sum, r) => sum + (Number(r.containers) || 0), 0);
    setText('analyticsTotalTeu', formatTeu(totalTeu));
    setText('analyticsTotalContainers', String(totalContainers));
}

function bindAnalyticsFilters() {
    const fySelect = document.getElementById('analyticsFyFilter');
    const monthFromSelect = document.getElementById('analyticsMonthFromFilter');
    const monthToSelect = document.getElementById('analyticsMonthToFilter');
    const metricSelect = document.getElementById('analyticsMetricFilter');

    if (fySelect && !fySelect.dataset.bound) {
        fySelect.dataset.bound = '1';
        fySelect.addEventListener('change', () => {
            analyticsFilterState.fy = fySelect.value || currentAnalyticsFyValue();
            analyticsFilterState.monthFrom = '';
            analyticsFilterState.monthTo = '';
            analyticsFilterState.dateRange = 'this_year';
            updateAnalyticsViewByOptions();
            updateAnalyticsFiltersUi();
            fetchDashboardAnalytics();
        });
    }
    if (monthFromSelect && !monthFromSelect.dataset.bound) {
        monthFromSelect.dataset.bound = '1';
        monthFromSelect.addEventListener('change', () => {
            let monthFrom = monthFromSelect.value || '';
            let monthTo = analyticsFilterState.monthTo || '';
            ({ monthFrom, monthTo } = clampAnalyticsMonthRange(
                monthFrom,
                monthTo,
                analyticsAvailableMonths,
            ));
            analyticsFilterState.monthFrom = monthFrom;
            analyticsFilterState.monthTo = monthTo;
            analyticsFilterState.dateRange = 'custom';
            analyticsEnsureFyForMonthKey(monthTo || monthFrom);
            updateAnalyticsViewByOptions();
            updateAnalyticsFiltersUi();
            if (monthToSelect) monthToSelect.value = monthTo;
            fetchDashboardAnalytics();
        });
    }
    if (monthToSelect && !monthToSelect.dataset.bound) {
        monthToSelect.dataset.bound = '1';
        monthToSelect.addEventListener('change', () => {
            let monthFrom = analyticsFilterState.monthFrom || '';
            let monthTo = monthToSelect.value || '';
            ({ monthFrom, monthTo } = clampAnalyticsMonthRange(
                monthFrom,
                monthTo,
                analyticsAvailableMonths,
            ));
            analyticsFilterState.monthFrom = monthFrom;
            analyticsFilterState.monthTo = monthTo;
            analyticsFilterState.dateRange = 'custom';
            analyticsEnsureFyForMonthKey(monthTo || monthFrom);
            updateAnalyticsViewByOptions();
            updateAnalyticsFiltersUi();
            monthToSelect.value = monthTo;
            fetchDashboardAnalytics();
        });
    }
    if (metricSelect && !metricSelect.dataset.bound) {
        metricSelect.dataset.bound = '1';
        metricSelect.value = analyticsFilterState.metric;
        metricSelect.addEventListener('change', () => {
            analyticsFilterState.metric = metricSelect.value || 'gross_margin';
            rerenderAnalyticsChartFromCache();
        });
    }
}

async function fetchDashboardAnalytics() {
    bindAnalyticsCommandBar();
    bindAnalyticsFilters();
    bindAnalyticsDetailsUI();
    if (!analyticsFilterState.fy) {
        analyticsFilterState.fy = currentAnalyticsFyValue();
    }

    const tbody = document.getElementById('analyticsEnquiryTable');
    if (tbody) {
        tbody.innerHTML = '<tr class="analytics-loading-row"><td colspan="10">Loading analytics…</td></tr>';
    }

    try {
        const params = new URLSearchParams();
        params.set('fy', analyticsFilterState.fy);
        if (analyticsFilterState.monthFrom) params.set('month_from', analyticsFilterState.monthFrom);
        if (analyticsFilterState.monthTo) params.set('month_to', analyticsFilterState.monthTo);
        if (analyticsFilterState.metric) {
            params.set('metric', analyticsFilterState.metric);
        }
        (analyticsFilterState.clientNames || []).forEach((name) => {
            if (name) params.append('client_names', name);
        });
        if (analyticsFilterState.containerType) {
            params.set('container_type', analyticsFilterState.containerType);
        }
        const url = `${CONFIG.API_URL}/api/dashboard/analytics?${params.toString()}`;
        const response = await fetch(url);
        if (!response.ok) {
            console.error('Dashboard analytics HTTP error:', response.status, await response.text());
            if (tbody) {
                tbody.innerHTML = '<tr class="analytics-empty-row"><td colspan="10">Could not load analytics.</td></tr>';
            }
            return;
        }

        const data = await response.json();
        const summary = data.summary || {};
        analyticsFilterState.monthFrom = summary.filter_month_from || '';
        analyticsFilterState.monthTo = summary.filter_month_to || '';
        if (Array.isArray(summary.filter_client_names)) {
            analyticsFilterState.clientNames = summary.filter_client_names.filter(Boolean);
        } else if (summary.filter_client_name) {
            analyticsFilterState.clientNames = [summary.filter_client_name];
        } else {
            analyticsFilterState.clientNames = [];
        }
        if (summary.filter_container_type !== undefined) {
            analyticsFilterState.containerType = summary.filter_container_type || '';
        }
        lastAnalyticsPayload = data;
        updateAnalyticsClientFilterUi();
        renderAnalyticsSummary(summary);

        analyticsAvailableYears = Array.isArray(data.available_financial_years)
            ? data.available_financial_years
            : [];
        analyticsAvailableMonths = Array.isArray(data.available_months) ? data.available_months : [];
        populateAnalyticsFyFilter(analyticsAvailableYears);
        populateAnalyticsMonthRangeFilters(analyticsAvailableMonths);

        rerenderAnalyticsChartFromCache();

        renderAnalyticsTeuSection(data);

        setAnalyticsDetailsRows(
            Array.isArray(data.enquiries) ? data.enquiries : [],
            Array.isArray(data.ongoing_enquiries) ? data.ongoing_enquiries : [],
        );
    } catch (error) {
        console.error('Error fetching dashboard analytics:', error);
        if (tbody) {
            tbody.innerHTML = '<tr class="analytics-empty-row"><td colspan="10">Could not load analytics.</td></tr>';
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

    if (hash === '#globe') {
        showGlobeView();
    } else if (hash === '#enquiries') {
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
    } else if (hash === '#masters-overheads') {
        showMastersOverheadList();
    } else if (hash === '#masters-payees') {
        showMastersPayeeList();
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

function showGlobeView() {
    hideAllViews();
    setActiveLink('navGlobe');
    const view = document.getElementById('globeView');
    if (view) view.style.display = 'flex';
    const content = document.getElementById('mainContent');
    if (content) content.classList.add('content--globe');
    if (typeof window.mountTradeGlobeView === 'function') {
        window.mountTradeGlobeView();
    }
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

    const section = normalizeTrackingSection(filterType || currentTrackingFilter || 'pending');
    setActiveStatusSection('tracking', section);

    const title = document.querySelector('#trackingView .view-h1');
    if (title) {
        if (section === 'completed') title.textContent = 'Tracking - Completed';
        else if (section === 'cancelled') title.textContent = 'Tracking - Cancelled';
        else title.textContent = 'Tracking - Not Completed';
    }

    paginationState.tracking.currentPage = 1;
    updateTrackingTable(section);
}

window.applyTrackingSavedRefresh = async function applyTrackingSavedRefresh(options = {}) {
    if (options.moveToCompleted) {
        currentTrackingFilter = 'completed';
        setActiveStatusSection('tracking', 'completed');
        const title = document.querySelector('#trackingView .view-h1');
        if (title) title.textContent = 'Tracking - Completed';
    }
    if (typeof refreshBulkStatusCache === 'function') await refreshBulkStatusCache();
    await updateTrackingTable(currentTrackingFilter || 'completed');
    if (typeof updateStatusSectionCounts === 'function') updateStatusSectionCounts();
    if (typeof fetchDashboardStats === 'function') fetchDashboardStats();
};

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
    if (typeof window.unmountTradeGlobeView === 'function') {
        window.unmountTradeGlobeView();
    }
    const content = document.getElementById('mainContent');
    if (content) content.classList.remove('content--globe');
    document.getElementById('dashboardView').style.display = 'none';
    const globeView = document.getElementById('globeView');
    if (globeView) globeView.style.display = 'none';
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

window.refreshTrackingTableDataScope = function refreshTrackingTableDataScope() {
    paginationState.tracking.currentPage = 1;
    updateTrackingTable(currentTrackingFilter);
};

window.refreshSalesTableDataScope = function refreshSalesTableDataScope() {
    paginationState.allEnquiries.currentPage = 1;
    updateAllEnquiriesTable(currentAllEnquiriesFilter);
};

const LIST_TABLE_SEARCH_DEBOUNCE_MS = 250;
const listTableSearchTimers = {};

async function updateAllEnquiriesTable(filterType = null) {
    currentAllEnquiriesFilter = filterType;
    const tbody = document.getElementById('allEnquiriesTable');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading...</td></tr>';

    let filteredEnquiries = enquiries;
    if (!shouldBypassSalesSectionFilter()) {
        if (filterType === 'pending_pricing') {
            filteredEnquiries = enquiries.filter((e) => !e.is_void && (e.stage || 1) <= 1);
        } else if (filterType === 'pending_confirmation') {
            filteredEnquiries = enquiries.filter((e) => !e.is_void && e.stage === 2);
        }
    } else if (filterType && filterType !== 'all') {
        // Keep void rows out when searching across sections.
        filteredEnquiries = enquiries.filter((e) => !e.is_void);
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

function isAcceptedQuoteRecord(q) {
    return String(q?.status || '').toLowerCase() === 'accepted';
}

/** Prefer the accepted quote; otherwise show the newest quote's real status. */
function quoteInfoForEnquiryList(e, quotes = []) {
    const list = Array.isArray(quotes) ? quotes : [];
    const accepted = list.find(isAcceptedQuoteRecord);
    const display = accepted || list[0];
    const raw = String(display?.status || 'draft');
    const status = accepted
        ? 'Accepted'
        : raw.charAt(0).toUpperCase() + raw.slice(1);

    return {
        line: display?.shipping_line || '—',
        total: display?.final_quote_inr ? `₹${Number(display.final_quote_inr).toLocaleString()}` : '—',
        status,
    };
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
    const statusHtml = trackingStatusBadge(e, status);
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

function trackingStatusBadge(e, status = null) {
    if (e.is_void) {
        return `<span style="display:inline-block; padding: 3px 10px; border-radius: 4px; font-size: 11px; font-weight: 800; background:#1f2937; color:#f9fafb; letter-spacing:0.06em; white-space: nowrap; text-transform:uppercase;">⊘ VOID</span>`;
    }
    if (isTrackingCompleted(status)) {
        return '<span class="badge badge-completed"><i class="fas fa-check-circle"></i> Completed</span>';
    }
    return '<span class="badge badge-pending"><i class="fas fa-clock"></i> Not Completed</span>';
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
        let quotes = [];
        try {
            const res = await fetch(`${CONFIG.API_URL}/api/quotes/enquiry/${e.id}`);
            if (res.ok) {
                const payload = await res.json();
                quotes = Array.isArray(payload) ? payload : (payload.quotes || []);
            }
        } catch (err) {
            console.error('Error fetching quote info:', err);
        }

        return renderQuotesListRow(e, quoteInfoForEnquiryList(e, quotes));
    }));

    tbody.innerHTML = rowsHtml.join('');
    renderPagination('quotesPagination', total, page, 'changeQuotesPage');
    afterListTableRender('quotesTable', 'quotesSearchInput', 'quotesRecordsCount');
}




async function updateTrackingTable(filterType = null) {
    currentTrackingFilter = normalizeTrackingSection(filterType || 'pending');
    const tbody = document.getElementById('trackingTable');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading...</td></tr>';

    const candidates = enquiries.filter((e) => isTrackingListEnquiry(e));
    if (candidates.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No records found.</td></tr>';
        renderPagination('trackingPagination', 0, 1, 'changeTrackingPage');
        updateTableRecordsCount('trackingTable', 'trackingRecordsCount');
        updateViewStatusPill('tracking', currentTrackingFilter);
        return;
    }

    const ids = candidates.map((e) => e.id);
    const bulkStatus = Object.keys(cachedBulkStatus).length
        ? cachedBulkStatus
        : await fetchBulkStatus(ids);
    if (!Object.keys(cachedBulkStatus).length) cachedBulkStatus = bulkStatus;

    const trackingEnquiries = candidates;

    const sectionKey = shouldBypassTrackingSectionFilter() ? null : currentTrackingFilter;

    const filteredResults = trackingEnquiries.filter((e) => {
        const s = bulkStatus[e.id] || null;
        if (!sectionKey) return true;
        return matchesTrackingSection(sectionKey, s);
    });

    updateStatusSectionCounts();

    const total = filteredResults.length;
    if (total === 0) {
        const emptyMsg = currentTrackingFilter === 'completed'
            ? 'No completed shipments yet.'
            : currentTrackingFilter === 'cancelled'
                ? 'No cancelled bookings.'
                : 'No incomplete shipments found.';
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">${emptyMsg}</td></tr>`;
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
    const [bulkStatus, additionalInvBulk] = await Promise.all([
        fetchBulkStatus(ids),
        currentFinanceSubView === 'invoices'
            ? fetch(`${CONFIG.API_URL}/api/tracking/additional-invoices/bulk?ids=${encodeURIComponent(ids.join(','))}`)
                .then((r) => r.ok ? r.json() : ({}))
                .catch(() => ({}))
            : Promise.resolve({}),
        currentFinanceSubView === 'invoices' ? fetchFinanceInvoicesCache() : Promise.resolve(null),
    ]).then((arr) => [arr[0], arr[1]]);
    cachedBulkStatus = { ...cachedBulkStatus, ...bulkStatus };
    if (currentFinanceSubView === 'invoices') {
        window._additionalInvoiceDocsByEnquiry = additionalInvBulk || {};
    }

    let financeEnquiries;
    if (currentFinanceSubView === 'invoices') {
        financeEnquiries = buildFinanceInvoiceTaskRows(
            operationalEnquiries,
            bulkStatus,
            additionalInvBulk,
            currentFinanceCompletionTab
        );
    } else {
        financeEnquiries = operationalEnquiries
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
                if (!s) return false;
                const done = isShippingLinePaymentDone(s);
                return showCompleted ? done : !done;
            });
    }

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
        actionHtml: renderFinanceActionCell(e, currentFinanceSubView, currentFinanceCompletionTab),
        detailsExtraHtml: currentFinanceSubView === 'invoices' ? renderFinanceInvoiceTypeBadge(e) : ''
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
        if (status && status.booking_cancelled_at) {
            return {
                label: 'Booking cancelled',
                color: '#9f1239',
                bg: '#ffe4e6',
            };
        }
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
function renderEnquiryActions(e, quoteStatus = null, status = null) {
    const shipmentStatus = status || cachedBulkStatus[e.id] || null;
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

    // Quotes stay editable until a quote record is actually accepted.
    if (!e.is_void) {
        const statusKey = String(quoteStatus || '').toLowerCase();
        const isAccepted = statusKey === 'accepted';
        if (isAccepted) {
            html += `
                <button class="actions-item" onclick="openActionModal('view-quotes', ${e.id})">
                    <i class="fas fa-file-invoice-dollar"></i> View Quotes
                </button>
            `;
        } else {
            html += `
                <button class="actions-item" onclick="openActionModal('edit-quotes', ${e.id})">
                    <i class="fas fa-edit"></i> Edit Quotes
                </button>
            `;
        }
    }

    if ((e.stage || 1) >= 3 && !e.is_void) {
        const bookingCancelled = !!(shipmentStatus && shipmentStatus.booking_cancelled_at);
        const cancelLabel = bookingCancelled ? 'Restore booking' : 'Mark booking cancelled';
        const cancelIcon = bookingCancelled ? 'fa-rotate-left' : 'fa-calendar-xmark';
        const cancelStyle = bookingCancelled ? 'color:#10b981;' : 'color:#be123c;';
        html += `
        <button class="actions-item" style="${cancelStyle} font-weight:600;" onclick="toggleBookingCancelled(${e.id}, event)">
            <i class="fas ${cancelIcon}"></i> ${cancelLabel}
        </button>`;
    }

    // Add Admin Void/Restore at the end
    html += voidBtn;

    return html;
}

function statusBadge(e, status = null) {
    if (e.is_void) {
        return `<span style="display:inline-block; padding: 3px 10px; border-radius: 4px; font-size: 11px; font-weight: 800; background:#1f2937; color:#f9fafb; letter-spacing:0.06em; white-space: nowrap; text-transform:uppercase;">⊘ VOID</span>`;
    }
    const s = getEnquiryStatusLabel(e, status || cachedBulkStatus[e.id] || null);
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

window.toggleBookingCancelled = async function (enquiryId, event) {
    if (event) event.stopPropagation();
    const enq = enquiries.find(e => e.id === enquiryId);
    if (!enq) return;

    const status = cachedBulkStatus[enquiryId] || null;
    const isCancelled = !!(status && status.booking_cancelled_at);
    const confirmed = await new Promise(resolve => {
        showModal(
            isCancelled ? 'Restore booking' : 'Mark booking cancelled',
            isCancelled
                ? `Restore the booking for <strong>${enq.enquiry_number}</strong>? Freight cost and revenue will count in analytics again.`
                : `Mark the booking for <strong>${enq.enquiry_number}</strong> as <strong>cancelled</strong>? Trip freight cost and revenue will be excluded from analytics. Booked overheads (detention, cancellation charges, etc.) will still count.`,
            isCancelled ? 'info' : 'warning',
            () => resolve(true)
        );
        setTimeout(() => resolve(false), 30000);
    });
    if (!confirmed) return;

    const token = localStorage.getItem('token') || '';
    try {
        const res = await fetch(`${CONFIG.API_URL}/api/enquiry/${enquiryId}/booking-cancelled`, {
            method: 'PATCH',
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            showModal('Error', err.detail || 'Could not update booking status.', 'error');
            return;
        }
        const updated = await res.json();
        if (!cachedBulkStatus[enquiryId]) cachedBulkStatus[enquiryId] = { enquiry_id: enquiryId };
        cachedBulkStatus[enquiryId].booking_cancelled_at = updated.booking_cancelled
            ? updated.booking_cancelled_at
            : null;

        updateAllEnquiriesTable(currentAllEnquiriesFilter);
        updateDashboardTable();
        if (typeof updateFinanceTable === 'function') updateFinanceTable();

        showModal(
            updated.booking_cancelled ? 'Booking cancelled' : 'Booking restored',
            updated.booking_cancelled
                ? `Booking for <strong>${enq.enquiry_number}</strong> is cancelled. Only overheads affect economics.`
                : `Booking for <strong>${enq.enquiry_number}</strong> is active again for analytics.`,
            updated.booking_cancelled ? 'warning' : 'success'
        );
    } catch (err) {
        showModal('Network Error', err.message, 'error');
    }
};

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
