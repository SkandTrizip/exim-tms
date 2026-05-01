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

    // Initial routing
    handleRouting();
});

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
        <td><strong>${e.enquiry_number}</strong></td>
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
                <td><strong>${e.enquiry_number}</strong></td>
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
                <td><strong>${e.enquiry_number}</strong></td>
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
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading...</td></tr>';

    const operationalEnquiries = enquiries.filter(e => e.stage >= 3);
    if (operationalEnquiries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No records found.</td></tr>';
        renderPagination('financePagination', 0, 1, 'changeFinancePage');
        updateFinanceStats();
        return;
    }

    // One bulk call for all IDs
    const ids = operationalEnquiries.map(e => e.id);
    const bulkStatus = await fetchBulkStatus(ids);

    // Update table headers for enquiries (default)
    const thead = document.querySelector('#financeView .data-table thead tr');
    if (thead && subView !== 'received') {
        thead.innerHTML = `
            <th>Sale #</th>
            <th>Client</th>
            <th>Route</th>
            <th>Finance Status</th>
            <th>Action</th>
        `;
    }

    // For Payments Received, we use a different data source (Invoices)
    if (subView === 'received') {
        try {
            const res = await fetch(`${CONFIG.API_URL}/api/invoice/list`);
            if (res.ok) {
                const invoices = await res.json();
                renderInvoicesTable(invoices);
                return;
            }
        } catch (err) {
            console.error('Error fetching invoices:', err);
        }
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
                <td><strong>${e.enquiry_number}</strong></td>
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
                        <div class="actions-dropdown">
                            <button class="actions-btn">Actions <i class="fas fa-chevron-down"></i></button>
                            <div class="actions-menu">
                                <button class="actions-item" onclick="window.location.href='/finance-details?enquiry_id=${e.id}'">
                                    <i class="fas fa-${e.payment_done ? 'check-circle' : 'money-bill-wave'}"></i> 
                                    ${e.payment_done ? 'View/Edit Payment' : 'Payment to Shipping Line'}
                                </button>
                                <button class="actions-item" 
                                        ${e.bl_received ? `onclick="window.location.href='/create-invoice?enquiry_id=${e.id}'"` : 'disabled style="opacity: 0.5; cursor: not-allowed;" title="Wait for BL Received status"'}
                                >
                                    <i class="fas fa-file-invoice"></i> Create Invoice 
                                </button>
                                <hr style="margin: 4px 0; border: 0; border-top: 1px solid var(--border-light);">
                                ${renderEnquiryActions(e)}
                            </div>
                        </div>
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

function renderInvoicesTable(invoices) {
    const tbody = document.getElementById('financeTable');
    if (!tbody) return;

    // Update table headers for invoices
    const thead = document.querySelector('#financeView .data-table thead tr');
    if (thead) {
        thead.innerHTML = `
            <th>Invoice #</th>
            <th>Client</th>
            <th>Sale #</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Action</th>
        `;
    }

    if (invoices.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No records found.</td></tr>';
        return;
    }

    tbody.innerHTML = invoices.map(inv => `
        <tr>
            <td><strong>${inv.invoice_number}</strong></td>
            <td>${inv.client_name}</td>
            <td>${inv.enquiry_number}</td>
            <td>${inv.received_amount ? `₹${inv.received_amount.toLocaleString()}` : '---'}</td>
            <td>
                ${inv.is_paid
            ? `<div style="display: flex; flex-direction: column; gap: 4px;">
                    <span class="badge badge-success" style="width: fit-content;"><i class="fas fa-check-circle"></i> Paid</span>
                    <small style="color: var(--text-tertiary); font-size: 11px;">
                        ${inv.payment_type || 'Payment'}: ${inv.payment_reference || '---'}
                    </small>
               </div>`
            : `<span class="badge badge-warning"><i class="fas fa-clock"></i> Pending</span>`}
            </td>
            <td>
                <button class="btn btn-primary" style="padding: 6px 12px; font-size: 12px;" onclick="openPaymentModal(${inv.id}, '${inv.invoice_number}')">
                    <i class="fas fa-hand-holding-usd"></i> ${inv.is_paid ? 'Edit Receipt' : 'Record Receipt'}
                </button>
            </td>
        </tr>
    `).join('');
}

// Global function for modal (will be implemented in separate JS or here)
window.openPaymentModal = async function (invoiceId, invNum) {
    // We'll use a modal to record payment
    // For now, let's redirect to a details page or implement a modal here
    // Redirecting is easier for complex forms
    window.location.href = `/record-payment?invoice_id=${invoiceId}`;
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
        <td><strong>${e.enquiry_number}</strong></td>
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
