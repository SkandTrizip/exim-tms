// client-master.js – Add Client wizard logic
'use strict';

const API = (typeof CONFIG !== 'undefined' && CONFIG.API_URL) ? CONFIG.API_URL : '';

// ── State ────────────────────────────────────────────────────────────────────
let savedOriginId = null;   // set after saving Step 1 or picking from dropdown
let allOrigins = [];        // fetched origins list
let editingMasterId = null; // tracking existing master for edit

// ── Helpers ───────────────────────────────────────────────────────────────────
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
    const t = localStorage.getItem('token') || '';
    return t ? { 'Authorization': `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

// ── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await loadOrigins();

    document.getElementById('originForm').addEventListener('submit', handleOriginSubmit);
    document.getElementById('masterForm').addEventListener('submit', handleMasterSubmit);

    document.getElementById('m_payment_terms').addEventListener('change', toggleCreditFields);
    toggleCreditFields();   // initial state
});

// ── Tab switching ─────────────────────────────────────────────────────────────
function switchTab(n) {
    [1, 2, 3].forEach(i => {
        const tab = document.getElementById(`tab${i}`);
        const panel = document.getElementById(`panel${i}`);
        if (tab) tab.classList.toggle('active', i === n);
        if (panel) panel.classList.toggle('active', i === n);
    });
    if (n === 2) loadOrigins();   // refresh list when switching to Step 2
    if (n === 3) loadClients();   // refresh clients table
}
window.switchTab = switchTab;

// ── Load origins into Step 2 dropdown ────────────────────────────────────────
async function loadOrigins() {
    try {
        const res = await fetch(`${API}/api/client/origins`);
        if (!res.ok) return;
        allOrigins = await res.json();

        const sel = document.getElementById('masterOriginSelect');
        const current = sel.value;
        sel.innerHTML = '<option value="">— Select an existing Client Origin —</option>';
        allOrigins.forEach(o => {
            const opt = document.createElement('option');
            opt.value = o.id;
            opt.textContent = `${o.unique_client_name}${o.office_location ? ' — ' + o.office_location : ''}`;
            sel.appendChild(opt);
        });
        if (current) sel.value = current;
    } catch (e) {
        console.error('Failed to load origins', e);
    }
}

// ── Load all clients (masters) into Step 3 table ─────────────────────────────
async function loadClients() {
    const tbody = document.getElementById('clientsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="padding:12px;text-align:center;"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';

    try {
        const res = await fetch(`${API}/api/client/masters`);
        if (!res.ok) throw new Error('Failed to load clients');
        const clients = await res.json();

        if (clients.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="padding:12px;text-align:center;color:var(--text-tertiary);">No clients found.</td></tr>';
            return;
        }

        const isAdmin = CONFIG && CONFIG.adminUsers &&
            CONFIG.adminUsers.map(u => u.toLowerCase()).includes(getUsername().toLowerCase());

        tbody.innerHTML = clients.map(c => `
            <tr style="border-bottom:1px solid var(--border-light);">
                <td style="padding:12px;"><strong>${c.client_code || '—'}</strong></td>
                <td style="padding:12px;font-weight:500;color:var(--navy-800);">${c.client_name || '—'}</td>
                <td style="padding:12px;color:var(--text-secondary);">${c.office_location || '—'}</td>
                <td style="padding:12px;">${c.contact_person || '—'}</td>
                <td style="padding:12px;color:var(--text-secondary);">${c.email_id || '—'}</td>
                <td style="padding:12px;text-align:center;">
                    <button class="btn" style="padding:6px 14px;font-size:12px;font-weight:600;background:var(--gray-100);color:var(--navy-700);border-radius:6px;border:1px solid var(--border-medium);" onclick="editClient(${c.id})">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="btn" style="padding:6px 14px;font-size:12px;font-weight:600;background:var(--navy-50);color:var(--navy-700);border-radius:6px;border:1px solid var(--navy-100);margin-left:8px;" onclick="openSummary(${c.id})">
                        <i class="fas fa-eye"></i> View
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="5" style="padding:12px;text-align:center;color:var(--error);">Error loading clients.</td></tr>';
    }
}

// ── Handle origin selection in Step 2 ────────────────────────────────────────
async function onOriginSelect() {
    const id = parseInt(document.getElementById('masterOriginSelect').value);
    const preview = document.getElementById('originPreview');
    const branchWrap = document.getElementById('existingBranchesWrap');

    if (!id) {
        savedOriginId = null;
        preview.classList.remove('visible');
        branchWrap.style.display = 'none';
        return;
    }

    savedOriginId = id;

    // Populate preview strip
    const origin = allOrigins.find(o => o.id === id);
    if (origin) {
        document.getElementById('previewGroup').textContent = origin.group_client || '—';
        document.getElementById('previewName').textContent = origin.unique_client_name || '—';
        document.getElementById('previewLocation').textContent = origin.office_location || '—';
        document.getElementById('previewCountry').textContent = origin.country || '—';
        preview.classList.add('visible');

        // Pre-fill Sales/CS from origin
        setIfEmpty('m_sales_branch', origin.sales_branch);
        setIfEmpty('m_sales_person', origin.sales_person);
        setIfEmpty('m_cs_name', origin.cs_name);
    }

    // Fetch and show existing branches
    try {
        const res = await fetch(`${API}/api/client/masters/by-origin/${id}`);
        const list = document.getElementById('existingBranchesList');
        if (res.ok) {
            const masters = await res.json();
            if (masters.length) {
                list.innerHTML = masters.map(m => `
                    <div class="branch-chip">
                        <div>
                            <strong>${m.client_name || '—'}</strong>
                            <span style="margin-left:8px;font-size:12px;color:var(--text-tertiary);">
                                ${m.office_location || ''}</span>
                        </div>
                        <code>${m.client_code || ''}</code>
                    </div>`).join('');
                branchWrap.style.display = 'block';
            } else {
                branchWrap.style.display = 'none';
            }
        } else {
            branchWrap.style.display = 'none';
        }
    } catch (e) {
        console.error('Could not load branches', e);
    }
}
window.onOriginSelect = onOriginSelect;

// ── Step 1 – Save Client Origin ───────────────────────────────────────────────
async function handleOriginSubmit(e) {
    e.preventDefault();

    const uniqueName = val('o_unique_client_name');
    const groupClient = val('o_group_client');
    if (!uniqueName || !groupClient) {
        showModal('warning', 'Missing Fields', 'Please fill in "Group" and "Unique Client Name" to continue.');
        return;
    }

    const btn = document.getElementById('saveOriginBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';

    const payload = {
        group_client: groupClient,
        unique_client_name: uniqueName,
        office_location: val('o_office_location'),
        office_address: val('o_office_address'),
        gst_no: val('o_gst_no'),
        gst_address: val('o_gst_address'),
        country: val('o_country') || 'India',
        pin_code: val('o_pin_code'),
        contact_person: val('o_contact_person'),
        contact_no: val('o_contact_no'),
        email_id: val('o_email_id'),
        contact_person_logistics: val('o_contact_person_logistics'),
        contact_no_logistics: val('o_contact_no_logistics'),
        email_id_logistics: val('o_email_id_logistics'),
        contact_person_finance: val('o_contact_person_finance'),
        contact_no_finance: val('o_contact_no_finance'),
        email_id_finance: val('o_email_id_finance'),
        commodity: val('o_commodity'),
        sales_branch: val('o_sales_branch'),
        sales_person: val('o_sales_person'),
        cs_name: val('o_cs_name'),
    };

    // Strip null/empty strings
    Object.keys(payload).forEach(k => {
        if (payload[k] === '' || payload[k] === null) delete payload[k];
    });

    try {
        const res = await fetch(`${API}/api/client/origins`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const result = await res.json();
            const created = result.origin;
            const branch = result.main_branch;
            savedOriginId = created.id;
            showModal('success', 'Client Origin Saved!', '',
                () => {
                    document.getElementById('tab1').classList.add('completed');
                    document.getElementById('tab1').classList.remove('active');
                    switchTab(2);
                    loadOrigins().then(() => {
                        document.getElementById('masterOriginSelect').value = savedOriginId;
                        onOriginSelect();
                    });
                }
            );
        } else {
            const err = await res.json();
            showModal('error', 'Save Failed', err.detail || 'Could not save Client Origin.');
        }
    } catch (err) {
        showModal('error', 'Network Error', err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Save Origin &amp; Continue';
    }
}

// ── Step 2 – Save Client Master ───────────────────────────────────────────────
async function handleMasterSubmit(e) {
    e.preventDefault();

    if (!savedOriginId) {
        showModal('warning', 'Origin Required', 'Please select or create a Client Origin first.');
        return;
    }

    const clientCode = val('m_client_code');
    const clientName = val('m_client_name');
    const contactPerson = val('m_contact_person');

    if (!clientCode || !clientName || !contactPerson) {
        showModal('warning', 'Missing Fields',
            'Client Code, Branch Name, and Contact Person are required.');
        return;
    }

    const btn = document.getElementById('saveMasterBtn');
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${editingMasterId ? 'Updating' : 'Saving'}…`;

    const payload = {
        origin_id: savedOriginId,
        client_code: clientCode,
        client_name: clientName,
        gst_name: val('m_gst_name'),
        gst_no: val('m_gst_no'),
        pan_no: val('m_pan_no'),
        iec_code: val('m_iec_code'),
        co_registration_type: val('m_co_registration_type'),
        office_location: val('m_office_location'),
        office_address: val('m_office_address'),
        country: val('m_country') || 'India',
        pin_code: val('m_pin_code'),
        contact_person: contactPerson,
        contact_no: val('m_contact_no'),
        email_id: val('m_email_id'),
        client_type_category: val('m_client_type_category'),
        business_nature: val('m_business_nature'),
        industry_type: val('m_industry_type'),
        shipment_type: val('m_shipment_type'),
        contract_type: val('m_contract_type'),
        billing_method: val('m_billing_method'),
        gst_percent: val('m_gst_percent'),
        billing_type: val('m_billing_type'),
        payment_terms: val('m_payment_terms'),
        credit_amount: numVal('m_credit_amount'),
        credit_period: intVal('m_credit_period'),
        contact_person_logistics: val('m_contact_person_logistics'),
        contact_no_logistics: val('m_contact_no_logistics'),
        email_id_logistics: val('m_email_id_logistics'),
        contact_person_finance: val('m_contact_person_finance'),
        contact_no_finance: val('m_contact_no_finance'),
        email_id_finance: val('m_email_id_finance'),
        sales_branch: val('m_sales_branch'),
        sales_person: val('m_sales_person'),
        cs_name: val('m_cs_name'),
        created_by: val('m_created_by'),
    };

    // Strip empty/null
    Object.keys(payload).forEach(k => {
        if (payload[k] === '' || payload[k] === null || payload[k] === undefined) delete payload[k];
    });

    try {
        const url = editingMasterId
            ? `${API}/api/client/masters/${editingMasterId}`
            : `${API}/api/client/masters`;
        const method = editingMasterId ? 'PATCH' : 'POST';

        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const savedItem = await res.json();
            showModal('success', `Client Master ${editingMasterId ? 'Updated' : 'Saved'}!`,
                `Branch "${savedItem.client_name}" (Code: ${savedItem.client_code}) has been ${editingMasterId ? 'updated' : 'created'} successfully.`,
                () => {
                    if (editingMasterId) {
                        resetMasterForm();
                        editingMasterId = null;
                        document.getElementById('saveMasterBtn').innerHTML = '<i class="fas fa-save"></i> Save Client Master';
                        switchTab(3);
                    } else if (confirm('Add another branch to the same Origin?')) {
                        resetMasterForm();
                        onOriginSelect();
                    } else {
                        window.location.href = '/';
                    }
                }
            );
        } else {
            const err = await res.json();
            showModal('error', 'Save Failed', err.detail || 'Could not save Client Master.');
        }
    } catch (err) {
        showModal('error', 'Network Error', err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = editingMasterId
            ? '<i class="fas fa-save"></i> Update Client Master'
            : '<i class="fas fa-save"></i> Save Client Master';
    }
}

// ── Edit Client Master ───────────────────────────────────────────────────────
async function editClient(id) {
    try {
        const res = await fetch(`${API}/api/client/master/${id}`);
        if (!res.ok) throw new Error('Failed to load client details.');
        const master = await res.json();

        // Populate fields
        editingMasterId = master.id;
        document.getElementById('masterOriginSelect').value = master.origin_id;
        onOriginSelect(); // triggers UI changes for the selected origin

        const fields = [
            'm_client_code', 'm_client_name', 'm_gst_name', 'm_gst_no', 'm_pan_no', 'm_iec_code',
            'm_co_registration_type', 'm_office_location', 'm_office_address', 'm_country', 'm_pin_code',
            'm_contact_person', 'm_contact_no', 'm_email_id', 'm_client_type_category', 'm_business_nature',
            'm_industry_type', 'm_shipment_type', 'm_contract_type', 'm_billing_method', 'm_gst_percent',
            'm_billing_type', 'm_payment_terms', 'm_credit_amount', 'm_credit_period',
            'm_contact_person_logistics', 'm_contact_no_logistics', 'm_email_id_logistics',
            'm_contact_person_finance', 'm_contact_no_finance', 'm_email_id_finance',
            'm_sales_branch', 'm_sales_person', 'm_cs_name', 'm_created_by'
        ];

        fields.forEach(f => {
            const el = document.getElementById(f);
            if (el) {
                const key = f.substring(2); // remove 'm_' prefix
                el.value = master[key] || '';
            }
        });

        toggleCreditFields();

        // Update button text
        document.getElementById('saveMasterBtn').innerHTML = '<i class="fas fa-save"></i> Update Client Master';

        // Switch to form tab
        switchTab(2);

    } catch (e) {
        console.error(e);
        showModal('error', 'Error', 'Could not load client details for editing.');
    }
}

// ── Credit field toggle ───────────────────────────────────────────────────────
function toggleCreditFields() {
    const terms = val('m_payment_terms');
    const show = terms === 'Credit';
    document.getElementById('creditAmountWrap').style.display = show ? '' : 'none';
    document.getElementById('creditPeriodWrap').style.display = show ? '' : 'none';
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
}

function numVal(id) {
    const v = parseFloat(val(id));
    return isNaN(v) ? null : v;
}

function intVal(id) {
    const v = parseInt(val(id), 10);
    return isNaN(v) ? null : v;
}

function setIfEmpty(id, value) {
    const el = document.getElementById(id);
    if (el && !el.value && value) el.value = value;
}

function resetMasterForm() {
    document.getElementById('masterForm').reset();
    editingMasterId = null;
    document.getElementById('saveMasterBtn').innerHTML = '<i class="fas fa-save"></i> Save Client Master';
    toggleCreditFields();
}

// ── Modal ─────────────────────────────────────────────────────────────────────
let _modalCallback = null;

function showModal(type, title, message, callback) {
    const icons = {
        success: '<i class="fas fa-check-circle" style="color:var(--success);font-size:2.5rem;"></i>',
        error: '<i class="fas fa-times-circle"  style="color:var(--error);font-size:2.5rem;"></i>',
        warning: '<i class="fas fa-exclamation-triangle" style="color:var(--warning);font-size:2.5rem;"></i>',
    };
    document.getElementById('modalIcon').innerHTML = icons[type] || icons.success;
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalMessage').textContent = message;
    document.getElementById('customModal').classList.add('active');
    _modalCallback = callback || null;
}

function closeModal() {
    document.getElementById('customModal').classList.remove('active');
    if (_modalCallback) { _modalCallback(); _modalCallback = null; }
}
async function verifyClientMaster(id) {
    try {
        const t = localStorage.getItem('token') || '';
        const res = await fetch(`${API}/api/client/master/${id}/verify`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${t}`, 'Content-Type': 'application/json' }
        });
        if (res.ok) {
            showModal('success', 'Verified!', 'Client master has been verified.', () => loadClients());
        } else {
            const err = await res.json();
            showModal('error', 'Error', err.detail || 'Could not verify.');
        }
    } catch (e) {
        console.error(e);
        showModal('error', 'Network Error', e.message);
    }
}

window.closeModal = closeModal;

// ── Summary View for Admin ───────────────────────────────────────────────────
async function openSummary(id) {
    try {
        const res = await fetch(`${API}/api/client/master/${id}`);
        if (!res.ok) throw new Error('Failed to load summary');
        const c = await res.json();

        const content = document.getElementById('summaryContent');
        document.getElementById('summaryTitle').textContent = c.client_name || 'Client Details';

        const sections = [
            {
                title: 'Company Basics',
                icon: 'building',
                fields: [
                    ['Client Code', c.client_code],
                    ['GST Name', c.gst_name],
                    ['GST Number', c.gst_no],
                    ['PAN Number', c.pan_no],
                    ['IEC Code', c.iec_code],
                    ['Registration', c.co_registration_type]
                ]
            },
            {
                title: 'Contact Information',
                icon: 'address-card',
                fields: [
                    ['Office Location', c.office_location],
                    ['Office Address', c.office_address],
                    ['Contact Person', c.contact_person],
                    ['Contact No', c.contact_no],
                    ['Email ID', c.email_id]
                ]
            },
            {
                title: 'Business Details',
                icon: 'briefcase',
                fields: [
                    ['Client Category', c.client_type_category],
                    ['Nature of Business', c.business_nature],
                    ['Industry Type', c.industry_type],
                    ['Shipment Type', c.shipment_type]
                ]
            },
            {
                title: 'Logistics POC',
                icon: 'truck',
                fields: [
                    ['Name', c.contact_person_logistics],
                    ['Number', c.contact_no_logistics],
                    ['Email', c.email_id_logistics]
                ]
            },
            {
                title: 'Finance POC',
                icon: 'wallet',
                fields: [
                    ['Name', c.contact_person_finance],
                    ['Number', c.contact_no_finance],
                    ['Email', c.email_id_finance]
                ]
            },
            {
                title: 'Billing & Credit',
                icon: 'file-invoice-dollar',
                fields: [
                    ['Contract Type', c.contract_type],
                    ['Payment Terms', c.payment_terms],
                    ['Credit Amount', c.credit_amount],
                    ['Credit Period', c.credit_period]
                ]
            }
        ];

        content.innerHTML = sections.map(s => `
            <div style="background:var(--gray-50); padding:20px; border-radius:var(--radius-lg); border:1px solid var(--border-light);">
                <h4 style="margin:0 0 16px; color:var(--navy-700); display:flex; align-items:center; gap:8px; font-size:14px; text-transform:uppercase; letter-spacing:0.04em;">
                    <i class="fas fa-${s.icon}" style="color:var(--coral-500);"></i> ${s.title}
                </h4>
                <div style="display:grid; gap:12px; margin-top:16px;">
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
            if (isAdmin && c.status !== 'verified') {
                sVerifyBtn.style.display = 'block';
                sVerifyBtn.onclick = async () => {
                    await verifyClientMaster(c.id);
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
