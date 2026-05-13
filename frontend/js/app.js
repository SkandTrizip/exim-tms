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
    // Run stats and enquiry fetch in parallel — stats show immediately, tables fill in alongside
    await Promise.all([
        fetchDashboardStats(),
        fetchAllEnquiries()
    ]);

    document.getElementById('financeView')?.addEventListener('click', handleFinanceReceivedClick);

    // Initial routing
    handleRouting();
});

/** Document type labels — aligned with finance-details.js */
const FINANCE_DOC_TYPE_LABELS = {
    bol: 'Bill of Lading',
    commercialInvoice: 'Commercial Invoice',
    packingList: 'Packing List',
    shippingInvoice: 'Shipping Invoice',
    shippingBill: 'Shipping Bill',
    originCert: 'Certificate of Origin',
    customsDeclaration: 'Customs Declaration',
    insuranceCert: 'Insurance Certificate',
    clientConfirm: 'Client Confirmation',
    booking: 'Booking Confirmation',
    draftSi: 'Draft SI',
    si: 'Shipping Instruction',
    additionalInvoice: 'Additional Invoice'
};

async function fetchDocumentsMapForEnquiries(enquiryIds) {
    const map = {};
    await Promise.all(
        enquiryIds.map(async (id) => {
            try {
                const r = await fetch(`${CONFIG.API_URL}/api/tracking/enquiry/${id}`);
                map[id] = r.ok ? await r.json() : [];
            } catch {
                map[id] = [];
            }
        })
    );
    return map;
}

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

/** Value for <input type="date"> — never throws */
function safeDateInputValue(val) {
    const fallback = () => new Date().toISOString().split('T')[0];
    if (val == null || val === '') return fallback();
    if (typeof val === 'string') {
        const head = val.split('T')[0];
        if (/^\d{4}-\d{2}-\d{2}$/.test(head)) return head;
        const d = new Date(val);
        return Number.isNaN(d.getTime()) ? fallback() : d.toISOString().split('T')[0];
    }
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? fallback() : d.toISOString().split('T')[0];
}

function renderFinanceReceivedDocCards(documents) {
    if (!documents || documents.length === 0) {
        return '<p style="margin:0; color: var(--text-tertiary); font-size: 13px;">No documents uploaded for this sale yet. Upload from Tracking.</p>';
    }
    return `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px;">
        ${documents.map((doc) => {
        const filename = (doc.file_path || '').split(/[/\\]/).pop();
        const fileUrl = `${CONFIG.API_URL}/uploads/${encodeURIComponent(filename)}`;
        const label = FINANCE_DOC_TYPE_LABELS[doc.document_type] || doc.document_type;
        return `
            <div style="padding: 10px; background: var(--gray-50); border: 1px solid var(--border-light); border-radius: 8px; display: flex; align-items: center; gap: 10px;">
                <div style="width: 32px; height: 32px; background: white; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: var(--primary);">
                    <i class="fas fa-file-alt"></i>
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 10px; color: var(--text-tertiary); text-transform: uppercase;">${escapeHtml(label)}</div>
                    <div style="font-size: 12px; font-weight: 600; color: var(--navy-800); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(doc.file_name)}">${escapeHtml(doc.file_name)}</div>
                </div>
                <a href="${fileUrl}" target="_blank" rel="noopener" class="btn btn-outline" style="padding: 4px 8px; font-size: 11px; flex-shrink: 0;"><i class="fas fa-eye"></i></a>
            </div>`;
    }).join('')}
    </div>`;
}

function financeReceivedDetailInner(inv, docs, eid) {
    const invDate = inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString() : '—';
    const dueDate = inv.payment_due_date ? new Date(inv.payment_due_date).toLocaleDateString() : '—';
    const payDateVal = safeDateInputValue(inv.payment_date);
    return `
        <div style="padding: 16px 20px; background: var(--gray-50); border-top: 1px solid var(--border-light);">
            <div style="display: flex; flex-wrap: wrap; gap: 12px 24px; margin-bottom: 14px; font-size: 12px; color: var(--text-secondary);">
                <span><strong style="color: var(--text-tertiary);">Invoice</strong> ${escapeHtml(inv.invoice_number || '—')}</span>
                <span><strong style="color: var(--text-tertiary);">Invoice date</strong> ${invDate}</span>
                <span><strong style="color: var(--text-tertiary);">Due</strong> ${dueDate}</span>
            </div>
            <div style="margin-bottom: 16px;">
                <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-tertiary); margin-bottom: 8px;">Related documents</div>
                ${renderFinanceReceivedDocCards(docs)}
                ${eid ? `<div style="margin-top: 10px;"><a href="/upload-track?enquiry_id=${eid}" class="btn btn-outline" style="padding: 6px 12px; font-size: 12px;"><i class="fas fa-upload"></i> Tracking</a></div>` : ''}
            </div>
            <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-tertiary); margin-bottom: 10px;">Payment received</div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; align-items: end;">
                <div class="form-group" style="margin: 0;">
                    <label style="font-size: 11px; font-weight: 600; color: var(--text-tertiary);">Type</label>
                    <select class="form-control fr-pay-type" style="padding: 8px; font-size: 13px;">
                        <option value="NEFT" ${inv.payment_type === 'NEFT' || !inv.payment_type ? 'selected' : ''}>NEFT</option>
                        <option value="RTGS" ${inv.payment_type === 'RTGS' ? 'selected' : ''}>RTGS</option>
                        <option value="IMPS" ${inv.payment_type === 'IMPS' ? 'selected' : ''}>IMPS</option>
                        <option value="Cheque" ${inv.payment_type === 'Cheque' ? 'selected' : ''}>Cheque</option>
                        <option value="Cash" ${inv.payment_type === 'Cash' ? 'selected' : ''}>Cash</option>
                        <option value="UPI" ${inv.payment_type === 'UPI' ? 'selected' : ''}>UPI</option>
                    </select>
                </div>
                <div class="form-group" style="margin: 0;">
                    <label style="font-size: 11px; font-weight: 600; color: var(--text-tertiary);">Received date</label>
                    <input type="date" class="form-control fr-pay-date" value="${payDateVal}" style="padding: 8px; font-size: 13px;">
                </div>
                <div class="form-group" style="margin: 0;">
                    <label style="font-size: 11px; font-weight: 600; color: var(--text-tertiary);">UTR / reference</label>
                    <input type="text" class="form-control fr-pay-ref" placeholder="Reference" value="${escapeAttr(inv.payment_reference || '')}" style="padding: 8px; font-size: 13px;">
                </div>
                <div class="form-group" style="margin: 0;">
                    <label style="font-size: 11px; font-weight: 600; color: var(--text-tertiary);">Amount (INR)</label>
                    <input type="number" class="form-control fr-pay-amt" placeholder="0" min="0" step="0.01" value="${inv.received_amount != null && inv.received_amount !== '' ? escapeHtml(String(inv.received_amount)) : ''}" style="padding: 8px; font-size: 13px;">
                </div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
                    <button type="button" class="btn btn-primary fr-save-pay" data-invoice-id="${inv.id}" style="padding: 10px 16px; font-size: 13px;">
                        <i class="fas fa-coins"></i> Save payment
                    </button>
                </div>
            </div>
        </div>`;
}

async function renderFinanceReceivedView(invoices) {
    const container = document.getElementById('financeReceivedSections');
    if (!container) return;

    updateFinanceStats();

    if (!invoices || invoices.length === 0) {
        container.innerHTML = `
            <div class="table-container" style="background: white; border-radius: 8px; border: 1px solid var(--border-light); padding: 48px; text-align: center; box-shadow: var(--shadow-sm);">
                <p style="color: var(--text-secondary); margin: 0;">No invoices recorded in the database yet. Save an invoice from <strong>Create Client Invoice</strong> first.</p>
            </div>`;
        renderPagination('financePagination', 0, 1, 'changeFinancePage');
        return;
    }

    const page = paginationState.finance.currentPage;
    const total = invoices.length;
    const startIdx = (page - 1) * PAGE_SIZE;
    const slice = invoices.slice(startIdx, startIdx + PAGE_SIZE);

    const enquiryIds = [...new Set(slice.map((i) => i.enquiry_id).filter(Boolean))];
    const docsMap = await fetchDocumentsMapForEnquiries(enquiryIds);

    const bodyRows = slice.map((inv) => {
        const eid = inv.enquiry_id;
        const docs = eid ? docsMap[eid] || [] : [];
        const paid = !!inv.is_paid;
        const origin = inv.origin || '—';
        const dest = inv.destination || '—';
        const route = `${escapeHtml(origin)} → ${escapeHtml(dest)}`;
        const statusHtml = paid
            ? '<span class="badge badge-success"><i class="fas fa-check-circle"></i> PAID</span>'
            : '<span class="badge badge-warning"><i class="fas fa-clock"></i> AWAITING PAYMENT</span>';

        return `
            <tr class="fr-sum-row">
                <td class="job-no-cell">${escapeHtml(inv.enquiry_number || '—')}</td>
                <td>${escapeHtml(inv.client_name || '—')}</td>
                <td>${route}</td>
                <td>${statusHtml}</td>
                <td>
                    <button type="button" class="btn btn-primary" style="padding: 6px 14px; font-size: 12px;" onclick="toggleFinanceReceivedDetail(${inv.id})">
                        <i class="fas fa-money-bill-wave"></i> Record Amount
                    </button>
                </td>
            </tr>
            <tr class="fr-detail-row" id="fr-detail-${inv.id}" style="display: none;">
                <td colspan="5" style="padding: 0; vertical-align: top;">
                    ${financeReceivedDetailInner(inv, docs, eid)}
                </td>
            </tr>`;
    }).join('');

    container.innerHTML = `
        <div class="table-container" style="background: white; border-radius: 8px; border: 1px solid var(--border-light); overflow: visible; box-shadow: var(--shadow-sm);">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Sale #</th>
                        <th>Client</th>
                        <th>Route</th>
                        <th>Finance Status</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>${bodyRows}</tbody>
            </table>
        </div>`;

    renderPagination('financePagination', total, page, 'changeFinancePage');
}

window.toggleFinanceReceivedDetail = function (invoiceId) {
    const row = document.getElementById(`fr-detail-${invoiceId}`);
    if (!row) return;
    const open = row.style.display !== 'none';
    row.style.display = open ? 'none' : 'table-row';
};

async function handleFinanceReceivedClick(ev) {
    const btn = ev.target.closest('.fr-save-pay');
    if (!btn || currentFinanceSubView !== 'received') return;

    const invoiceId = btn.dataset.invoiceId;
    const detailRow = btn.closest('tr.fr-detail-row');
    if (!invoiceId || !detailRow) return;

    const payment_date = detailRow.querySelector('.fr-pay-date')?.value;
    const payment_type = detailRow.querySelector('.fr-pay-type')?.value;
    const payment_reference = (detailRow.querySelector('.fr-pay-ref')?.value || '').trim();
    const received_amount = parseFloat(detailRow.querySelector('.fr-pay-amt')?.value);

    if (!payment_date || !payment_reference || Number.isNaN(received_amount) || received_amount <= 0) {
        showModal('Missing details', 'Please enter received date, UTR/reference, and a positive amount.', 'warning');
        return;
    }

    const payload = { payment_date, payment_type, payment_reference, received_amount };

    try {
        const response = await fetch(`${CONFIG.API_URL}/api/invoice/payment/${invoiceId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (response.ok) {
            showModal('Saved', 'Payment details recorded successfully.', 'success');
            await updateFinanceTable('received');
            await fetchDashboardStats();
        } else {
            const err = await response.json().catch(() => ({}));
            showModal('Error', err.detail || 'Failed to save payment', 'error');
        }
    } catch (e) {
        showModal('Error', e.message || 'Network error', 'error');
    }
}

async function fetchDashboardStats() {
    try {
        const response = await fetch(`${CONFIG.API_URL}/api/dashboard/stats`);
        if (response.ok) {
            const data = await response.json();
            document.getElementById('totalEnquiry').textContent = data.total_enquiries;
            document.getElementById('pendingPricing').textContent = data.pending_at_pricing;
            document.getElementById('pendingConfirmation').textContent = data.pending_client_confirmation;
            // Updated Booking Pending
            if (document.getElementById('bookingPendingCount'))
                document.getElementById('bookingPendingCount').textContent = data.booking_pending;

            // Updated milestone counts (Pending)
            if (document.getElementById('siPendingCount'))
                document.getElementById('siPendingCount').textContent = data.si_pending;
            if (document.getElementById('blPendingCount'))
                document.getElementById('blPendingCount').textContent = data.bl_pending;
            if (document.getElementById('sobPendingCount'))
                document.getElementById('sobPendingCount').textContent = data.sob_pending;
            if (document.getElementById('financeInvoicesRaised'))
                document.getElementById('financeInvoicesRaised').textContent = data.invoices_raised || 0;
            if (document.getElementById('paymentPendingCount'))
                document.getElementById('paymentPendingCount').textContent = data.payment_pending || 0;
        }
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
    }
}

window.addEventListener('hashchange', handleRouting);

function handleRouting() {
    const hash = window.location.hash;
    if (hash === '#enquiries') {
        showEnquiriesView();
    } else if (hash === '#quotes') {
        showQuotesView();
    } else if (hash === '#tracking') {
        showTrackingView();
    } else if (hash === '#finance' || hash === '#finance-payments' || hash === '#finance-invoices' || hash === '#finance-received') {
        const subView = hash.replace('#finance-', '');
        showFinanceView(subView === '#finance' ? null : subView);
    } else {
        showDashboardView();
        updateNavPricingLink();
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

    const title = document.querySelector('#enquiriesView h1'); // Changed from h2 to h1 to match index.html
    if (title) {
        if (filterType === 'pending_pricing') title.textContent = 'Sales - Pending at Pricing';
        else if (filterType === 'pending_confirmation') title.textContent = 'Sales - Pending Confirmation';
        else title.textContent = 'Sales';
    }

    paginationState.allEnquiries.currentPage = 1;
    updateAllEnquiriesTable(filterType);
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

    // Update header to reflect filter?
    const title = document.querySelector('#trackingView h1');
    if (filterType === 'pending_si') title.textContent = 'Tracking - Pending SI';
    else if (filterType === 'pending_bl') title.textContent = 'Tracking - Pending BL';
    else if (filterType === 'pending_sob') title.textContent = 'Tracking - Sob Remaining';
    else if (filterType === 'pending_booking') title.textContent = 'Tracking - Booking To Be Secured';
    else title.textContent = 'Tracking & Documents';

    paginationState.tracking.currentPage = 1;
    updateTrackingTable(filterType);
}

async function showFinanceView(subView = null) {
    hideAllViews();
    setActiveLink('navFinance');
    document.getElementById('financeView').style.display = 'block';

    const subnav = document.getElementById('financeSubnav');
    if (subnav) subnav.style.display = 'block';

    const title = document.querySelector('#financeView h1');
    const desc = document.querySelector('#financeView div[style*="text-tertiary"]');

    if (subView === 'payments') {
        if (title) title.textContent = 'Payment to Shipping Line';
        if (desc) desc.textContent = 'Manage and record payments made to shipping lines';
        setActiveLink('navFinancePayments');
    } else if (subView === 'invoices') {
        if (title) title.textContent = 'Create Client Invoice';
        if (desc) desc.textContent = 'Review BL status and generate invoices for clients';
        setActiveLink('navFinanceInvoices');
    } else if (subView === 'received') {
        if (title) title.textContent = 'Payments Received from Client';
        if (desc) desc.textContent = 'Record and track payments received from clients for invoices';
        setActiveLink('navFinanceReceived');
    } else {
        if (title) title.textContent = 'Finance Management';
        if (desc) desc.textContent = 'Manage payments and client invoices';
    }

    paginationState.finance.currentPage = 1;
    await updateFinanceTable(subView);
}

function setActiveLink(id) {
    document.querySelectorAll('.sidebar-link').forEach(link => link.classList.remove('active'));
    const active = document.getElementById(id);
    if (active) active.classList.add('active');
}

function toggleSettingsNav(e) {
    e.preventDefault();
    const subnav = document.getElementById('settingsSubnav');
    if (subnav) {
        subnav.style.display = subnav.style.display === 'none' ? 'block' : 'none';
    }
    setActiveLink('navSettings');
}

function hideAllViews() {
    document.getElementById('dashboardView').style.display = 'none';
    document.getElementById('enquiriesView').style.display = 'none';
    document.getElementById('quotesView').style.display = 'none';
    document.getElementById('trackingView').style.display = 'none';
    const financeView = document.getElementById('financeView');
    if (financeView) financeView.style.display = 'none';

    const financeSubnav = document.getElementById('financeSubnav');
    if (financeSubnav) financeSubnav.style.display = 'none';
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
        tbody.appendChild(createEnquiryRowWithStatus(e, s, false));
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
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Loading...</td></tr>';

    let filteredEnquiries = enquiries;
    if (filterType === 'pending_pricing') {
        filteredEnquiries = enquiries.filter(e => e.stage <= 2);
    } else if (filterType === 'pending_confirmation') {
        filteredEnquiries = enquiries.filter(e => e.stage === 2);
    }

    if (filteredEnquiries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No records found.</td></tr>';
        renderPagination('allEnquiriesPagination', 0, 1, 'changeAllEnquiriesPage');
        return;
    }

    const total = filteredEnquiries.length;
    const page = paginationState.allEnquiries.currentPage;
    const start = (page - 1) * PAGE_SIZE;
    const paginated = filteredEnquiries.slice(start, start + PAGE_SIZE);

    // One bulk call for all stage>=3 IDs on this page
    const opsIds = paginated.filter(e => e.stage >= 3 && !e.is_void).map(e => e.id);
    const bulkStatus = opsIds.length > 0 ? await fetchBulkStatus(opsIds) : {};

    tbody.innerHTML = '';
    paginated.forEach(e => {
        const s = (e.stage >= 3 && !e.is_void) ? (bulkStatus[e.id] || null) : null;
        tbody.appendChild(createEnquiryRowWithStatus(e, s, true));
    });

    renderPagination('allEnquiriesPagination', total, page, 'changeAllEnquiriesPage');
}

function createEnquiryRowWithStatus(e, status = null, showDate = false) {
    const tr = document.createElement('tr');
    if (e.is_void) tr.style.opacity = '0.55';
    tr.innerHTML = `
        <td class="job-no-cell">${escapeHtml(e.enquiry_number)}</td>
        <td>${e.client_name}</td>
        <td>${e.origin} → ${e.destination}</td>
        <td>${statusBadge(e, status)}</td>
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
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No records found.</td></tr>';
        renderPagination('quotesPagination', 0, 1, 'changeQuotesPage');
        return;
    }

    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Loading...</td></tr>';

    const rowsHtml = await Promise.all(paginatedEnquiries.map(async e => {
        // Fetch quote status for this enquiry
        let quoteInfo = { line: '---', total: '---', status: 'Draft' };
        try {
            const res = await fetch(`${CONFIG.API_URL}/api/quotes/enquiry/${e.id}`);
            if (res.ok) {
                const quotes = await res.json();
                const accepted = quotes.find(q => q.status === 'accepted') || quotes[0];
                if (accepted) {
                    quoteInfo.line = accepted.shipping_line || 'Multiple';
                    quoteInfo.total = accepted.final_quote_inr ? `₹${accepted.final_quote_inr.toLocaleString()}` : '---';
                    quoteInfo.status = accepted.status.charAt(0).toUpperCase() + accepted.status.slice(1);
                }
            }
        } catch (err) {
            console.error('Error fetching quote info:', err);
        }

        return `
            <tr>
                <td class="job-no-cell">${escapeHtml(e.enquiry_number)}</td>
                <td>${e.client_name}</td>
                <td>${e.origin} → ${e.destination}</td>
                <td>${quoteInfo.line}</td>
                <td><span class="badge badge-${quoteInfo.status.toLowerCase()}">${quoteInfo.status}</span></td>
                <td style="font-weight: 700;">${quoteInfo.total}</td>
                <td>
                    <div class="actions-dropdown">
                        <button class="actions-btn">Actions <i class="fas fa-chevron-down"></i></button>
                        <div class="actions-menu">
                            ${renderEnquiryActions(e, quoteInfo.status)}
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }));

    tbody.innerHTML = rowsHtml.join('');
    renderPagination('quotesPagination', total, page, 'changeQuotesPage');
}




async function updateTrackingTable(filterType = null) {
    currentTrackingFilter = filterType;
    const tbody = document.getElementById('trackingTable');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading...</td></tr>';

    const trackingEnquiries = enquiries.filter(e => e.stage >= 3);
    if (trackingEnquiries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No records found.</td></tr>';
        renderPagination('trackingPagination', 0, 1, 'changeTrackingPage');
        return;
    }

    // One bulk call for all IDs
    const ids = trackingEnquiries.map(e => e.id);
    const bulkStatus = await fetchBulkStatus(ids);

    // Apply milestone filter
    const filteredResults = trackingEnquiries.filter(e => {
        const s = bulkStatus[e.id] || null;
        if (filterType === 'pending_si') return !(s && s.si_submitted);
        if (filterType === 'pending_bl') return !(s && s.bl_received);
        if (filterType === 'pending_sob') return !(s && s.sob);
        if (filterType === 'pending_booking') return !(s && s.booking_confirmed);
        return true;
    });

    const total = filteredResults.length;
    if (total === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No records found.</td></tr>';
        renderPagination('trackingPagination', 0, 1, 'changeTrackingPage');
        return;
    }

    const page = paginationState.tracking.currentPage;
    const startIdx = (page - 1) * PAGE_SIZE;
    const paginatedResults = filteredResults.slice(startIdx, startIdx + PAGE_SIZE);

    const rowsHtml = paginatedResults.map(e => {
        const s = bulkStatus[e.id] || null;
        return `
            <tr>
                <td class="job-no-cell">${escapeHtml(e.enquiry_number)}</td>
                <td>${e.client_name}</td>
                <td>${e.origin} → ${e.destination}</td>
                <td>${statusBadge(e, s)}</td>
                <td>
                    <div class="actions-dropdown">
                        <button class="actions-btn">Actions <i class="fas fa-chevron-down"></i></button>
                        <div class="actions-menu">
                            <button class="actions-item" onclick="window.location.href='/upload-track?enquiry_id=${e.id}'">
                                <i class="fas fa-shipping-fast"></i> View Tracking
                            </button>
                            ${renderEnquiryActions(e)}
                        </div>
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = rowsHtml.join('');
    renderPagination('trackingPagination', total, page, 'changeTrackingPage');
}

async function updateFinanceTable(subView = null) {
    currentFinanceSubView = subView;
    const tbody = document.getElementById('financeTable');
    const tableWrap = document.getElementById('financeTableWrap');
    const receivedEl = document.getElementById('financeReceivedSections');

    if (subView === 'received') {
        if (tableWrap) tableWrap.style.display = 'none';
        if (receivedEl) {
            receivedEl.style.display = 'block';
            receivedEl.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-tertiary);">Loading invoices…</div>';
        }
        try {
            const res = await fetch(`${CONFIG.API_URL}/api/invoice/list`);
            let payload;
            try {
                payload = await res.json();
            } catch (je) {
                throw new Error('Server did not return JSON (check API URL / login).');
            }
            if (res.ok && Array.isArray(payload)) {
                try {
                    await renderFinanceReceivedView(payload);
                } catch (re) {
                    console.error('renderFinanceReceivedView:', re);
                    if (receivedEl) {
                        receivedEl.innerHTML = `<div class="table-container" style="padding:32px;text-align:center;color:var(--text-secondary);">Could not render invoice list. ${escapeHtml(re.message || String(re))}</div>`;
                    }
                    renderPagination('financePagination', 0, 1, 'changeFinancePage');
                    updateFinanceStats();
                }
            } else {
                const detail = payload && payload.detail != null ? String(payload.detail) : `HTTP ${res.status}`;
                if (receivedEl) {
                    receivedEl.innerHTML = `<div class="table-container" style="padding:32px;text-align:center;color:var(--text-secondary);">Could not load invoices. ${escapeHtml(detail)}</div>`;
                }
                renderPagination('financePagination', 0, 1, 'changeFinancePage');
                updateFinanceStats();
            }
        } catch (err) {
            console.error('Error fetching invoices:', err);
            const hint = err && err.message ? err.message : String(err);
            if (receivedEl) {
                receivedEl.innerHTML = `<div class="table-container" style="padding:32px;text-align:center;color:var(--text-secondary);"><p>Error loading invoices.</p><p style="font-size:13px;margin-top:8px;color:var(--text-tertiary);">${escapeHtml(hint)}</p><p style="font-size:12px;margin-top:12px;">Tip: open the app using the same host as in your browser (e.g. <code>127.0.0.1</code> vs <code>localhost</code>) or rely on same-origin API URLs.</p></div>`;
            }
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

    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading...</td></tr>';

    const operationalEnquiries = enquiries.filter(e => e.stage >= 3);
    if (operationalEnquiries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No records found.</td></tr>';
        renderPagination('financePagination', 0, 1, 'changeFinancePage');
        updateFinanceStats();
        return;
    }

    const ids = operationalEnquiries.map(e => e.id);
    const bulkStatus = await fetchBulkStatus(ids);

    const thead = document.querySelector('#financeView .data-table thead tr');
    if (thead) {
        thead.innerHTML = `
            <th>Sale #</th>
            <th>Client</th>
            <th>Route</th>
            <th>Finance Status</th>
            <th>Action</th>
        `;
    }

    // Filter to those that have a shipping invoice
    const financeEnquiries = operationalEnquiries
        .map(e => {
            const s = bulkStatus[e.id] || null;
            if (!s || !s.shipping_invoice) return null;
            return {
                ...e,
                bl_received: !!s.bl_received,
                payment_done: !!s.pay_line
            };
        })
        .filter(Boolean);

    const total = financeEnquiries.length;
    if (total === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No records found.</td></tr>';
        renderPagination('financePagination', 0, 1, 'changeFinancePage');
        updateFinanceStats();
        return;
    }

    const page = paginationState.finance.currentPage;
    const startIdx = (page - 1) * PAGE_SIZE;
    const paginatedFinance = financeEnquiries.slice(startIdx, startIdx + PAGE_SIZE);

    const rowsHtml = paginatedFinance.map(e => {
        return `
            <tr>
                <td class="job-no-cell">${escapeHtml(e.enquiry_number)}</td>
                <td>${e.client_name}</td>
                <td>${e.origin} → ${e.destination}</td>
                <td>
                    ${e.bl_received
                ? '<span class="badge badge-success"><i class="fas fa-check-circle"></i> BL Received</span>'
                : '<span class="badge badge-warning"><i class="fas fa-clock"></i> Awaiting BL</span>'}
                </td>
                <td>
                    ${subView === 'payments' ? `
                        ${e.payment_done ? `
                            <button class="btn btn-success btn-outline" style="padding: 6px 12px; font-size: 12px; display: flex; align-items: center; gap: 6px;" onclick="window.location.href='/finance-details?enquiry_id=${e.id}'">
                                <i class="fas fa-check-circle"></i> View/Edit Payment
                            </button>
                        ` : `
                            <button class="btn btn-primary" style="padding: 6px 12px; font-size: 12px;" onclick="window.location.href='/finance-details?enquiry_id=${e.id}'">
                                <i class="fas fa-money-bill-wave"></i> Make Payment
                            </button>
                        `}
                    ` : subView === 'invoices' ? `
                        <button class="btn btn-primary" style="padding: 6px 12px; font-size: 12px;" 
                                ${e.bl_received ? `onclick="window.location.href='/create-invoice?enquiry_id=${e.id}'"` : 'disabled style="opacity: 0.5; cursor: not-allowed; background: var(--gray-400); border-color: var(--gray-400); color: white;" title="Wait for BL Received status"'}
                        >
                            <i class="fas fa-file-invoice"></i> Create Invoice
                        </button>
                    ` : `
                        <button type="button" class="btn btn-primary" style="padding: 6px 12px; font-size: 12px;" onclick="recordAmountForEnquiry(${e.id})">
                            <i class="fas fa-coins"></i> Record Amount
                        </button>
                    `}
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = rowsHtml.join('');
    renderPagination('financePagination', total, page, 'changeFinancePage');
    updateFinanceStats();
}

async function updateFinanceStats() {
    const paymentsMade = document.getElementById('financePaymentsMade');
    const invoicesRaised = document.getElementById('financeInvoicesRaised');
    const paymentPending = document.getElementById('paymentPendingCount');
    const paymentsReceived = document.getElementById('financePaymentsReceived');

    if (paymentsMade) paymentsMade.textContent = '0';
    if (paymentsReceived) paymentsReceived.textContent = '0';

    try {
        const statsRes = await fetch(`${CONFIG.API_URL}/api/dashboard/stats`);
        if (statsRes.ok) {
            const sData = await statsRes.json();
            if (invoicesRaised) invoicesRaised.textContent = sData.invoices_raised || '0';
            if (paymentPending) paymentPending.textContent = sData.payment_pending || '0';
            if (paymentsMade) paymentsMade.textContent = sData.payments_made || '0';
            if (paymentsReceived) paymentsReceived.textContent = sData.received_payments || '0';
        }
    } catch (e) {
        console.error(e);
    }
}

window.openPaymentModal = function (invoiceId) {
    window.location.href = `/record-payment?invoice_id=${invoiceId}`;
};

/** Client receipt: open record-payment if this sale has a saved invoice, else Finance Received list */
window.recordAmountForEnquiry = async function (enquiryId) {
    try {
        const res = await fetch(`${CONFIG.API_URL}/api/invoice/details/${enquiryId}`);
        if (res.ok) {
            const inv = await res.json();
            if (inv && inv.id) {
                window.location.href = `/record-payment?invoice_id=${inv.id}`;
                return;
            }
        }
    } catch (err) {
        console.error('recordAmountForEnquiry:', err);
    }
    window.location.href = '/#finance-received';
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
            if (!status.pay_line) return { label: 'Payment Pending at Shipping Line', color: '#dc2626', bg: '#fee2e2' };
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
        <button class="actions-item" onclick="viewEnquiry(${e.id})">
            <i class="fas fa-file-invoice"></i> View Sale
        </button>
    `;

    // Pricing context
    if (!e.is_void) {
        if (quoteStatus === 'Draft') {
            html += `
                <button class="actions-item" onclick="window.location.href='/pricing?enquiry_id=${e.id}&mode=edit'">
                    <i class="fas fa-edit"></i> Edit Quotes
                </button>
            `;
        } else if (e.stage === 2) {
            html += `
                <button class="actions-item confirm-item confirm-action" onclick="window.location.href='/pricing?enquiry_id=${e.id}&mode=confirm'">
                    <i class="fas fa-check-double"></i> Confirm Quote
                </button>
            `;
        } else if (e.stage >= 3) {
            html += `
                <button class="actions-item" onclick="window.location.href='/pricing?enquiry_id=${e.id}&mode=view'">
                    <i class="fas fa-file-invoice-dollar"></i> View Quotes
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
    window.location.href = `/enquiry?enquiry_id=${id}`;
}

function startNewEnquiry() {
    window.location.href = '/enquiry';
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
