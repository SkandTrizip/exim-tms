// overhead-master.js
'use strict';

const API = (typeof CONFIG !== 'undefined' && CONFIG.API_URL) ? CONFIG.API_URL : '';
let editingOVId = null;

function getToken() { return localStorage.getItem('token') || ''; }
function getUsername() {
    try {
        const raw = localStorage.getItem('user') || '';
        if (!raw) return '';
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'string') return parsed;
        return parsed.username || '';
    } catch (e) {
        return localStorage.getItem('user') || '';
    }
}
function authHeaders() {
    const t = getToken();
    return t ? { 'Authorization': `Bearer ${t}` } : {};
}
function isEmbeddedMaster() {
    return document.documentElement.classList.contains('embedded-mode');
}
function notifyMasterSaved(entity) {
    if (isEmbeddedMaster() && window.parent !== window) {
        window.parent.postMessage({ type: 'master-saved', entity, updated: !!editingOVId }, '*');
    }
}
function notifyMasterError(message) {
    if (isEmbeddedMaster() && window.parent !== window) {
        window.parent.postMessage({ type: 'master-save-error', message }, '*');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const embedded = params.get('embedded') === '1';
    const isViewMode = params.get('view') === '1';

    if (embedded) {
        document.documentElement.classList.add('embedded-mode');
        document.body.classList.add('embedded-mode', 'sl-embedded');
    }

    document.getElementById('overheadForm').addEventListener('submit', handleSubmit);

    await Promise.all([loadJobOptions(), loadShippingOptions(), loadPayeeOptions()]);

    const id = params.get('id');
    if (id) {
        await editOverhead(parseInt(id, 10));
        if (isViewMode) applyEmbeddedViewMode();
    }
});

let jobOptions = [];       // { id, label }
let shippingOptions = [];  // names
let payeeOptions = [];     // { id, name }

function jobLabel(j) {
    return `${j.enquiry_number || ('Job #' + j.id)}${j.client_name ? ' — ' + j.client_name : ''}`;
}

async function loadJobOptions() {
    const dl = document.getElementById('ov_job_list');
    try {
        const res = await fetch(`${API}/api/enquiry/`, { headers: authHeaders() });
        if (!res.ok) return;
        const jobs = await res.json();
        jobOptions = (Array.isArray(jobs) ? jobs : []).map(j => ({ id: j.id, label: jobLabel(j) }));
        if (dl) dl.innerHTML = jobOptions.map(j => `<option value="${j.label.replace(/"/g, '&quot;')}"></option>`).join('');
    } catch (e) {
        console.error('Failed to load jobs', e);
    }
}

async function loadShippingOptions() {
    const dl = document.getElementById('ov_shipping_list');
    try {
        const res = await fetch(`${API}/api/shipping-lines/`, { headers: authHeaders() });
        if (!res.ok) return;
        const lines = await res.json();
        const verified = (Array.isArray(lines) ? lines : []).filter(l => (l.status || '').toLowerCase() === 'verified');
        const list = verified.length ? verified : lines;
        shippingOptions = list.map(l => l.shipping_line_name).filter(Boolean);
        if (dl) dl.innerHTML = shippingOptions.map(n => `<option value="${n.replace(/"/g, '&quot;')}"></option>`).join('');
    } catch (e) {
        console.error('Failed to load shipping lines', e);
    }
}

async function loadPayeeOptions() {
    const dl = document.getElementById('ov_payee_list');
    try {
        const res = await fetch(`${API}/api/payees/`, { headers: authHeaders() });
        if (!res.ok) return;
        const payees = await res.json();
        const verified = (Array.isArray(payees) ? payees : []).filter(p => (p.status || '').toLowerCase() === 'verified');
        const list = verified.length ? verified : payees;
        payeeOptions = list.map(p => ({ id: p.id, name: p.payee_name })).filter(p => p.name);
        if (dl) dl.innerHTML = payeeOptions.map(p => `<option value="${p.name.replace(/"/g, '&quot;')}"></option>`).join('');
    } catch (e) {
        console.error('Failed to load payees', e);
    }
}

function onJobSearchInput() {
    const input = document.getElementById('ov_enquiry_search');
    const hidden = document.getElementById('ov_enquiry');
    const payToGroup = document.getElementById('ov_payto_group');
    const match = jobOptions.find(j => j.label === (input.value || '').trim());
    hidden.value = match ? String(match.id) : '';
    // Reveal Pay/Bill To and Cost Treatment only once a valid job is chosen.
    if (payToGroup) payToGroup.style.display = match ? '' : 'none';
    const impactGroup = document.getElementById('ov_impact_group');
    if (impactGroup) impactGroup.style.display = match ? '' : 'none';
    if (!match) {
        const s = document.getElementById('ov_shipping_group');
        const p = document.getElementById('ov_payee_group');
        if (s) s.style.display = 'none';
        if (p) p.style.display = 'none';
    }
}

function onPayToTypeChange() {
    const type = document.getElementById('ov_pay_to_type').value;
    const shipGroup = document.getElementById('ov_shipping_group');
    const payeeGroup = document.getElementById('ov_payee_group');
    if (shipGroup) shipGroup.style.display = type === 'shipping_line' ? '' : 'none';
    if (payeeGroup) payeeGroup.style.display = type === 'payee' ? '' : 'none';
}
window.onJobSearchInput = onJobSearchInput;
window.onPayToTypeChange = onPayToTypeChange;

function openAddPayee() {
    window.open('/payee-master', '_blank');
}
window.openAddPayee = openAddPayee;

function applyEmbeddedViewMode() {
    document.querySelectorAll('#overheadForm input, #overheadForm select, #overheadForm textarea').forEach((el) => {
        if (el.type === 'hidden') return;
        el.disabled = true;
        if (el.tagName !== 'SELECT' && el.type !== 'checkbox') el.readOnly = true;
    });
    const saveBtn = document.getElementById('saveOVBtn');
    if (saveBtn) saveBtn.style.display = 'none';
    const adminBar = document.getElementById('adminActionBar');
    if (adminBar) adminBar.style.display = 'none';
}

function val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
}
function numOrNull(id) {
    const v = val(id);
    if (v === '') return null;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
}

async function handleSubmit(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();

    const name = val('ov_name');
    if (!name) {
        showModal('warning', 'Missing Field', 'Overhead Name is required.');
        notifyMasterError('Overhead Name is required.');
        return;
    }

    const jobId = val('ov_enquiry');
    const amount = numOrNull('ov_default_amount');
    if (jobId && (amount == null || amount <= 0)) {
        const msg = 'Enter an amount to book this overhead against the selected job.';
        showModal('warning', 'Amount Required', msg);
        notifyMasterError(msg);
        return;
    }

    const btn = document.getElementById('saveOVBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${editingOVId ? 'Updating' : 'Saving'}…`;
    }

    const payload = {
        overhead_name: name,
        category: val('ov_category'),
        description: val('ov_description'),
        default_currency: val('ov_currency') || 'INR',
        default_amount: amount,
    };
    Object.keys(payload).forEach(k => { if (payload[k] === '' || payload[k] === null) delete payload[k]; });

    try {
        const url = editingOVId ? `${API}/api/overheads/${editingOVId}` : `${API}/api/overheads/`;
        const method = editingOVId ? 'PUT' : 'POST';
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            const msg = err.detail || 'Could not save overhead.';
            showModal('error', 'Save Failed', msg);
            notifyMasterError(msg);
            return;
        }

        const savedItem = await res.json().catch(() => null);

        // When linked to a job, also book it as a payable line item in Finance.
        if (!editingOVId && jobId && savedItem) {
            const bookPayload = {
                enquiry_id: parseInt(jobId, 10),
                overhead_id: savedItem.id,
                overhead_name: savedItem.overhead_name,
                description: payload.description || null,
                amount,
                currency: payload.default_currency || 'INR',
                status: 'to_be_booked',
                cost_impact: val('ov_cost_impact') || 'add_to_shipping_line',
                created_by: getUsername() || 'finance',
            };

            const payToType = val('ov_pay_to_type');
            if (payToType === 'shipping_line') {
                bookPayload.pay_to_type = 'shipping_line';
                bookPayload.pay_to_name = val('ov_shipping_search') || null;
            } else if (payToType === 'payee') {
                bookPayload.pay_to_type = 'payee';
                const typed = val('ov_payee_search');
                const match = payeeOptions.find(p => p.name === typed);
                if (match) {
                    bookPayload.payee_id = match.id;
                } else if (typed) {
                    // No matching payee — create it in the Payee Master on save.
                    bookPayload.new_payee = { payee_name: typed };
                }
            }

            try {
                const bookRes = await fetch(`${API}/api/finance/overhead-payment`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...authHeaders() },
                    body: JSON.stringify(bookPayload)
                });
                if (!bookRes.ok) {
                    const bookErrBody = await bookRes.json().catch(() => ({}));
                    const bookMsg = bookErrBody.detail
                        || 'The overhead was saved to the master, but could not be booked against the selected job.';
                    if (isEmbeddedMaster()) {
                        notifyMasterError(bookMsg);
                    } else {
                        showModal('error', 'Booking Failed', bookMsg);
                    }
                    return;
                }
            } catch (bookErr) {
                console.error('Overhead saved but booking against job failed', bookErr);
                const bookMsg = 'The overhead was saved, but a network error prevented booking it against the job.';
                if (isEmbeddedMaster()) {
                    notifyMasterError(bookMsg);
                } else {
                    showModal('error', 'Booking Failed', bookMsg);
                }
                return;
            }
        }

        if (isEmbeddedMaster()) {
            notifyMasterSaved('overhead');
            return;
        }

        showModal('success', `Overhead ${editingOVId ? 'Updated' : 'Submitted'}!`,
            editingOVId ? 'The overhead has been updated.'
                : (jobId ? 'The overhead was saved and booked against the selected job.' : 'Your submission is pending admin verification.'),
            () => { window.location.href = '/#masters-overheads'; });
    } catch (err) {
        showModal('error', 'Network Error', err.message);
        notifyMasterError(err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = editingOVId ? '<i class="fas fa-save"></i> Update' : '<i class="fas fa-save"></i> Submit';
        }
    }
}

async function editOverhead(id) {
    try {
        const res = await fetch(`${API}/api/overheads/${id}`, { headers: authHeaders() });
        if (!res.ok) throw new Error('Failed to load overhead details.');
        const ov = await res.json();
        editingOVId = ov.id;

        const fields = {
            'ov_name': 'overhead_name',
            'ov_category': 'category',
            'ov_description': 'description',
            'ov_currency': 'default_currency',
            'ov_default_amount': 'default_amount',
        };
        for (const [docId, objKey] of Object.entries(fields)) {
            const el = document.getElementById(docId);
            if (el) el.value = ov[objKey] != null ? ov[objKey] : '';
        }

        // Job link only applies when creating a new overhead.
        const jobSel = document.getElementById('ov_enquiry');
        if (jobSel) {
            const jobGroup = jobSel.closest('.form-group');
            if (jobGroup) jobGroup.style.display = 'none';
            const jobLabel = jobSel.closest('.card')?.querySelector('.section-label');
            if (jobLabel && jobLabel.textContent.includes('Attach to Job')) jobLabel.style.display = 'none';
        }

        showStatusBanner(ov);
        checkAdminAndShowActions(id, ov.status);

        const saveBtn = document.getElementById('saveOVBtn');
        if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-save"></i> Update';
    } catch (e) {
        console.error(e);
        showModal('error', 'Error', 'Could not load overhead details for editing.');
    }
}

function showStatusBanner(ov) {
    const colors = {
        pending: { bg: '#FEF3C7', color: '#92400E', icon: 'fa-clock', label: 'Pending Verification' },
        verified: { bg: '#D1FAE5', color: '#065F46', icon: 'fa-check-circle', label: 'Verified' },
        rejected: { bg: '#FEE2E2', color: '#991B1B', icon: 'fa-times-circle', label: 'Rejected' },
    };
    const s = colors[ov.status] || colors.pending;
    const banner = document.getElementById('statusBanner');
    if (!banner) return;
    banner.style.background = s.bg;
    banner.style.color = s.color;
    banner.style.display = 'flex';
    banner.innerHTML = `
        <i class="fas ${s.icon}" style="font-size:1.2rem;"></i>
        <strong style="font-size:15px;">${s.label}</strong>
        ${ov.submitted_by ? `<span style="opacity:0.75;font-size:13px;">Submitted by: <strong>${ov.submitted_by}</strong></span>` : ''}
        ${ov.verified_by ? `<span style="opacity:0.75;font-size:13px;">Verified by: <strong>${ov.verified_by}</strong></span>` : ''}
    `;
}

function checkAdminAndShowActions(id, currentStatus) {
    const adminBar = document.getElementById('adminActionBar');
    if (!adminBar || !getToken()) return;
    const isAdmin = CONFIG && CONFIG.adminUsers &&
        CONFIG.adminUsers.map(u => u.toLowerCase()).includes(getUsername().toLowerCase());
    if (!isAdmin || currentStatus === 'verified') return;
    adminBar.style.display = 'flex';
    document.getElementById('verifyBtn').addEventListener('click', () => verifyRecord(id));
    document.getElementById('rejectBtn').addEventListener('click', () => rejectRecord(id));
}

async function verifyRecord(id) {
    const res = await fetch(`${API}/api/overheads/${id}/verify`, { method: 'PATCH', headers: authHeaders() });
    if (res.ok) showModal('success', 'Verified!', 'Overhead has been verified.', () => location.reload());
    else { const err = await res.json().catch(() => ({})); showModal('error', 'Error', err.detail || 'Could not verify.'); }
}
async function rejectRecord(id) {
    const res = await fetch(`${API}/api/overheads/${id}/reject`, { method: 'PATCH', headers: authHeaders() });
    if (res.ok) showModal('warning', 'Rejected', 'Overhead marked as rejected.', () => location.reload());
    else { const err = await res.json().catch(() => ({})); showModal('error', 'Error', err.detail || 'Could not reject.'); }
}

async function saveEmbeddedOverhead() {
    await handleSubmit({ preventDefault() {} });
}
window.saveEmbeddedOverhead = saveEmbeddedOverhead;

// ── Modal ─────────────────────────────────────────────────────────────────────
let _cb = null;
function showModal(type, title, message, callback) {
    const icons = {
        success: '<i class="fas fa-check-circle" style="color:var(--success);font-size:2.5rem;"></i>',
        error: '<i class="fas fa-times-circle" style="color:var(--error);font-size:2.5rem;"></i>',
        warning: '<i class="fas fa-exclamation-triangle" style="color:var(--warning);font-size:2.5rem;"></i>',
    };
    document.getElementById('modalIcon').innerHTML = icons[type] || icons.success;
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalMessage').textContent = message;
    document.getElementById('customModal').classList.add('active');
    _cb = callback || null;
}
function closeModal() {
    document.getElementById('customModal').classList.remove('active');
    if (_cb) { _cb(); _cb = null; }
}
window.closeModal = closeModal;
