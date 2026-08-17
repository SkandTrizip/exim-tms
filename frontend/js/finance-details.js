
let enquiryId = null;
let currentEnquiry = null;

document.addEventListener('DOMContentLoaded', async function () {
    const urlParams = new URLSearchParams(window.location.search);
    enquiryId = urlParams.get('enquiry_id');

    if (!enquiryId) {
        alert('No enquiry ID provided');
        window.location.href = '/#finance';
        return;
    }

    await fetchEnquiryDetails();
    await fetchUploadedDocuments();
    await fetchFinanceStatus();
    await loadOverheadSection();

    // Initialize quick entry date
    const dateInput = document.getElementById('quick_pay_date');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
});

// ── Overheads (intermittent charges) ────────────────────────────────────────
let overheadCatalog = [];
let payeeCatalog = [];
let bookingOverheadId = null;
let baseShippingLineTotal = 0;
let overheadAddToLineTotal = 0;
let overheadDeductClientTotal = 0;
let oceanFreightLineRoe = null;
let oceanFreightClientRoe = null;

function overheadConversionRoe(row) {
    if (row.applied_roe != null && Number(row.applied_roe) > 0) {
        return Number(row.applied_roe);
    }
    if (row.cost_impact === 'deduct_from_client') {
        if (row.ocean_freight_client_roe != null) return Number(row.ocean_freight_client_roe);
        return oceanFreightClientRoe;
    }
    if (row.ocean_freight_roe != null) return Number(row.ocean_freight_roe);
    return oceanFreightLineRoe;
}

function overheadInrAmount(row) {
    if (row.amount_inr != null && !Number.isNaN(Number(row.amount_inr))) {
        return Number(row.amount_inr);
    }
    const curr = String(row.currency || 'INR').toUpperCase();
    const amount = Number(row.amount) || 0;
    if (curr === 'INR') return amount;
    const roe = overheadConversionRoe(row);
    if (roe && roe > 0) return Math.round(amount * roe);
    return 0;
}

function formatOverheadAmountCell(row) {
    const curr = ovpEscape(row.currency || 'INR');
    const amount = Number(row.amount) || 0;
    const inr = overheadInrAmount(row);
    if (String(row.currency || 'INR').toUpperCase() === 'INR') {
        return `₹${inr.toLocaleString()}`;
    }
    const roe = overheadConversionRoe(row);
    const roeLabel = row.cost_impact === 'deduct_from_client' ? 'client ROE' : 'line ROE';
    const roeNote = roe
        ? `<br><span style="color:var(--text-tertiary);font-size:11px;font-weight:500;">₹${inr.toLocaleString()} @ ${Number(roe).toFixed(2)} (${roeLabel})</span>`
        : '<br><span style="color:#b45309;font-size:11px;font-weight:500;">ROE missing</span>';
    return `${curr} ${amount.toLocaleString()}${roeNote}`;
}

function ovpEscape(str) {
    if (typeof escapeHtml === 'function') return escapeHtml(str == null ? '' : String(str));
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function ovpAuthHeaders() {
    const t = localStorage.getItem('token') || '';
    return t ? { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }
             : { 'Content-Type': 'application/json' };
}

async function loadOverheadSection() {
    try {
        const [ovRes, pyRes] = await Promise.all([
            fetch(`${CONFIG.API_URL}/api/overheads/`).catch(() => null),
            fetch(`${CONFIG.API_URL}/api/payees/`).catch(() => null)
        ]);
        overheadCatalog = ovRes && ovRes.ok ? await ovRes.json() : [];
        payeeCatalog = pyRes && pyRes.ok ? await pyRes.json() : [];
        populateOverheadSelect();
        populatePayeeSelect();
    } catch (e) {
        console.error('Failed to load overhead/payee catalogs', e);
    }
    await fetchOverheadPayments();
}

function populateOverheadSelect() {
    const sel = document.getElementById('ovp_overhead');
    if (!sel) return;
    const verified = overheadCatalog.filter(o => (o.status || '').toLowerCase() === 'verified');
    const list = verified.length ? verified : overheadCatalog;
    sel.innerHTML = '<option value="">Select overhead…</option>' +
        list.map(o => `<option value="${o.id}">${ovpEscape(o.overhead_name)}${o.category ? ' · ' + ovpEscape(o.category) : ''}</option>`).join('');
}

function populatePayeeSelect() {
    const sel = document.getElementById('ovp_payee');
    if (!sel) return;
    const verified = payeeCatalog.filter(p => (p.status || '').toLowerCase() === 'verified');
    const list = verified.length ? verified : payeeCatalog;
    sel.innerHTML = '<option value="">Select payee…</option>' +
        list.map(p => `<option value="${p.id}">${ovpEscape(p.payee_name)}${p.bank ? ' · ' + ovpEscape(p.bank) : ''}</option>`).join('') +
        '<option value="__new__">➕ Add new payee…</option>';
}

function onOverheadSelected() {
    const sel = document.getElementById('ovp_overhead');
    const ov = overheadCatalog.find(o => String(o.id) === String(sel.value));
    if (!ov) return;
    const amtEl = document.getElementById('ovp_amount');
    const curEl = document.getElementById('ovp_currency');
    if (curEl && ov.default_currency) curEl.value = ov.default_currency;
    if (amtEl && !amtEl.value && ov.default_amount != null) amtEl.value = ov.default_amount;
}

function onPayeeSelected() {
    const sel = document.getElementById('ovp_payee');
    const box = document.getElementById('ovp_new_payee_box');
    if (box) box.style.display = sel.value === '__new__' ? 'block' : 'none';
}

function ovpVal(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
}

async function submitOverheadPayment(btn) {
    const overheadId = ovpVal('ovp_overhead');
    const payeeSel = ovpVal('ovp_payee');
    const amount = parseFloat(ovpVal('ovp_amount'));
    const description = ovpVal('ovp_description');
    const currency = ovpVal('ovp_currency') || 'INR';

    if (!overheadId) { alert('Please select an overhead.'); return; }
    if (isNaN(amount) || amount <= 0) { alert('Please enter a valid amount.'); return; }

    const costImpact = ovpVal('ovp_cost_impact') || 'add_to_shipping_line';
    const payload = {
        enquiry_id: parseInt(enquiryId),
        overhead_id: parseInt(overheadId),
        description,
        amount,
        currency,
        status: 'to_be_booked',
        cost_impact: costImpact,
        created_by: getFinanceUsername(),
    };

    if (payeeSel === '__new__') {
        const npName = ovpVal('ovp_np_name');
        if (!npName) { alert('Please enter the new payee name.'); return; }
        payload.new_payee = {
            payee_name: npName,
            payee_type: ovpVal('ovp_np_type') || 'Company',
            contact_number: ovpVal('ovp_np_contact'),
            beneficiary_name: ovpVal('ovp_np_beneficiary'),
            account_number: ovpVal('ovp_np_account'),
            ifsc_code: ovpVal('ovp_np_ifsc'),
            bank: ovpVal('ovp_np_bank'),
            bank_branch: ovpVal('ovp_np_branch'),
            gst_number: ovpVal('ovp_np_gst'),
        };
    } else if (payeeSel) {
        payload.payee_id = parseInt(payeeSel);
    } else {
        alert('Please select a payee or add a new one.');
        return;
    }

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding…'; }
    try {
        const res = await fetch(`${CONFIG.API_URL}/api/finance/overhead-payment`, {
            method: 'POST',
            headers: ovpAuthHeaders(),
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            alert('Error: ' + (err.detail || 'Failed to add overhead.'));
            return;
        }
        // Reset form
        document.getElementById('ovp_overhead').value = '';
        document.getElementById('ovp_payee').value = '';
        document.getElementById('ovp_amount').value = '';
        document.getElementById('ovp_description').value = '';
        onPayeeSelected();
        // Reload catalogs (a new inline payee may have been created) + table
        await loadOverheadSection();
    } catch (e) {
        console.error(e);
        alert('Network error while adding overhead.');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-plus"></i> Add to Booking'; }
    }
}

function getFinanceUsername() {
    try {
        const raw = localStorage.getItem('user') || '';
        if (!raw) return 'finance';
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'string') return parsed;
        return parsed.username || 'finance';
    } catch (_) {
        return localStorage.getItem('user') || 'finance';
    }
}

async function fetchOverheadPayments() {
    try {
        const res = await fetch(`${CONFIG.API_URL}/api/finance/overhead-payment/${enquiryId}`);
        if (!res.ok) return;
        const rows = await res.json();
        renderOverheadPaymentsTable(rows);
    } catch (e) {
        console.error('Failed to load overhead payments', e);
    }
}

function overheadStatusBadge(status) {
    const map = {
        to_be_booked: { bg: '#fef3c7', color: '#92400e', label: 'To Be Booked' },
        booked: { bg: '#dbeafe', color: '#1e40af', label: 'Booked' },
        paid: { bg: '#dcfce7', color: '#166534', label: 'Paid' },
    };
    const s = map[status] || map.to_be_booked;
    return `<span style="padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:${s.bg};color:${s.color};">${s.label}</span>`;
}

function overheadImpactBadge(impact) {
    if (impact === 'deduct_from_client') {
        return '<span style="padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#fef3c7;color:#b45309;">Deduct from Client</span>';
    }
    return '<span style="padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#e0e7ff;color:#3730a3;">Add to Line</span>';
}

function renderOverheadPaymentsTable(rows) {
    const tbody = document.getElementById('overheadPaymentsTableBody');
    const totalEl = document.getElementById('totalOverheadsAmount');
    if (!tbody) return;

    overheadAddToLineTotal = 0;
    overheadDeductClientTotal = 0;

    if (!rows || rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="padding: 24px; text-align: center; color: var(--text-tertiary);">No overheads booked yet.</td></tr>';
        if (totalEl) totalEl.textContent = '₹0.00';
        updateOverheadFinancialSummary();
        return;
    }

    let total = 0;
    tbody.innerHTML = rows.map(r => {
        if (r.ocean_freight_roe != null && r.ocean_freight_roe > 0) {
            oceanFreightLineRoe = Number(r.ocean_freight_roe);
        }
        if (r.ocean_freight_client_roe != null && r.ocean_freight_client_roe > 0) {
            oceanFreightClientRoe = Number(r.ocean_freight_client_roe);
        }
        const inrAmount = overheadInrAmount(r);
        total += inrAmount;
        if (r.cost_impact === 'deduct_from_client') overheadDeductClientTotal += inrAmount;
        else overheadAddToLineTotal += inrAmount;
        const utrDate = r.utr_number
            ? `${ovpEscape(r.utr_number)}${r.payment_date ? '<br><span style="color:var(--text-tertiary);font-size:11px;">' + new Date(r.payment_date).toLocaleDateString('en-GB') + '</span>' : ''}`
            : '—';
        const isPaid = r.status === 'paid';
        const bookBtn = isPaid
            ? ''
            : `<button type="button" class="btn btn-outline" style="padding:4px 10px;font-size:11px;" onclick="openBookOverheadModal(${r.id}, '${ovpEscape(r.overhead_name)}', '${ovpEscape(r.payee_name)}', ${inrAmount})"><i class="fas fa-check"></i> Book</button>`;
        return `
            <tr style="border-bottom:1px solid #f1f5f9;">
                <td style="padding:12px;color:var(--navy-800);font-weight:600;">${ovpEscape(r.overhead_name || '—')}${r.description ? '<br><span style="color:var(--text-tertiary);font-weight:400;font-size:11px;">' + ovpEscape(r.description) + '</span>' : ''}</td>
                <td style="padding:12px;">${ovpEscape(r.payee_name || '—')}</td>
                <td style="padding:12px;">${overheadImpactBadge(r.cost_impact)}</td>
                <td style="padding:12px;">${overheadStatusBadge(r.status)}</td>
                <td style="padding:12px;font-family:monospace;">${utrDate}</td>
                <td style="padding:12px;text-align:right;font-weight:700;color:var(--navy-800);">${formatOverheadAmountCell(r)}</td>
                <td style="padding:12px;text-align:center;white-space:nowrap;">
                    ${bookBtn}
                    <button type="button" class="btn btn-outline" style="padding:4px 8px;font-size:11px;color:var(--danger,#dc2626);border-color:#fecaca;" title="Delete" onclick="deleteOverheadPayment(${r.id})"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
    }).join('');

    if (totalEl) totalEl.textContent = `₹${Math.round(total).toLocaleString()}`;
    updateOverheadFinancialSummary();
}

/** Reflect overhead treatment in the Financial Summary (shipping-line cost / client deductions). */
function updateOverheadFinancialSummary() {
    const lineRow = document.getElementById('row_overhead_line');
    const deductRow = document.getElementById('row_overhead_deduct');
    const lineEl = document.getElementById('display_overhead_line');
    const deductEl = document.getElementById('display_overhead_deduct');
    const finalEl = document.getElementById('display_final_quote');

    if (lineEl) lineEl.textContent = `₹${Math.round(overheadAddToLineTotal).toLocaleString()}`;
    if (deductEl) deductEl.textContent = `₹${Math.round(overheadDeductClientTotal).toLocaleString()}`;
    if (lineRow) lineRow.style.display = overheadAddToLineTotal > 0 ? 'grid' : 'none';
    if (deductRow) deductRow.style.display = overheadDeductClientTotal > 0 ? 'grid' : 'none';

    // Final shipping-line cost includes overheads marked "add to shipping line".
    const finalLineCost = (baseShippingLineTotal || 0) + overheadAddToLineTotal;
    if (finalEl) finalEl.textContent = `₹${Math.round(finalLineCost).toLocaleString()}`;
}

function openBookOverheadModal(id, overheadName, payeeName, amount) {
    bookingOverheadId = id;
    const summary = document.getElementById('bookOverheadSummary');
    if (summary) summary.innerHTML = `Recording payment for <strong>${ovpEscape(overheadName)}</strong> to <strong>${ovpEscape(payeeName || '—')}</strong> (₹${(amount || 0).toLocaleString()}).`;
    const dateEl = document.getElementById('book_ovp_date');
    if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];
    const utrEl = document.getElementById('book_ovp_utr');
    if (utrEl) utrEl.value = '';
    document.getElementById('bookOverheadModal').style.display = 'block';
}

function closeBookOverheadModal() {
    bookingOverheadId = null;
    document.getElementById('bookOverheadModal').style.display = 'none';
}

async function confirmBookOverheadPayment(btn) {
    if (!bookingOverheadId) return;
    const utr = ovpVal('book_ovp_utr');
    const date = ovpVal('book_ovp_date');
    if (!utr || !date) { alert('Please enter both UTR number and payment date.'); return; }

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'; }
    try {
        const res = await fetch(`${CONFIG.API_URL}/api/finance/overhead-payment/${bookingOverheadId}/book`, {
            method: 'PATCH',
            headers: ovpAuthHeaders(),
            body: JSON.stringify({ utr_number: utr, payment_date: date, status: 'paid' })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            alert('Error: ' + (err.detail || 'Failed to book payment.'));
            return;
        }
        closeBookOverheadModal();
        await fetchOverheadPayments();
    } catch (e) {
        console.error(e);
        alert('Network error while booking payment.');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = 'Mark as Paid'; }
    }
}

async function deleteOverheadPayment(id) {
    if (!confirm('Remove this overhead line item?')) return;
    try {
        const res = await fetch(`${CONFIG.API_URL}/api/finance/overhead-payment/${id}`, {
            method: 'DELETE',
            headers: ovpAuthHeaders()
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            alert('Error: ' + (err.detail || 'Failed to delete.'));
            return;
        }
        await fetchOverheadPayments();
    } catch (e) {
        console.error(e);
        alert('Network error while deleting.');
    }
}

/** Sum On-Your-Account charges from quote/final-quote containers into INR totals. */
/** Ocean Freight ROEs from final quote containers. */
function findOceanFreightRoes(containers) {
    let lineRoe = null;
    let clientRoe = null;
    for (const c of containers || []) {
        for (const ch of c.charges || []) {
            if (String(ch.charge_description || '').trim().toLowerCase() !== 'ocean freight') continue;
            const ex = Number(ch.exchange_rate);
            if (Number.isFinite(ex) && ex > 0) lineRoe = ex;
            const curr = String(ch.currency || 'INR').toUpperCase();
            if (curr === 'INR') {
                clientRoe = 1;
            } else {
                let vex = Number(ch.vendor_exchange_rate);
                if (!Number.isFinite(vex) || vex <= 0 || (vex === 1 && lineRoe && lineRoe !== 1)) {
                    vex = lineRoe;
                }
                if (Number.isFinite(vex) && vex > 0) clientRoe = vex;
            }
            return { lineRoe, clientRoe };
        }
    }
    return { lineRoe, clientRoe };
}

function computeQuoteTotalsInr(containers) {
    let shippingLineTotal = 0;
    let vendorTotal = 0;
    (containers || []).forEach(c => {
        (c.charges || []).forEach(ch => {
            if (ch.account_type !== 'On Your Account') return;
            shippingLineTotal += (ch.final_inr_amount || 0);
            const vRate = ch.vendor_rate || 0;
            const qty = ch.quantity || 0;
            const ex = ch.vendor_exchange_rate ?? ch.exchange_rate ?? 1;
            const vTot = qty * vRate;
            const vInr = ch.charged_on === 'Per BL' ? vTot : (ch.currency !== 'INR' ? vTot * ex : vTot);
            vendorTotal += vInr;
        });
    });
    return { shippingLineTotal, vendorTotal };
}

async function fetchEnquiryDetails() {
    try {
        const response = await fetch(`${CONFIG.API_URL}/api/enquiry/${enquiryId}`);
        if (response.ok) {
            currentEnquiry = await response.json();
            document.getElementById('display_enquiry_number').textContent = currentEnquiry.enquiry_number;
            document.getElementById('display_client_name').textContent = currentEnquiry.client_name;

            // Fetch quote info for price and shipping line
            const quoteRes = await fetch(`${CONFIG.API_URL}/api/quotes/enquiry/${enquiryId}`);
            if (quoteRes.ok) {
                const quotes = await quoteRes.json();
                const accepted = quotes.find(q => q.status === 'accepted') || quotes[0];
                if (accepted) {
                    document.getElementById('display_shipping_line').textContent = accepted.shipping_line || '---';

                    // Use the post-SI final quote amount when available; otherwise
                    // fall back to the accepted (initial) quote.
                    let quoteContainers = accepted.containers || [];
                    try {
                        const finalRes = await fetch(`${CONFIG.API_URL}/api/quotes/${accepted.id}/final`);
                        if (finalRes.ok) {
                            const finalQuote = await finalRes.json();
                            if (finalQuote && (finalQuote.containers || []).length) {
                                quoteContainers = finalQuote.containers;
                            }
                        }
                    } catch (e) {
                        console.warn('Final quote unavailable, using accepted quote for finance totals.', e);
                    }

                    const { shippingLineTotal, vendorTotal } = computeQuoteTotalsInr(quoteContainers);
                    const roes = findOceanFreightRoes(quoteContainers);
                    if (roes.lineRoe != null) oceanFreightLineRoe = roes.lineRoe;
                    if (roes.clientRoe != null) oceanFreightClientRoe = roes.clientRoe;

                    // Base shipping-line total (before overheads); overheads adjust this later.
                    baseShippingLineTotal = shippingLineTotal;
                    const baseEl = document.getElementById('display_base_line');
                    if (baseEl) baseEl.textContent = `₹${Math.round(shippingLineTotal).toLocaleString()}`;
                    const slEl = document.getElementById('display_final_quote');
                    if (slEl) slEl.textContent = `₹${Math.round(shippingLineTotal).toLocaleString()}`;
                    // If overheads already loaded, reflect them in the summary.
                    updateOverheadFinancialSummary();

                    // Show Vendor total (invoice to client) if element exists
                    const vendorEl = document.getElementById('display_vendor_total');
                    if (vendorEl) vendorEl.textContent = `₹${Math.round(vendorTotal).toLocaleString()}`;

                    // Pre-fill payment amount with the final quote amount (overheads excluded).
                    const payAmtEl = document.getElementById('quick_pay_amount');
                    if (payAmtEl && !payAmtEl.value) payAmtEl.value = Math.round(shippingLineTotal);
                }
            }
        }
    } catch (error) {
        console.error('Error fetching enquiry details:', error);
    }
}

/** Map stored document_type (and common variants) → label for Finance reference docs */
function financeDocumentTypeLabel(docType) {
    const raw = (docType || '').toString().trim();
    const norm = raw.toLowerCase().replace(/[\s_-]/g, '');
    const byNorm = {
        bol: 'Bill of Lading',
        billoflading: 'Bill of Lading',
        bl: 'Bill of Lading',
        commercialinvoice: 'Commercial Invoice',
        packinglist: 'Packing List',
        shippinginvoice: 'Shipping Invoice',
        shippingbill: 'Shipping Bill',
        origincert: 'Certificate of Origin',
        customsdeclaration: 'Customs Declaration',
        insurancecert: 'Insurance Certificate',
        clientconfirm: 'Client Confirmation',
        booking: 'Booking Confirmation',
        draftsi: 'Draft SI',
        si: 'Shipping Instruction',
        additionalinvoice: 'Additional Invoice'
    };
    if (byNorm[norm]) return byNorm[norm];
     if (norm.includes('billoflading')) return 'Bill of Lading';
    if (!raw) return 'Document';
    return raw.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim();
}

async function fetchUploadedDocuments() {
    const listElement = document.getElementById('referenceDocumentsList');
    if (!listElement) return;

    const apiBase =
        typeof CONFIG !== 'undefined' && CONFIG.API_URL != null ? String(CONFIG.API_URL) : '';
    const requestUrl = `${apiBase}/api/tracking/enquiry/${encodeURIComponent(String(enquiryId))}`;

    const setMessage = (text, isError = false) => {
        listElement.innerHTML = `<p style="color: ${isError ? 'var(--danger, #b91c1c)' : 'var(--text-tertiary)'}; font-size: 14px;">${text}</p>`;
    };

    try {
        const response = await fetch(requestUrl);

        if (!response.ok) {
            setMessage(`Could not load reference documents (${response.status}). Refresh the page or try again later.`, true);
            return;
        }

        let documents;
        try {
            documents = await response.json();
        } catch (_) {
            setMessage('Documents response was invalid. Please try again.', true);
            return;
        }

        if (!Array.isArray(documents)) {
            documents = [];
        }

        listElement.innerHTML = '';

        if (documents.length === 0) {
            setMessage('No documents uploaded yet.');
            return;
        }

        documents.forEach((doc) => {
            const rawPath = (doc.file_path || '').trim();
            let storageName = rawPath.split(/[/\\]/).pop() || '';
            if (!storageName && doc.file_name) {
                storageName = String(doc.file_name).split(/[/\\]/).pop() || '';
            }
            const displayName = (doc.file_name && String(doc.file_name).trim()) || storageName || 'Document';
            const fileUrl = storageName ? `${apiBase}/uploads/${encodeURIComponent(storageName)}` : '#';

            const card = document.createElement('div');
            card.style.cssText =
                'padding: 12px; background: #f8fafc; border: 1px solid var(--border-light); border-radius: 6px; display: flex; align-items: center; gap: 12px;';

            const iconClass = /\.(png|jpg|jpeg|gif|webp)$/i.test(storageName || displayName) ? 'fa-file-image' : 'fa-file-pdf';
            const label = financeDocumentTypeLabel(doc.document_type);
            const safeTitle = displayName.replace(/"/g, '&quot;');
            const viewDisabled = !storageName;
            const viewBtnStyle =
                'padding: 4px 8px; font-size: 11px; white-space: nowrap;' +
                (viewDisabled ? ' opacity: 0.55; pointer-events: none;' : '');

            card.innerHTML = `
                <div style="width: 32px; height: 32px; background: white; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: var(--primary);">
                    <i class="fas ${iconClass}"></i>
                </div>
                <div style="flex: 1; overflow: hidden;">
                    <div style="font-size: 11px; color: var(--text-tertiary); margin-bottom: 2px;">${label}</div>
                    <div style="font-size: 13px; font-weight: 600; color: var(--navy-800); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${safeTitle}">${displayName}</div>
                </div>
                <a href="${fileUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-outline"${viewDisabled ? ' aria-disabled="true"' : ''} style="${viewBtnStyle}">
                    <i class="fas fa-eye"></i> View
                </a>
            `;
            listElement.appendChild(card);
        });
    } catch (error) {
        console.error('Error fetching documents:', error);
        setMessage('Could not load reference documents. Check your connection and try again.', true);
    }
}

async function fetchFinanceStatus() {
    try {
        const payRes = await fetch(`${CONFIG.API_URL}/api/finance/shipping-payment/${enquiryId}`);
        if (payRes.ok) {
            const payments = await payRes.json();
            populatePaymentsTable(payments);
        }
    } catch (error) {
        console.error('Error fetching finance status:', error);
    }
}

function formatPaymentDates(value) {
    const dates = Array.isArray(value) ? value : (value ? [value] : []);
    const lastDate = dates.length ? dates[dates.length - 1] : null;
    return lastDate
        ? new Date(lastDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        : '—';
}

function formatUtrNumbers(value) {
    const utrs = Array.isArray(value) ? value : (value ? [value] : []);
    return utrs.filter(Boolean).join(', ') || '—';
}

function populatePaymentsTable(payments) {
    const tbody = document.getElementById('paymentsTableBody');
    const totalEl = document.getElementById('totalPaymentsAmount');
    if (!tbody) return;

    if (!payments || payments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="padding: 24px; text-align: center; color: var(--text-tertiary);">No payments recorded yet.</td></tr>';
        totalEl.textContent = '₹0.00';
        return;
    }

    tbody.innerHTML = '';
    let total = 0;

    payments.forEach(p => {
        total += p.amount;
        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid #f1f5f9';
        row.innerHTML = `
            <td style="padding: 12px;">
                <span style="padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: ${p.payment_type === 'Main' ? '#ecfdf5; color: #059669;' : '#eff6ff; color: #2563eb;'}">
                    ${p.payment_type}
                </span>
            </td>
            <td style="padding: 12px; color: var(--navy-700);">${p.description || 'Main Payment'}</td>
            <td style="padding: 12px; font-family: monospace; font-weight: 600;">${formatUtrNumbers(p.utr_number)}</td>
            <td style="padding: 12px;">${formatPaymentDates(p.payment_date)}</td>
            <td style="padding: 12px; text-align: right; font-weight: 700; color: var(--navy-800);">₹${p.amount.toLocaleString()}</td>
        `;
        tbody.appendChild(row);
    });

    totalEl.textContent = `₹${total.toLocaleString()}`;
}

/**
 * Modal Logic for Finance Details
 */
function openAdditionalChargeModal() {
    document.getElementById('additionalChargeModal').style.display = 'block';
    document.getElementById('add_charge_date').value = new Date().toISOString().split('T')[0];
}

function closeAdditionalChargeModal() {
    document.getElementById('additionalChargeModal').style.display = 'none';
    // Clear fields
    document.getElementById('add_charge_amount').value = '';
    document.getElementById('add_charge_desc').value = '';
}

function toggleDescription() {
    const type = document.getElementById('add_charge_type').value;
    document.getElementById('desc_group').style.display = type === 'Additional' ? 'block' : 'none';
}

function toggleQuickDesc() {
    const type = document.getElementById('quick_pay_type').value;
    document.getElementById('quick_desc_group').style.display = type === 'Additional' ? 'block' : 'none';
}

async function submitQuickPayment() {
    const type = document.getElementById('quick_pay_type').value;
    const desc = document.getElementById('quick_pay_desc').value;
    const amount = parseFloat(document.getElementById('quick_pay_amount').value);
    const date = document.getElementById('quick_pay_date').value;
    const utr = document.getElementById('quick_pay_utr').value;

    if (isNaN(amount) || amount <= 0 || !date || !utr) {
        alert('Please fill all required details correctly (Amount, Date, UTR)');
        return;
    }

    const payload = {
        enquiry_id: parseInt(enquiryId),
        utr_number: utr,
        payment_date: date,
        amount: amount,
        currency: 'INR',
        description: type === 'Main' ? 'Main Shipping Line Payment' : (desc || 'Additional Payment'),
        payment_type: type
    };

    try {
        const res = await fetch(`${CONFIG.API_URL}/api/finance/shipping-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            // Success!
            // Clear inputs
            document.getElementById('quick_pay_amount').value = '';
            document.getElementById('quick_pay_desc').value = '';
            document.getElementById('quick_pay_utr').value = '';

            // Refresh table
            await fetchFinanceStatus();
            if (typeof notifyFinanceParentRefresh === 'function') notifyFinanceParentRefresh({ section: 'payments', moveToCompleted: true });
        } else {
            const err = await res.json();
            alert('Error: ' + (err.detail || 'Failed to save record'));
        }
    } catch (e) {
        console.error(e);
        alert('Network error while saving payment');
    }
}

async function submitFinancialPayment() {
    const type = document.getElementById('add_charge_type').value;
    const desc = document.getElementById('add_charge_desc').value;
    const amount = parseFloat(document.getElementById('add_charge_amount').value);
    const date = document.getElementById('add_charge_date').value;
    const utr = document.getElementById('add_charge_utr').value;

    if (isNaN(amount) || amount <= 0 || !date || !utr) {
        alert('Please fill all required details correctly');
        return;
    }

    const payload = {
        enquiry_id: parseInt(enquiryId),
        utr_number: utr,
        payment_date: date,
        amount: amount,
        currency: 'INR',
        description: type === 'Main' ? 'Main Shipping Line Payment' : desc,
        payment_type: type
    };

    try {
        const res = await fetch(`${CONFIG.API_URL}/api/finance/shipping-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            closeAdditionalChargeModal();
            // Refresh table
            await fetchFinanceStatus();
            if (typeof notifyFinanceParentRefresh === 'function') notifyFinanceParentRefresh({ section: 'payments', moveToCompleted: true });
        } else {
            const err = await res.json();
            alert('Error: ' + (err.detail || 'Failed to save'));
        }
    } catch (e) {
        console.error(e);
        alert('Network error');
    }
}

function applyFinanceState(state) {
    const mapping = {
        'pay_line': { check: 'fin_payment_line', date: 'date_payment_line' },
        'inv_raised': { check: 'fin_invoice_raised', date: 'date_invoice_raised' },
        'pay_client': { check: 'fin_payment_client', date: 'date_payment_client' }
    };

    Object.entries(mapping).forEach(([key, fields]) => {
        if (state[key]) {
            document.getElementById(fields.check).checked = true;
            document.getElementById(fields.date).textContent = new Date(state[key]).toLocaleDateString();
        }
    });

    // Handle payment details
    if (state.utr_number) document.getElementById('pay_utr_number').value = state.utr_number;
    if (state.payment_date) {
        // Convert to YYYY-MM-DD for date input
        const d = new Date(state.payment_date);
        const dateStr = d.toISOString().split('T')[0];
        document.getElementById('pay_date').value = dateStr;
    }
    if (state.payment_amount) document.getElementById('pay_amount').value = state.payment_amount;

    // Handle invoice file preview if exists (logic would go here)
}

function updateFinDate(checkbox, dateId) {
    const dateEl = document.getElementById(dateId);
    if (checkbox.checked) {
        dateEl.textContent = new Date().toLocaleDateString();
    } else {
        dateEl.textContent = '-';
    }
}

function handleFileUpload(input, fileNameId) {
    if (input.files && input.files[0]) {
        document.getElementById(fileNameId).textContent = input.files[0].name;
    }
}


function handleLogout() {
    localStorage.removeItem('user');
    window.location.href = '/login';
}
