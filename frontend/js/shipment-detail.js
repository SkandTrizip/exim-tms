(function () {
    function escapeHtml(value) {
        if (value == null || value === '') return '';
        const el = document.createElement('div');
        el.textContent = String(value);
        return el.innerHTML;
    }

    function formatDate(value) {
        if (!value) return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '—';
        const pad = (n) => String(n).padStart(2, '0');
        return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
    }

    function formatDateTime(value) {
        if (!value) return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '—';
        const pad = (n) => String(n).padStart(2, '0');
        return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    function kv(label, value) {
        return `
            <div class="shipment-kv">
                <label>${escapeHtml(label)}</label>
                <div class="value">${escapeHtml(value ?? '—')}</div>
            </div>`;
    }

    function milestone(label, value) {
        return `
            <div class="shipment-milestone">
                <label>${escapeHtml(label)}</label>
                <div class="value">${escapeHtml(formatDateTime(value))}</div>
            </div>`;
    }

    function renderQuotes(quotes, accepted) {
        if (!quotes || quotes.length === 0) {
            return '<p style="margin:0;color:var(--text-tertiary);font-weight:600;">No quotes yet.</p>';
        }
        const rows = quotes.map((quote) => {
            const acceptedTag = accepted && accepted.id === quote.id ? ' <span class="badge badge-accepted">Accepted</span>' : '';
            return `
                <tr>
                    <td>${escapeHtml(quote.quote_name || quote.quote_number || `Quote ${quote.id}`)}${acceptedTag}</td>
                    <td>${escapeHtml(quote.shipping_line || '—')}</td>
                    <td>${quote.final_quote_inr != null ? `₹${Number(quote.final_quote_inr).toLocaleString()}` : '—'}</td>
                    <td>${escapeHtml(quote.status || '—')}</td>
                </tr>`;
        }).join('');
        return `
            <table class="shipment-mini-table">
                <thead>
                    <tr>
                        <th>Quote</th>
                        <th>Shipping line</th>
                        <th>Total (INR)</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>`;
    }

    function renderInvoices(invoices) {
        if (!invoices || invoices.length === 0) {
            return '<p style="margin:0;color:var(--text-tertiary);font-weight:600;">No invoices raised.</p>';
        }
        const rows = invoices.map((invoice) => `
            <tr>
                <td>${escapeHtml(invoice.invoice_number)}</td>
                <td>${escapeHtml(invoice.customer_invoice_no || '—')}</td>
                <td>${formatDate(invoice.invoice_date)}</td>
                <td>${invoice.is_paid ? 'Paid' : 'Pending'}</td>
            </tr>`).join('');
        return `
            <table class="shipment-mini-table">
                <thead>
                    <tr>
                        <th>Invoice #</th>
                        <th>Customer invoice</th>
                        <th>Date</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>`;
    }

    function renderDocuments(documents) {
        if (!documents || documents.length === 0) {
            return '<p style="margin:0;color:var(--text-tertiary);font-weight:600;">No documents uploaded.</p>';
        }
        const rows = documents.map((doc) => `
            <tr>
                <td>${escapeHtml(doc.document_type || '—')}</td>
                <td>${escapeHtml(doc.file_name || '—')}</td>
                <td>${formatDateTime(doc.created_at)}</td>
            </tr>`).join('');
        return `
            <table class="shipment-mini-table">
                <thead>
                    <tr>
                        <th>Type</th>
                        <th>File</th>
                        <th>Uploaded</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>`;
    }

    function renderShipmentDetail(payload) {
        const enquiry = payload.enquiry || {};
        const status = payload.status || {};
        const accepted = payload.accepted_quote || null;
        const route = [enquiry.origin, enquiry.destination].filter(Boolean).join(' → ') || '—';

        return `
            <div class="view-topbar">
                <div class="view-title">
                    <h1 class="view-h1">${escapeHtml(enquiry.enquiry_number || 'Shipment')}</h1>
                    <div class="view-subtitle">${escapeHtml(enquiry.client_name || '—')} · ${escapeHtml(route)}</div>
                </div>
                <div class="view-actions shipment-detail-actions">
                    <button type="button" class="btn btn-secondary" onclick="history.back()"><i class="fas fa-arrow-left"></i> Back</button>
                    <button type="button" class="btn btn-secondary" onclick="openActionModal('view-sale', ${enquiry.id})"><i class="fas fa-file-invoice"></i> View sale</button>
                    <button type="button" class="btn btn-secondary" onclick="openActionModal('view-tracking', ${enquiry.id})"><i class="fas fa-route"></i> Tracking</button>
                    <button type="button" class="btn btn-primary" onclick="openActionModal('view-quotes', ${enquiry.id})"><i class="fas fa-file-invoice-dollar"></i> Quotes</button>
                </div>
            </div>

            <div class="shipment-detail-grid">
                <section class="shipment-detail-card full-width">
                    <div class="shipment-detail-card-head">
                        <h2>Shipment overview</h2>
                        <span class="badge badge-${enquiry.is_void ? 'pending' : 'accepted'}">${enquiry.is_void ? 'Void' : `Stage ${enquiry.stage || 1}`}</span>
                    </div>
                    <div class="shipment-detail-card-body">
                        <div class="shipment-kv-grid">
                            ${kv('Client', enquiry.client_name)}
                            ${kv('Shipment type', enquiry.shipment_type)}
                            ${kv('Scope', enquiry.client_scope)}
                            ${kv('Container', enquiry.container_type)}
                            ${kv('Commodity', enquiry.commodity)}
                            ${kv('Incoterm', enquiry.incoterm)}
                            ${kv('Stuffing date', formatDate(enquiry.stuffing_date))}
                            ${kv('Received date', formatDate(enquiry.enquiry_received_date))}
                            ${kv('Shipping line', accepted?.shipping_line)}
                            ${kv('Accepted quote (INR)', accepted?.final_quote_inr != null ? `₹${Number(accepted.final_quote_inr).toLocaleString()}` : '—')}
                            ${kv('mBL / Master number', status.master_number)}
                            ${kv('SI number', status.si_number)}
                            ${kv('Container number', status.container_number)}
                            ${kv('Vessel / Voyage', [status.vessel || enquiry.vessel, status.voyage || enquiry.voyage_no].filter(Boolean).join(' / ') || '—')}
                        </div>
                    </div>
                </section>

                <section class="shipment-detail-card">
                    <div class="shipment-detail-card-head"><h2>Route</h2></div>
                    <div class="shipment-detail-card-body shipment-kv-grid">
                        ${kv('Origin', enquiry.origin)}
                        ${kv('Destination', enquiry.destination)}
                        ${kv('POL', accepted?.port_of_loading || enquiry.preferred_origin_port)}
                        ${kv('POD', accepted?.port_of_discharge || enquiry.preferred_destination_port)}
                        ${kv('Port of origin (ops)', status.port_of_origin)}
                        ${kv('Final destination (ops)', status.final_destination)}
                    </div>
                </section>

                <section class="shipment-detail-card">
                    <div class="shipment-detail-card-head"><h2>Cargo & remarks</h2></div>
                    <div class="shipment-detail-card-body shipment-kv-grid">
                        ${kv('HS code', enquiry.hs_code)}
                        ${kv('Cargo value', enquiry.cargo_value != null ? `${enquiry.cargo_value} ${enquiry.cargo_value_currency || ''}`.trim() : '—')}
                        ${kv('Client target rate', enquiry.client_target_rate)}
                        ${kv('Remarks', enquiry.remarks)}
                    </div>
                </section>

                <section class="shipment-detail-card full-width">
                    <div class="shipment-detail-card-head"><h2>Tracking milestones</h2></div>
                    <div class="shipment-detail-card-body shipment-milestones">
                        ${milestone('Booking confirmed', status.booking_confirmed)}
                        ${milestone('SI submitted', status.si_submitted)}
                        ${milestone('BL received', status.bl_received)}
                        ${milestone('SOB', status.sob)}
                        ${milestone('Shipping invoice', status.shipping_invoice)}
                        ${milestone('Pay shipping line', status.pay_line)}
                        ${milestone('Invoice raised', status.inv_raised)}
                        ${milestone('Client payment', status.pay_client)}
                    </div>
                </section>

                <section class="shipment-detail-card full-width">
                    <div class="shipment-detail-card-head"><h2>Quotes</h2></div>
                    <div class="shipment-detail-card-body">${renderQuotes(payload.quotes, accepted)}</div>
                </section>

                <section class="shipment-detail-card">
                    <div class="shipment-detail-card-head"><h2>Invoices</h2></div>
                    <div class="shipment-detail-card-body">${renderInvoices(payload.invoices)}</div>
                </section>

                <section class="shipment-detail-card">
                    <div class="shipment-detail-card-head"><h2>Documents</h2></div>
                    <div class="shipment-detail-card-body">${renderDocuments(payload.documents)}</div>
                </section>
            </div>`;
    }

    async function loadShipmentDetail(enquiryId) {
        const container = document.getElementById('shipmentDetailContent');
        if (!container) return;
        container.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-tertiary);"><i class="fas fa-spinner fa-spin"></i> Loading shipment…</div>';

        try {
            const apiBase = (window.CONFIG && CONFIG.API_URL) ? CONFIG.API_URL : '';
            const response = await fetch(`${apiBase}/api/search/shipment/${enquiryId}`);
            if (!response.ok) {
                container.innerHTML = '<div style="padding:32px;text-align:center;color:var(--error);font-weight:700;">Shipment not found.</div>';
                return;
            }
            const payload = await response.json();
            container.innerHTML = renderShipmentDetail(payload);
        } catch (err) {
            console.error('Shipment detail load failed:', err);
            container.innerHTML = '<div style="padding:32px;text-align:center;color:var(--error);font-weight:700;">Could not load shipment details.</div>';
        }
    }

    window.showShipmentDetailView = function showShipmentDetailView(enquiryId) {
        if (typeof window.hideAllViews === 'function') window.hideAllViews();
        const view = document.getElementById('shipmentDetailView');
        if (!view) {
            window.location.href = `/#shipment/${enquiryId}`;
            return;
        }
        view.style.display = 'block';
        loadShipmentDetail(enquiryId);
    };

    window.loadShipmentDetail = loadShipmentDetail;
})();
