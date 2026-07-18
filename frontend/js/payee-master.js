// payee-master.js
'use strict';

const API = (typeof CONFIG !== 'undefined' && CONFIG.API_URL) ? CONFIG.API_URL : '';
let editingPYId = null;

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
        window.parent.postMessage({ type: 'master-saved', entity, updated: !!editingPYId }, '*');
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

    document.getElementById('payeeForm').addEventListener('submit', handleSubmit);

    const id = params.get('id');
    if (id) {
        await editPayee(parseInt(id, 10));
        if (isViewMode) applyEmbeddedViewMode();
    }
});

function applyEmbeddedViewMode() {
    document.querySelectorAll('#payeeForm input, #payeeForm select, #payeeForm textarea').forEach((el) => {
        if (el.type === 'hidden') return;
        el.disabled = true;
        if (el.tagName !== 'SELECT') el.readOnly = true;
    });
    const saveBtn = document.getElementById('savePYBtn');
    if (saveBtn) saveBtn.style.display = 'none';
    const adminBar = document.getElementById('adminActionBar');
    if (adminBar) adminBar.style.display = 'none';
}

function val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
}

async function handleSubmit(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();

    const name = val('py_name');
    if (!name) {
        showModal('warning', 'Missing Field', 'Payee Name is required.');
        notifyMasterError('Payee Name is required.');
        return;
    }

    const btn = document.getElementById('savePYBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${editingPYId ? 'Updating' : 'Saving'}…`;
    }

    const payload = {
        payee_name: name,
        payee_type: val('py_type') || 'Company',
        office_location: val('py_office_location'),
        address: val('py_address'),
        gst_number: val('py_gst_number'),
        pan_number: val('py_pan_number'),
        contact_person: val('py_contact_person'),
        contact_number: val('py_contact_number'),
        email: val('py_email'),
        beneficiary_name: val('py_beneficiary_name'),
        account_number: val('py_account_number'),
        ifsc_code: val('py_ifsc_code'),
        bank: val('py_bank'),
        bank_branch: val('py_bank_branch'),
    };
    Object.keys(payload).forEach(k => { if (!payload[k]) delete payload[k]; });

    try {
        const url = editingPYId ? `${API}/api/payees/${editingPYId}` : `${API}/api/payees/`;
        const method = editingPYId ? 'PUT' : 'POST';
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            const msg = err.detail || 'Could not save payee.';
            showModal('error', 'Save Failed', msg);
            notifyMasterError(msg);
            return;
        }

        if (isEmbeddedMaster()) {
            notifyMasterSaved('payee');
            return;
        }

        showModal('success', `Payee ${editingPYId ? 'Updated' : 'Submitted'}!`,
            editingPYId ? 'The payee has been updated.' : 'Your submission is pending admin verification.',
            () => { window.location.href = '/#masters-payees'; });
    } catch (err) {
        showModal('error', 'Network Error', err.message);
        notifyMasterError(err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = editingPYId ? '<i class="fas fa-save"></i> Update' : '<i class="fas fa-save"></i> Submit';
        }
    }
}

async function editPayee(id) {
    try {
        const res = await fetch(`${API}/api/payees/${id}`, { headers: authHeaders() });
        if (!res.ok) throw new Error('Failed to load payee details.');
        const py = await res.json();
        editingPYId = py.id;

        const fields = {
            'py_name': 'payee_name',
            'py_type': 'payee_type',
            'py_office_location': 'office_location',
            'py_address': 'address',
            'py_gst_number': 'gst_number',
            'py_pan_number': 'pan_number',
            'py_contact_person': 'contact_person',
            'py_contact_number': 'contact_number',
            'py_email': 'email',
            'py_beneficiary_name': 'beneficiary_name',
            'py_account_number': 'account_number',
            'py_ifsc_code': 'ifsc_code',
            'py_bank': 'bank',
            'py_bank_branch': 'bank_branch',
        };
        for (const [docId, objKey] of Object.entries(fields)) {
            const el = document.getElementById(docId);
            if (el) el.value = py[objKey] != null ? py[objKey] : '';
        }

        showStatusBanner(py);
        checkAdminAndShowActions(id, py.status);

        const saveBtn = document.getElementById('savePYBtn');
        if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-save"></i> Update';
    } catch (e) {
        console.error(e);
        showModal('error', 'Error', 'Could not load payee details for editing.');
    }
}

function showStatusBanner(py) {
    const colors = {
        pending: { bg: '#FEF3C7', color: '#92400E', icon: 'fa-clock', label: 'Pending Verification' },
        verified: { bg: '#D1FAE5', color: '#065F46', icon: 'fa-check-circle', label: 'Verified' },
        rejected: { bg: '#FEE2E2', color: '#991B1B', icon: 'fa-times-circle', label: 'Rejected' },
    };
    const s = colors[py.status] || colors.pending;
    const banner = document.getElementById('statusBanner');
    if (!banner) return;
    banner.style.background = s.bg;
    banner.style.color = s.color;
    banner.style.display = 'flex';
    banner.innerHTML = `
        <i class="fas ${s.icon}" style="font-size:1.2rem;"></i>
        <strong style="font-size:15px;">${s.label}</strong>
        ${py.submitted_by ? `<span style="opacity:0.75;font-size:13px;">Submitted by: <strong>${py.submitted_by}</strong></span>` : ''}
        ${py.verified_by ? `<span style="opacity:0.75;font-size:13px;">Verified by: <strong>${py.verified_by}</strong></span>` : ''}
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
    const res = await fetch(`${API}/api/payees/${id}/verify`, { method: 'PATCH', headers: authHeaders() });
    if (res.ok) showModal('success', 'Verified!', 'Payee has been verified.', () => location.reload());
    else { const err = await res.json().catch(() => ({})); showModal('error', 'Error', err.detail || 'Could not verify.'); }
}
async function rejectRecord(id) {
    const res = await fetch(`${API}/api/payees/${id}/reject`, { method: 'PATCH', headers: authHeaders() });
    if (res.ok) showModal('warning', 'Rejected', 'Payee marked as rejected.', () => location.reload());
    else { const err = await res.json().catch(() => ({})); showModal('error', 'Error', err.detail || 'Could not reject.'); }
}

async function saveEmbeddedPayee() {
    await handleSubmit({ preventDefault() {} });
}
window.saveEmbeddedPayee = saveEmbeddedPayee;

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
