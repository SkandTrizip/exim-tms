let isEditing = false;

function toggleEdit() {
    isEditing = !isEditing;
    const sheet = document.querySelector('.mtd-sheet');
    const btn = document.getElementById('editBtn');
    const editables = document.querySelectorAll('.editable');

    if (isEditing) {
        sheet.classList.add('edit-mode');
        btn.innerHTML = '<i class="fas fa-check"></i> Done Editing';
        btn.style.background = '#2563eb';
        btn.style.color = '#fff';
        editables.forEach(el => el.setAttribute('contenteditable', 'true'));
    } else {
        sheet.classList.remove('edit-mode');
        btn.innerHTML = '<i class="fas fa-pen"></i> Edit';
        btn.style.background = '';
        btn.style.color = '';
        editables.forEach(el => el.removeAttribute('contenteditable'));
    }
}

document.addEventListener('DOMContentLoaded', async function () {
    const enquiryId = new URLSearchParams(window.location.search).get('enquiry_id');
    if (!enquiryId) {
        alert('No enquiry ID provided');
        window.history.back();
        return;
    }
    await loadDocument(enquiryId);
});

async function loadDocument(id) {
    try {
        const res = await fetch(`${CONFIG.API_URL}/api/enquiry/hbl-document/${id}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json();
        populateDocument(d);
    } catch (err) {
        console.error('Failed to load HBL document data:', err);
        alert('Could not load document data. Please try again.');
    }
}

function fmtDate(iso) {
    if (!iso) return '';
    const dt = new Date(iso);
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function populateDocument(d) {
    document.getElementById('mtdBlNo').textContent = '';

    // Consignor = Shipping Line full details
    const consignorParts = [];
    if (d.shipping_line) consignorParts.push(d.shipping_line);
    if (d.shipping_line_address) consignorParts.push(d.shipping_line_address);
    if (d.shipping_line_location) consignorParts.push(d.shipping_line_location);
    const contactLine = [];
    if (d.shipping_line_contact_person) contactLine.push(d.shipping_line_contact_person);
    if (d.shipping_line_contact_number) contactLine.push('Tel: ' + d.shipping_line_contact_number);
    if (contactLine.length) consignorParts.push(contactLine.join(', '));
    if (d.shipping_line_email) consignorParts.push('Email: ' + d.shipping_line_email);
    document.getElementById('consignor').textContent = consignorParts.join('\n') || d.client_name || '';

    // Shipment Reference No = Sale Number
    document.getElementById('shipmentRefNo').textContent = d.enquiry_number || '';

    // Consignee from tracking status
    document.getElementById('consignee').textContent = d.consignee || '';

    // Delivery Agent from enquiry
    document.getElementById('deliveryAgent').textContent = d.delivery_agent || '';

    // Notify Parties
    document.getElementById('notifyParty1').textContent = d.notify_party_address || '';
    document.getElementById('notifyParty2').textContent = d.notify_party_2_address || '';

    // Places & Ports — prefer quote data, fallback to enquiry
    const origin = d.origin || '';
    const dest = d.destination || '';
    document.getElementById('placeAcceptance').textContent = d.place_of_receipt || origin;
    document.getElementById('portLoading').textContent = d.port_of_loading || d.preferred_origin_port || origin;
    document.getElementById('portDischarge').textContent = d.port_of_discharge || d.preferred_destination_port || dest;
    document.getElementById('placeDelivery').textContent = d.final_place_of_delivery || dest;

    // Date of acceptance
    document.getElementById('dateAcceptance').textContent = '';

    // Route / transhipment
    document.getElementById('routeTranshipment').textContent = '';

    // Vessel & Voyage
    document.getElementById('vesselName').textContent = d.vessel || '';
    document.getElementById('voyageNo').textContent = d.voyage_no || '';

    // Modes of transport
    document.getElementById('modesTransport').textContent = d.mode_of_transport_origin || '';

    // Date of delivery (ETA)
    document.getElementById('dateDelivery').textContent = fmtDate(d.eta);

    // Cargo description
    const descParts = [];
    if (d.commodity) descParts.push(d.commodity);
    if (d.hs_code) descParts.push(`HS Code: ${d.hs_code}`);
    document.getElementById('cargoDescription').textContent = descParts.join('\n') || '';

    // Weight
    const wt = [];
    if (d.weight_per_container) {
        wt.push(`${d.weight_per_container} ${d.weight_measurement || 'KG'}`);
        if (d.container_count && d.container_count > 1) {
            const total = d.weight_per_container * d.container_count;
            wt.push(`Total: ${total} ${d.weight_measurement || 'KG'}`);
        }
    }
    document.getElementById('cargoWeight').textContent = wt.join('\n') || '';

    // Container info in measurement column
    const containerInfo = [];
    if (d.container_type) containerInfo.push(d.container_type);
    if (d.container_count) containerInfo.push(`× ${d.container_count}`);
    document.getElementById('cargoMeasurement').textContent = containerInfo.join(' ') || '';

    // SOB Date
    document.getElementById('sobDate').textContent = fmtDate(d.sob);

    // Place and Date of issue
    document.getElementById('placeAndDateOfIssue').textContent = 'Gurugram, ' + new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function switchBlType(type) {
    const label = document.getElementById('blTypeLabel');
    const count = document.getElementById('mtdOriginalCount');
    const watermark = document.getElementById('watermark');
    if (type === 'original') {
        label.textContent = '';
        count.textContent = 'Number of Original MTD: 3 / THREE';
        watermark.classList.add('hidden');
    } else {
        label.textContent = 'SEAWAY BILL OF LADING';
        count.textContent = 'Number of Original MTD: 0 / ZERO';
        watermark.classList.remove('hidden');
    }
}

function selectFreight(type) {
    const prepaid = document.getElementById('freightPrepaid');
    const collect = document.getElementById('freightCollect');
    if (type === 'prepaid') {
        prepaid.style.fontWeight = 'bold';
        prepaid.style.textDecoration = 'underline';
        collect.style.fontWeight = 'normal';
        collect.style.textDecoration = 'none';
    } else {
        collect.style.fontWeight = 'bold';
        collect.style.textDecoration = 'underline';
        prepaid.style.fontWeight = 'normal';
        prepaid.style.textDecoration = 'none';
    }
}
