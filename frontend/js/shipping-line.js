// shipping-line.js
'use strict';

const API = (typeof CONFIG !== 'undefined' && CONFIG.API_URL) ? CONFIG.API_URL : '';
let editingSLId = null;

// ── Helpers ───────────────────────────────────────────────────────────────────
function getToken() { return localStorage.getItem('token') || ''; }
function getUsername() {
    try {
        const raw = localStorage.getItem('user') || '';
        if (!raw) return '';
        const parsed = JSON.parse(raw);
        // Stored as plain string: localStorage.setItem('user', data.username)
        if (typeof parsed === 'string') return parsed;
        // Stored as object: { username: '...' }
        return parsed.username || '';
    } catch (e) {
        // If JSON.parse fails (shouldn't with a plain string), return raw value
        return localStorage.getItem('user') || '';
    }
}

function authHeaders() {
    const t = getToken();
    return t ? { 'Authorization': `Bearer ${t}` } : {};
}

// ── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('shippingLineForm').addEventListener('submit', handleSubmit);

    // If opened with ?id=N it's a view/verify page
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (id) {
        loadAndShowRecord(parseInt(id));
    }

    // Load existing items into table
    loadShippingLines();
});

// ── Tabs ──────────────────────────────────────────────────────────────────────
function switchTab(n) {
    [1, 2].forEach(i => {
        const tab = document.getElementById(`tab${i}`);
        const panel = document.getElementById(`panel${i}`);
        if (tab) tab.classList.toggle('active', i === n);
        if (panel) panel.classList.toggle('active', i === n);
    });
    if (n === 2) loadShippingLines();
}
window.switchTab = switchTab;

// ── File select ───────────────────────────────────────────────────────────────
function handleFileSelect(input, boxId, nameId) {
    const box = document.getElementById(boxId);
    const name = document.getElementById(nameId);
    if (input.files && input.files[0]) {
        box.classList.add('has-file');
        name.textContent = input.files[0].name;
    } else {
        box.classList.remove('has-file');
        name.textContent = '';
    }
}
window.handleFileSelect = handleFileSelect;

// ── Submit form ───────────────────────────────────────────────────────────────
async function handleSubmit(e) {
    e.preventDefault();

    const name = val('sl_name');
    const primaryContact = val('sl_primary_contact_person');

    if (!name) { showModal('warning', 'Missing Field', 'Shipping Line Name is required.'); return; }
    if (!primaryContact) { showModal('warning', 'Missing Field', 'Primary Contact Person is required.'); return; }

    const btn = document.getElementById('saveSLBtn');
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${editingSLId ? 'Updating' : 'Saving'}…`;

    const payload = {
        shipping_line_name: name,
        office_location: val('sl_office_location'),
        office_address: val('sl_office_address'),
        gst_number: val('sl_gst_number'),
        pan_number: val('sl_pan_number'),
        primary_contact_person: primaryContact,
        primary_contact_number: val('sl_primary_contact_number'),
        primary_poc_designation: val('sl_primary_poc_designation'),
        secondary_contact_person: val('sl_secondary_contact_person'),
        secondary_contact_number: val('sl_secondary_contact_number'),
        secondary_email: val('sl_secondary_email'),
        beneficiary_name: val('sl_beneficiary_name'),
        account_number: val('sl_account_number'),
        ifsc_code: val('sl_ifsc_code'),
        bank: val('sl_bank'),
        bank_branch: val('sl_bank_branch'),
    };
    Object.keys(payload).forEach(k => { if (!payload[k]) delete payload[k]; });

    try {
        const url = editingSLId
            ? `${API}/api/shipping-lines/${editingSLId}`
            : `${API}/api/shipping-lines/`;
        const method = editingSLId ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const err = await res.json();
            showModal('error', 'Save Failed', err.detail || 'Could not save Shipping Line.');
            return;
        }

        const savedItem = await res.json();

        // Upload docs if selected
        const gstFile = document.getElementById('gst_doc').files[0];
        const panFile = document.getElementById('pan_doc').files[0];
        const chequeFile = document.getElementById('cheque_doc').files[0];
        const tdsFile = document.getElementById('tds_doc').files[0];

        if (gstFile || panFile || chequeFile || tdsFile) {
            const formData = new FormData();
            if (gstFile) formData.append('gst_doc', gstFile);
            if (panFile) formData.append('pan_doc', panFile);
            if (chequeFile) formData.append('cheque_doc', chequeFile);
            if (tdsFile) formData.append('tds_doc', tdsFile);

            await fetch(`${API}/api/shipping-lines/${savedItem.id}/upload-docs`, {
                method: 'POST',
                headers: authHeaders(),
                body: formData
            });
        }

        showModal('success', `Shipping Line ${editingSLId ? 'Updated' : 'Submitted'}!`,
            editingSLId ? 'The shipping line has been updated.' : 'Your submission is pending admin verification.',
            () => {
                document.getElementById('shippingLineForm').reset();
                editingSLId = null;
                document.getElementById('saveSLBtn').innerHTML = '<i class="fas fa-save"></i> Submit';
                document.getElementById('statusBanner').style.display = 'none';
                document.getElementById('adminActionBar').style.display = 'none';
                // remove ?id from url if exists
                if (window.history.replaceState) {
                    window.history.replaceState(null, null, window.location.pathname);
                }
                switchTab(2);
            }
        );

    } catch (err) {
        showModal('error', 'Network Error', err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = editingSLId
            ? '<i class="fas fa-save"></i> Update'
            : '<i class="fas fa-save"></i> Submit';
    }
}

// ── Load record for admin view ────────────────────────────────────────────────
async function loadAndShowRecord(id) {
    try {
        const res = await fetch(`${API}/api/shipping-lines/${id}`, {
            headers: authHeaders()
        });
        if (!res.ok) return;
        const sl = await res.json();

        // Show status banner
        showStatusBanner(sl);

        // Show admin action bar if admin
        checkAdminAndShowActions(id, sl.status);

    } catch (e) { console.error(e); }
}

function showStatusBanner(sl) {
    const colors = {
        pending: { bg: '#FEF3C7', color: '#92400E', icon: 'fa-clock', label: 'Pending Verification' },
        verified: { bg: '#D1FAE5', color: '#065F46', icon: 'fa-check-circle', label: 'Verified' },
        rejected: { bg: '#FEE2E2', color: '#991B1B', icon: 'fa-times-circle', label: 'Rejected' },
    };
    const s = colors[sl.status] || colors.pending;
    const banner = document.getElementById('statusBanner');
    if (!banner) return;
    banner.style.background = s.bg;
    banner.style.color = s.color;
    banner.style.display = 'flex';
    banner.innerHTML = `
        <i class="fas ${s.icon}" style="font-size:1.2rem;"></i>
        <strong style="font-size:15px;">${s.label}</strong>
        ${sl.submitted_by ? `<span style="opacity:0.75;font-size:13px;">Submitted by: <strong>${sl.submitted_by}</strong></span>` : ''}
        ${sl.verified_by ? `<span style="opacity:0.75;font-size:13px;">Verified by: <strong>${sl.verified_by}</strong></span>` : ''}
    `;
}

async function checkAdminAndShowActions(id, currentStatus) {
    // Check if the logged-in user is admin by trying a protected endpoint
    const adminBar = document.getElementById('adminActionBar');
    if (!adminBar) return;
    if (!getToken()) return;

    // We check role by calling who-am-i or just show actions for admins stored in ADMIN_USERS
    // Simpler: try calling verify with a dry check — but best is to expose /me
    // For now we show admin bar if user is in CONFIG.adminUsers (passed from server)
    const isAdmin = CONFIG && CONFIG.adminUsers &&
        CONFIG.adminUsers.map(u => u.toLowerCase()).includes(getUsername().toLowerCase());

    if (!isAdmin) return;
    if (currentStatus === 'verified') return;

    adminBar.style.display = 'flex';
    document.getElementById('verifyBtn').addEventListener('click', () => verifyRecord(id));
    document.getElementById('rejectBtn').addEventListener('click', () => rejectRecord(id));
}

async function verifyRecord(id) {
    const res = await fetch(`${API}/api/shipping-lines/${id}/verify`, {
        method: 'PATCH',
        headers: authHeaders()
    });
    if (res.ok) {
        showModal('success', 'Verified!', 'Shipping line has been verified.', () => location.reload());
    } else {
        const err = await res.json();
        showModal('error', 'Error', err.detail || 'Could not verify.');
    }
}

async function rejectRecord(id) {
    const res = await fetch(`${API}/api/shipping-lines/${id}/reject`, {
        method: 'PATCH',
        headers: authHeaders()
    });
    if (res.ok) {
        showModal('warning', 'Rejected', 'Shipping line marked as rejected.', () => location.reload());
    } else {
        const err = await res.json();
        showModal('error', 'Error', err.detail || 'Could not reject.');
    }
}

// ── Load Existing Shipping Lines ──────────────────────────────────────────────
async function loadShippingLines() {
    const tbody = document.getElementById('shippingLinesTableBody');
    if (!tbody) return;
    try {
        const res = await fetch(`${API}/api/shipping-lines/`, {
            headers: authHeaders()
        });
        if (!res.ok) throw new Error('Failed to fetch shipping lines');
        const lines = await res.json();

        if (lines.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="padding:12px;text-align:center;color:var(--text-tertiary);">No shipping lines found.</td></tr>';
            return;
        }

        const isAdmin = CONFIG && CONFIG.adminUsers &&
            CONFIG.adminUsers.map(u => u.toLowerCase()).includes(getUsername().toLowerCase());

        const statusColors = {
            pending: '<span style="background:#FEF3C7;color:#92400E;padding:4px 8px;border-radius:12px;font-size:11px;font-weight:600;"><i class="fas fa-clock"></i> Pending</span>',
            verified: '<span style="background:#D1FAE5;color:#065F46;padding:4px 8px;border-radius:12px;font-size:11px;font-weight:600;"><i class="fas fa-check"></i> Verified</span>',
            rejected: '<span style="background:#FEE2E2;color:#991B1B;padding:4px 8px;border-radius:12px;font-size:11px;font-weight:600;"><i class="fas fa-times"></i> Rejected</span>'
        };

        tbody.innerHTML = lines.map(sl => `
            <tr style="border-bottom:1px solid var(--border-light);">
                <td style="padding:12px;font-weight:600;color:var(--navy-800);">${sl.shipping_line_name || '—'}</td>
                <td style="padding:12px;color:var(--text-secondary);">${sl.office_location || '—'}</td>
                <td style="padding:12px;">${sl.primary_contact_person || '—'}</td>
                <td style="padding:12px;">${statusColors[sl.status] || sl.status}</td>
                <td style="padding:12px;text-align:center;">
                    <button class="btn" style="padding:6px 14px;font-size:12px;font-weight:600;background:var(--gray-100);color:var(--navy-700);border-radius:6px;border:1px solid var(--border-medium);" onclick="editShippingLine(${sl.id})">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="btn" style="padding:6px 14px;font-size:12px;font-weight:600;background:var(--navy-50);color:var(--navy-700);border-radius:6px;border:1px solid var(--navy-100);margin-left:8px;" onclick="openSummary(${sl.id})">
                        <i class="fas fa-eye"></i> View
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="5" style="padding:12px;text-align:center;color:var(--error);">Error loading shipping lines.</td></tr>';
    }
}

// ── Edit Shipping Line ────────────────────────────────────────────────────────
async function editShippingLine(id) {
    try {
        const res = await fetch(`${API}/api/shipping-lines/${id}`, {
            headers: authHeaders()
        });
        if (!res.ok) throw new Error('Failed to load shipping line details.');
        const sl = await res.json();

        editingSLId = sl.id;

        // Populate form
        const fields = {
            'sl_name': 'shipping_line_name',
            'sl_office_location': 'office_location',
            'sl_office_address': 'office_address',
            'sl_gst_number': 'gst_number',
            'sl_pan_number': 'pan_number',
            'sl_primary_contact_person': 'primary_contact_person',
            'sl_primary_contact_number': 'primary_contact_number',
            'sl_primary_poc_designation': 'primary_poc_designation',
            'sl_secondary_contact_person': 'secondary_contact_person',
            'sl_secondary_contact_number': 'secondary_contact_number',
            'sl_secondary_email': 'secondary_email',
            'sl_beneficiary_name': 'beneficiary_name',
            'sl_account_number': 'account_number',
            'sl_ifsc_code': 'ifsc_code',
            'sl_bank': 'bank',
            'sl_bank_branch': 'bank_branch'
        };

        for (const [docId, objKey] of Object.entries(fields)) {
            const el = document.getElementById(docId);
            if (el) el.value = sl[objKey] || '';
        }

        // Show banner and actions inside the form tab
        showStatusBanner(sl);
        checkAdminAndShowActions(id, sl.status);

        // Update button text
        document.getElementById('saveSLBtn').innerHTML = '<i class="fas fa-save"></i> Update';

        switchTab(1);

    } catch (e) {
        console.error(e);
        showModal('error', 'Error', 'Could not load shipping line details for editing.');
    }
}

// ── Summary View for Admin ───────────────────────────────────────────────────
async function openSummary(id) {
    try {
        const res = await fetch(`${API}/api/shipping-lines/${id}`, {
            headers: authHeaders()
        });
        if (!res.ok) throw new Error('Failed to load summary');
        const sl = await res.json();

        const content = document.getElementById('summaryContent');
        document.getElementById('summaryTitle').textContent = sl.shipping_line_name || 'Shipping Line Summary';

        const sections = [
            {
                title: 'Company Basics',
                icon: 'building',
                fields: [
                    ['Office Location', sl.office_location],
                    ['Office Address', sl.office_address],
                    ['GST Number', sl.gst_number],
                    ['PAN Number', sl.pan_number]
                ]
            },
            {
                title: 'Primary Contact',
                icon: 'user',
                fields: [
                    ['Name', sl.primary_contact_person],
                    ['Number', sl.primary_contact_number],
                    ['Designation', sl.primary_poc_designation]
                ]
            },
            {
                title: 'Secondary Contact',
                icon: 'users',
                fields: [
                    ['Name', sl.secondary_contact_person],
                    ['Number', sl.secondary_contact_number],
                    ['Email', sl.secondary_email]
                ]
            },
            {
                title: 'Banking Details',
                icon: 'university',
                fields: [
                    ['Beneficiary', sl.beneficiary_name],
                    ['Account No', sl.account_number],
                    ['IFSC Code', sl.ifsc_code],
                    ['Bank Name', sl.bank],
                    ['Branch', sl.bank_branch]
                ]
            }
        ];

        content.innerHTML = sections.map(s => `
            <div style="background:var(--gray-50); padding:20px; border-radius:var(--radius-lg); border:1px solid var(--border-light);">
                <h4 style="margin:0 0 16px; color:var(--navy-700); display:flex; align-items:center; gap:8px; font-size:14px; text-transform:uppercase; letter-spacing:0.04em;">
                    <i class="fas fa-${s.icon}" style="color:var(--coral-500);"></i> ${s.title}
                </h4>
                <div style="display:grid; gap:12px;">
                    ${s.fields.map(([label, val]) => `
                        <div>
                            <div style="font-size:11px; color:var(--text-tertiary); margin-bottom:2px;">${label}</div>
                            <div style="font-size:14px; color:var(--navy-800); font-weight:500;">${val || '—'}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');

        document.getElementById('summaryModal').classList.add('active');

        // Admin action in Summary
        const isAdmin = CONFIG && CONFIG.adminUsers &&
            CONFIG.adminUsers.map(u => u.toLowerCase()).includes(getUsername().toLowerCase());

        const sVerifyBtn = document.getElementById('summaryVerifyBtn');
        if (sVerifyBtn) {
            if (isAdmin && sl.status !== 'verified') {
                sVerifyBtn.style.display = 'block';
                sVerifyBtn.onclick = async () => {
                    await verifyRecord(sl.id);
                    closeSummaryModal();
                };
            } else {
                sVerifyBtn.style.display = 'none';
            }
        }

    } catch (e) {
        console.error(e);
        showModal('error', 'Error', 'Could not load summary.');
    }
}

function closeSummaryModal() {
    document.getElementById('summaryModal').classList.remove('active');
}
window.openSummary = openSummary;
window.closeSummaryModal = closeSummaryModal;

// ── Helpers ───────────────────────────────────────────────────────────────────
function val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
}

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
