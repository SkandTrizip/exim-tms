// Enquiry Page Logic
let currentEnquiry = null;

document.addEventListener('DOMContentLoaded', async function () {
    // 1. Initial UI Setup
    try {
        await populateInitialDropdowns();
    } catch (e) {
        console.error('Error populating dropdowns:', e);
    }
    initializeAutocomplete();

    // 2. Check for editing mode (if enquiry_id is provided)
    const urlParams = new URLSearchParams(window.location.search);
    const enquiryId = urlParams.get('enquiry_id');

    if (enquiryId) {
        await fetchEnquiryData(enquiryId);
    } else {
        await generateEnquiryNumber();
    }
});

/**
 * Populate dropdowns specifically for the enquiry page
 */
async function populateInitialDropdowns() {
    populateDropdown(document.getElementById('shipmentType'), CONFIG.shipmentTypes);

    // Fetch clients from API (Client Master)
    try {
        const response = await fetch(`${CONFIG.API_URL}/api/client/masters`);
        if (response.ok) {
            const masters = await response.json();

            // Count how many times each client_name appears to detect multi-branch clients
            const nameCount = {};
            masters.forEach(m => {
                const name = m.client_name || '';
                nameCount[name] = (nameCount[name] || 0) + 1;
            });

            // Group masters by base client_name to detect multi-branch clients
            // Each master's base name comes from its linked origin's unique_client_name
            // We'll use client_name as stored, but build labels using underscore notation.

            // Count origins (unique_client_name) per group to detect multi-branch
            const originCount = {};
            masters.forEach(m => {
                // m.unique_client_name comes from the join, fallback to client_name
                const baseName = m.unique_client_name || m.client_name || '';
                originCount[baseName] = (originCount[baseName] || 0) + 1;
            });

            // Build option objects
            // Format: single-branch → "CompanyName"
            //         multi-branch  → "CompanyName_Main" (is_main) or "CompanyName_CityName"
            const clientOptions = masters.map(m => {
                const baseName = m.unique_client_name || m.client_name || '';
                const city = (m.office_location || '').trim();
                const isMultiBranch = originCount[baseName] > 1;

                let label;
                if (!isMultiBranch) {
                    label = baseName;  // single branch – plain name
                } else if (m.is_main) {
                    label = `${baseName}_Main`;
                } else {
                    label = city ? `${baseName}_${city}` : `${baseName}_${m.client_name}`;
                }
                return { label, value: label };
            });

            // Deduplicate in case of identical labels
            const seen = new Set();
            const uniqueOptions = clientOptions.filter(opt => {
                if (seen.has(opt.value)) return false;
                seen.add(opt.value);
                return true;
            });

            // Populate with { label, value } objects
            const select = document.getElementById('clientName');
            if (select) {
                const placeholder = select.querySelector('option[value=""]');
                select.innerHTML = '';
                if (placeholder) select.appendChild(placeholder);
                uniqueOptions.forEach(opt => {
                    const el = document.createElement('option');
                    el.value = opt.value;
                    el.textContent = opt.label;
                    select.appendChild(el);
                });
            }

            // Stash the full master list for future lookups (e.g., auto-fill)
            window._clientMasters = masters;
            window._clientOptions = uniqueOptions;
        } else {
            // Fallback to config if API fails
            populateDropdown(document.getElementById('clientName'), CONFIG.clients);
        }
    } catch (error) {
        console.warn('Could not fetch client masters, using fallback:', error);
        populateDropdown(document.getElementById('clientName'), CONFIG.clients);
    }

    populateDropdown(document.getElementById('clientScope'), CONFIG.scopes);
    populateDropdown(document.getElementById('modeOrigin'), CONFIG.modes);
    populateDropdown(document.getElementById('modeDest'), CONFIG.modes);

    // Container types for existing groups
    const containerTypeSelects = document.querySelectorAll('.containerType');
    containerTypeSelects.forEach(select => populateDropdown(select, CONFIG.containerTypes));

    // Visibility toggle for client scope
    const clientScopeSelect = document.getElementById('clientScope');
    if (clientScopeSelect) {
        clientScopeSelect.addEventListener('change', updateModeVisibility);
        updateModeVisibility(); // Initial check
    }
}

/**
 * Generate a new job number: LLP/OFE/YY/MM/NNNNN (server-side, resets monthly).
 */
async function generateEnquiryNumber() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    try {
        const response = await fetch(`${CONFIG.API_URL}/api/enquiry/next-number?year=${year}&month=${month}`);
        if (response.ok) {
            const data = await response.json();
            if (data.enquiry_number) {
                document.getElementById('enquiryNumber').value = data.enquiry_number;
                return;
            }
        }
    } catch (error) {
        console.error('Error generating enquiry number:', error);
    }
    const yy = String(year).slice(-2);
    const mm = String(month).padStart(2, '0');
    document.getElementById('enquiryNumber').value = `LLP/OFE/${yy}/${mm}/00001`;
}

/**
 * Fetch existing enquiry data for editing
 */
async function fetchEnquiryData(id) {
    try {
        const response = await fetch(`${CONFIG.API_URL}/api/enquiry/${id}`);
        if (response.ok) {
            currentEnquiry = await response.json();
            populateEnquiryForm(currentEnquiry);
        } else {
            console.error('Failed to fetch enquiry data');
        }
    } catch (error) {
        console.error('Error fetching enquiry:', error);
    }
}

/**
 * Populate form with existing data
 */
function populateEnquiryForm(data) {
    if (!data) return;

    document.getElementById('enquiryNumber').value = data.enquiry_number || '';
    document.getElementById('shipmentType').value = data.shipment_type || '';
    document.getElementById('clientName').value = data.client_name || '';
    document.getElementById('clientScope').value = data.client_scope || '';
    document.getElementById('enquiryRecDate').value = data.enquiry_received_date ? data.enquiry_received_date.split('T')[0] : '';
    document.getElementById('stuffingDate').value = data.stuffing_date ? data.stuffing_date.split('T')[0] : '';
    document.getElementById('origin').value = data.origin || '';
    document.getElementById('destination').value = data.destination || '';
    document.getElementById('prefOriginPort').value = data.preferred_origin_port || '';
    document.getElementById('prefDestPort').value = data.preferred_destination_port || '';
    document.getElementById('modeOrigin').value = data.mode_of_transport_origin || '';
    document.getElementById('modeDest').value = data.mode_of_transport_destination || '';
    document.getElementById('commodity').value = data.commodity || '';
    document.getElementById('hsCode').value = data.hs_code || '';
    document.getElementById('cargoRisk').value = data.cargo_risk || '';

    // Trigger dependent fields
    updateModeVisibility();
    toggleRiskOptions();

    if (data.cargo_risk_type) {
        document.getElementById('cargoRiskType').value = data.cargo_risk_type;
        toggleRiskDetails();
        if (data.cargo_risk_detail) {
            setTimeout(() => {
                const detailEl = document.getElementById('cargoRiskDetail');
                if (detailEl) detailEl.value = data.cargo_risk_detail;
            }, 100);
        }
    }

    document.getElementById('temperature').value = data.temperature || '';
    document.getElementById('moisture').value = data.moisture || '';
    document.getElementById('cargoValue').value = data.cargo_value || '';
    document.getElementById('cargoValueCurrency').value = data.cargo_value_currency || 'USD';
    document.getElementById('clearanceRequired').value = data.customer_clearance_required || '';
    document.getElementById('targetRate').value = data.client_target_rate || '';
    document.getElementById('remarks').value = data.remarks || '';

    // HBL toggle + delivery agent
    const hblCheck = document.getElementById('hblRequired');
    if (hblCheck) {
        hblCheck.checked = !!data.hbl_required;
        toggleDeliveryAgent();
    }
    document.getElementById('deliveryAgent').value = data.delivery_agent || '';
    document.getElementById('vessel').value = data.vessel || '';
    document.getElementById('voyageNo').value = data.voyage_no || '';
    document.getElementById('notifyPartyAddress').value = data.notify_party_address || '';
    document.getElementById('notifyParty2Address').value = data.notify_party_2_address || '';

    // Handle Containers
    const containerList = document.getElementById('containerList');
    containerList.innerHTML = ''; // Clear defaults

    // For simplicity, we currently store singular container columns in DB
    // but the UI supports multiple. We'll show the primary one for now.
    if (data.container_type) {
        createContainerGroup(data.container_type, data.container_count, data.weight_measurement, data.weight_per_container);
    } else {
        createContainerGroup();
    }

    // Check if stage is confirmed (Stage 3+)
    if (data.stage >= 3) {
        console.log('🔒 Sale is confirmed (Stage ' + data.stage + '). Locking form.');

        const hblFieldIds = new Set([
            'hblRequired', 'deliveryAgent', 'vessel', 'voyageNo',
            'notifyPartyAddress', 'notifyParty2Address'
        ]);

        // 1. Hide the Save Button
        const saveBtn = document.getElementById('saveSaleBtn');
        if (saveBtn) saveBtn.style.display = 'none';

        // 2. Show the Update HBL button
        const updateHblBtn = document.getElementById('updateHblBtn');
        if (updateHblBtn) updateHblBtn.style.display = 'inline-flex';

        // 3. Make all form elements read-only/disabled EXCEPT HBL fields
        const form = document.getElementById('enquiryForm');
        if (form) {
            const elements = form.querySelectorAll('input, select, textarea, button:not(.btn-secondary):not(#updateHblBtn)');
            elements.forEach(el => {
                if (hblFieldIds.has(el.id)) return;
                el.disabled = true;
                el.style.backgroundColor = 'var(--gray-50)';
                el.style.cursor = 'not-allowed';
            });
        }

        // 4. Add a notice message at the top of the form
        const pageHeader = document.querySelector('.page-header');
        if (pageHeader) {
            const notice = document.createElement('div');
            notice.style.background = '#f0fdf4';
            notice.style.border = '1px solid #bbf7d0';
            notice.style.color = '#15803d';
            notice.style.padding = '12px 16px';
            notice.style.borderRadius = '8px';
            notice.style.marginBottom = '24px';
            notice.style.display = 'flex';
            notice.style.alignItems = 'center';
            notice.style.gap = '12px';
            notice.style.fontSize = '14px';
            notice.style.fontWeight = '500';
            notice.innerHTML = `
                <i class="fas fa-lock"></i>
                <span>This sale has been confirmed and locked. You can still update <strong>HBL details</strong> using the button below.</span>
            `;
            pageHeader.parentNode.insertBefore(notice, pageHeader.nextSibling);
        }
    }
}

function createContainerGroup(type = '', count = 1, weightUnit = 'KG', weight = '') {
    const containerList = document.getElementById('containerList');
    const index = containerList.querySelectorAll('.container-group').length + 1;

    const div = document.createElement('div');
    div.className = 'container-group';
    div.innerHTML = `
        <div class="container-header">
            <div class="container-title">Container #${index}</div>
            ${index > 1 ? '<button type="button" class="btn btn-remove" onclick="removeContainer(this)">Remove</button>' : ''}
        </div>
        <div class="form-grid">
            <div class="form-group">
                <label>Container Type <span class="required">*</span></label>
                <select class="containerType" required>
                    <option value="">Select Type</option>
                </select>
            </div>
            <div class="form-group">
                <label>Count of Containers <span class="required">*</span></label>
                <input type="number" class="containerCount" min="1" value="${count}" required>
            </div>
            <div class="form-group">
                <label>Weight Measurement</label>
                <select class="weightMeasurement">
                    <option value="KG" ${weightUnit === 'KG' ? 'selected' : ''}>Kilograms (KG)</option>
                    <option value="LBS" ${weightUnit === 'LBS' ? 'selected' : ''}>Pounds (LBS)</option>
                    <option value="Tons" ${weightUnit === 'Tons' ? 'selected' : ''}>Tons</option>
                </select>
            </div>
            <div class="form-group">
                <label>Weight per Container</label>
                <input type="number" class="weightPerContainer" value="${weight}" placeholder="0.00" step="0.01">
            </div>
        </div>
    `;

    const select = div.querySelector('.containerType');
    populateDropdown(select, CONFIG.containerTypes);
    if (type) select.value = type;

    containerList.appendChild(div);
}

function addContainer() {
    createContainerGroup();
}

function removeContainer(btn) {
    btn.closest('.container-group').remove();
}

/**
 * Save logic
 */
async function saveEnquiry() {
    const enquiryData = {
        enquiry_number: document.getElementById('enquiryNumber').value,
        client_name: document.getElementById('clientName').value,
        shipment_type: document.getElementById('shipmentType').value,
        client_scope: document.getElementById('clientScope').value,
        enquiry_received_date: document.getElementById('enquiryRecDate').value || null,
        stuffing_date: document.getElementById('stuffingDate').value || null,
        origin: document.getElementById('origin').value,
        destination: document.getElementById('destination').value,
        preferred_origin_port: document.getElementById('prefOriginPort').value,
        preferred_destination_port: document.getElementById('prefDestPort').value,
        mode_of_transport_origin: document.getElementById('modeOrigin').value,
        mode_of_transport_destination: document.getElementById('modeDest').value,
        commodity: document.getElementById('commodity').value,
        hs_code: document.getElementById('hsCode').value,
        cargo_risk: document.getElementById('cargoRisk').value,
        cargo_risk_type: document.getElementById('cargoRiskType').value,
        cargo_risk_detail: document.getElementById('cargoRiskDetail') ? document.getElementById('cargoRiskDetail').value : null,
        temperature: parseFloat(document.getElementById('temperature').value) || null,
        moisture: parseFloat(document.getElementById('moisture').value) || null,
        cargo_value: parseFloat(document.getElementById('cargoValue').value) || 0,
        cargo_value_currency: document.getElementById('cargoValueCurrency').value,
        customer_clearance_required: document.getElementById('clearanceRequired').value,
        client_target_rate: parseFloat(document.getElementById('targetRate').value) || 0,
        remarks: document.getElementById('remarks').value,
        hbl_required: document.getElementById('hblRequired').checked,
        delivery_agent: document.getElementById('hblRequired').checked ? document.getElementById('deliveryAgent').value : null,
        vessel: document.getElementById('hblRequired').checked ? document.getElementById('vessel').value : null,
        voyage_no: document.getElementById('hblRequired').checked ? document.getElementById('voyageNo').value : null,
        notify_party_address: document.getElementById('hblRequired').checked ? document.getElementById('notifyPartyAddress').value : null,
        notify_party_2_address: document.getElementById('hblRequired').checked ? document.getElementById('notifyParty2Address').value : null,
        status: 'pending',
        stage: 2
    };

    const containerGroup = document.querySelector('.container-group');
    if (containerGroup) {
        enquiryData.container_type = containerGroup.querySelector('.containerType').value;
        enquiryData.container_count = parseInt(containerGroup.querySelector('.containerCount').value) || 0;
        enquiryData.weight_measurement = containerGroup.querySelector('.weightMeasurement').value;
        enquiryData.weight_per_container = parseFloat(containerGroup.querySelector('.weightPerContainer').value) || 0;
    }

    if (!enquiryData.client_name || !enquiryData.shipment_type || !enquiryData.origin || !enquiryData.destination) {
        showModal('Validation Error', 'Please fill in all required fields', 'warning');
        return;
    }

    const isUpdate = currentEnquiry && currentEnquiry.id;
    const url = isUpdate ? `${CONFIG.API_URL}/api/enquiry/${currentEnquiry.id}` : `${CONFIG.API_URL}/api/enquiry/`;

    try {
        const response = await fetch(url, {
            method: isUpdate ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(enquiryData)
        });

        if (response.ok) {
            const result = await response.json();
            currentEnquiry = result; // Update current enquiry with saved data
            showModal('Success', 'Sale saved successfully!', 'success');
        } else {
            const error = await response.json();
            showModal('Error', error.detail || 'Unknown error', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showModal('Connection Error', 'Failed to connect to server', 'error');
    }
}

// Helper Functions (Visibility, Risk, Autocomplete) - copied and adapted from app.js
function updateModeVisibility() {
    const scope = document.getElementById('clientScope').value;
    const modeOriginGroup = document.getElementById('modeOrigin')?.closest('.form-group');
    const modeDestGroup = document.getElementById('modeDest')?.closest('.form-group');

    if (!modeOriginGroup || !modeDestGroup) return;

    modeOriginGroup.style.display = 'none';
    modeDestGroup.style.display = 'none';

    if (scope === 'Port to Door') modeDestGroup.style.display = 'block';
    else if (scope === 'Door to Port') modeOriginGroup.style.display = 'block';
    else if (scope === 'Door to Door') {
        modeOriginGroup.style.display = 'block';
        modeDestGroup.style.display = 'block';
    }
}

function toggleDeliveryAgent() {
    const cb = document.getElementById('hblRequired');
    const group = document.getElementById('deliveryAgentGroup');
    const label = document.getElementById('hblLabel');
    const track = cb.closest('.toggle-switch').querySelector('.toggle-track');
    const thumb = track.querySelector('.toggle-thumb');

    const hblFields = document.querySelectorAll('.hbl-field');
    if (cb.checked) {
        label.textContent = 'Yes';
        label.style.color = 'var(--primary, #2563eb)';
        track.style.background = 'var(--primary, #2563eb)';
        thumb.style.transform = 'translateX(20px)';
        group.style.display = 'block';
        hblFields.forEach(el => el.style.display = 'block');
    } else {
        label.textContent = 'No';
        label.style.color = 'var(--text-tertiary)';
        track.style.background = '#cbd5e1';
        thumb.style.transform = 'translateX(0)';
        group.style.display = 'none';
        hblFields.forEach(el => el.style.display = 'none');
    }
}

function toggleRiskOptions() {
    const cargoRisk = document.getElementById('cargoRisk').value;
    const riskTypeContainer = document.getElementById('riskTypeContainer');
    const riskTypeSelect = document.getElementById('cargoRiskType');
    const riskDetailContainer = document.getElementById('riskDetailContainer');
    const tempMoistureContainer = document.getElementById('tempMoistureContainer');

    riskTypeContainer.style.display = 'none';
    riskDetailContainer.style.display = 'none';
    tempMoistureContainer.style.display = 'none';
    riskTypeSelect.innerHTML = '<option value="" disabled selected hidden>Select Type</option>';

    if (!cargoRisk) return;

    riskTypeContainer.style.display = 'block';
    const options = cargoRisk === 'Haz' ? ['Packaging Group', 'Class', 'UN Code'] : ['General Cargo', 'Temperature Controlled'];
    options.forEach(opt => {
        const el = document.createElement('option');
        el.value = opt;
        el.textContent = opt;
        riskTypeSelect.appendChild(el);
    });
}

function toggleRiskDetails() {
    const riskType = document.getElementById('cargoRiskType').value;
    const container = document.getElementById('riskDetailContainer');
    const wrapper = document.getElementById('riskDetailInputWrapper');
    const label = document.getElementById('riskDetailLabel');
    const tempMoisture = document.getElementById('tempMoistureContainer');

    container.style.display = 'none';
    tempMoisture.style.display = 'none';
    wrapper.innerHTML = '';

    if (riskType === 'Packaging Group' || riskType === 'Class') {
        container.style.display = 'block';
        label.textContent = `Select ${riskType}`;
        const select = document.createElement('select');
        select.id = 'cargoRiskDetail';
        select.className = 'form-control';
        const opts = riskType === 'Packaging Group' ? ['PG1', 'PG2', 'PG3'] : Array.from({ length: 10 }, (_, i) => `Class ${i + 1}`);
        opts.forEach(o => {
            const el = document.createElement('option');
            el.value = o; el.textContent = o; select.appendChild(el);
        });
        wrapper.appendChild(select);
    } else if (riskType === 'UN Code') {
        container.style.display = 'block';
        label.textContent = 'UN Code';
        const input = document.createElement('input');
        input.type = 'text'; input.id = 'cargoRiskDetail'; input.className = 'form-control';
        wrapper.appendChild(input);
    } else if (riskType === 'Temperature Controlled') {
        tempMoisture.style.display = 'block';
    }
}

function initializeAutocomplete() {
    const fields = [
        { id: 'origin', dropdownId: 'originDropdown', filter: 'startsWith' },
        { id: 'destination', dropdownId: 'destDropdown', filter: 'endsWith' },
        { id: 'prefOriginPort', dropdownId: 'prefOriginPortDropdown', filter: 'always' },
        { id: 'prefDestPort', dropdownId: 'prefDestPortDropdown', filter: 'always' }
    ];

    fields.forEach(field => {
        const input = document.getElementById(field.id);
        const dropdown = document.getElementById(field.dropdownId);
        if (!input || !dropdown) return;

        input.addEventListener('input', debounce(async (e) => {
            const query = e.target.value;
            const scope = document.getElementById('clientScope').value;

            if (field.filter !== 'always') {
                if (field.filter === 'startsWith' && (!scope || !scope.startsWith('Port'))) {
                    dropdown.style.display = 'none'; return;
                }
                if (field.filter === 'endsWith' && (!scope || !scope.endsWith('Port'))) {
                    dropdown.style.display = 'none'; return;
                }
            }

            if (query.length < 2) { dropdown.style.display = 'none'; return; }
            const res = await fetch(`${CONFIG.API_URL}/api/ports/search?q=${encodeURIComponent(query)}`);
            const suggestions = await res.json();
            showSuggestions(suggestions, dropdown, input);
        }, 300));
    });

    document.addEventListener('click', (e) => {
        fields.forEach(f => {
            const input = document.getElementById(f.id);
            const dropdown = document.getElementById(f.dropdownId);
            if (input && !input.contains(e.target) && !dropdown.contains(e.target)) dropdown.style.display = 'none';
        });
    });
}

function showSuggestions(suggestions, dropdown, input) {
    if (!suggestions.length) { dropdown.style.display = 'none'; return; }
    dropdown.innerHTML = '';
    suggestions.forEach(port => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';
        item.innerHTML = `<div><div class="port-name">${port.name}</div><div style="font-size: 0.7rem;">${port.unlocode}</div></div>`;
        item.onclick = () => { input.value = port.name; dropdown.style.display = 'none'; };
        dropdown.appendChild(item);
    });
    dropdown.style.display = 'block';
}

function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

async function saveHblFields() {
    if (!currentEnquiry || !currentEnquiry.id) {
        showModal('Error', 'No enquiry loaded to update', 'error');
        return;
    }
    const hblRequired = document.getElementById('hblRequired').checked;
    const payload = {
        hbl_required: hblRequired,
        delivery_agent: hblRequired ? document.getElementById('deliveryAgent').value : null,
        vessel: hblRequired ? document.getElementById('vessel').value : null,
        voyage_no: hblRequired ? document.getElementById('voyageNo').value : null,
        notify_party_address: hblRequired ? document.getElementById('notifyPartyAddress').value : null,
        notify_party_2_address: hblRequired ? document.getElementById('notifyParty2Address').value : null,
    };
    try {
        const response = await fetch(`${CONFIG.API_URL}/api/enquiry/${currentEnquiry.id}/hbl-fields`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (response.ok) {
            showModal('Success', 'HBL details updated successfully!', 'success');
        } else {
            const error = await response.json();
            showModal('Error', error.detail || 'Unknown error', 'error');
        }
    } catch (error) {
        console.error('Error updating HBL fields:', error);
        showModal('Connection Error', 'Failed to connect to server', 'error');
    }
}

function goBack() {
    window.location.href = '/#dashboard';
}
