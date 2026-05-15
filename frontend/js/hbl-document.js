const HBL_PAGE_TITLE = 'HBL / MTD Document – ShipFlow TMS';

let watermarkEnabled = true;
let currentEnquiryId = null;

const HBL_SNAPSHOT_FIELD_IDS = [
    'mtdBlNo', 'consignor', 'shipmentRefNo', 'consignee', 'deliveryAgent',
    'notifyParty1', 'notifyParty2', 'placeAcceptance', 'portLoading', 'dateAcceptance',
    'portDischarge', 'placeDelivery', 'routeTranshipment', 'vesselName', 'voyageNo',
    'modesTransport', 'dateDelivery', 'containerNos', 'marksNumber', 'cargoDescription',
    'cargoWeight', 'cargoMeasurement', 'sobDate', 'placeAndDateOfIssue', 'endOfBlNo'
];

function hblStorageKey() {
    return `hbl_document_snapshot_${currentEnquiryId}`;
}

function getFreightSelection() {
    const prepaid = document.getElementById('freightPrepaid');
    if (!prepaid) return 'prepaid';
    return prepaid.style.fontWeight === 'bold' ? 'prepaid' : 'collect';
}

function collectSnapshot() {
    const fields = {};
    for (const id of HBL_SNAPSHOT_FIELD_IDS) {
        const el = document.getElementById(id);
        fields[id] = el ? el.innerHTML : '';
    }
    return {
        version: 1,
        savedAt: new Date().toISOString(),
        enquiryId: currentEnquiryId,
        blType: document.getElementById('blTypeSelect').value,
        watermarkEnabled,
        freight: getFreightSelection(),
        fields
    };
}

function applySnapshot(s) {
    if (!s || !s.fields) return;
    for (const id of HBL_SNAPSHOT_FIELD_IDS) {
        if (s.fields[id] !== undefined) {
            const el = document.getElementById(id);
            if (el) el.innerHTML = s.fields[id];
        }
    }
    const sel = document.getElementById('blTypeSelect');
    if (sel && s.blType) {
        sel.value = s.blType;
        switchBlType(s.blType);
    }
    if (typeof s.watermarkEnabled === 'boolean') {
        watermarkEnabled = s.watermarkEnabled;
        const t = document.getElementById('watermarkToggle');
        if (t) t.checked = s.watermarkEnabled;
        applyWatermarkVisibility();
    }
    if (s.freight) {
        selectFreight(s.freight === 'collect' ? 'collect' : 'prepaid');
    }
}

function updateSavedDraftNotice() {
    const wrap = document.getElementById('savedDraftNotice');
    const text = document.getElementById('savedDraftNoticeText');
    if (!wrap || !text || !currentEnquiryId) return;
    let raw;
    try {
        raw = localStorage.getItem(hblStorageKey());
    } catch (e) {
        wrap.classList.remove('visible');
        return;
    }
    if (!raw) {
        wrap.classList.remove('visible');
        return;
    }
    try {
        const s = JSON.parse(raw);
        const when = s.savedAt ? new Date(s.savedAt).toLocaleString() : '';
        text.textContent = `Local copy saved${when ? ` (${when})` : ''} for this enquiry.`;
        wrap.classList.add('visible');
    } catch (e) {
        wrap.classList.remove('visible');
    }
}

function flashSaveButton() {
    const btn = document.getElementById('saveLocalBtn');
    if (!btn) return;
    const prev = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check"></i> Saved';
    setTimeout(() => { btn.innerHTML = prev; }, 2200);
}

function saveDocumentLocally() {
    if (!currentEnquiryId) return;
    try {
        localStorage.setItem(hblStorageKey(), JSON.stringify(collectSnapshot()));
        updateSavedDraftNotice();
        flashSaveButton();
    } catch (e) {
        console.error(e);
        alert('Could not save (storage may be full or disabled).');
    }
}

function restoreSavedDraft() {
    if (!currentEnquiryId) return;
    let raw;
    try {
        raw = localStorage.getItem(hblStorageKey());
    } catch (e) {
        return;
    }
    if (!raw) return;
    try {
        applySnapshot(JSON.parse(raw));
        updateSavedDraftNotice();
        flashSaveButton();
    } catch (e) {
        alert('Could not read saved data.');
    }
}

function discardSavedDraft() {
    if (!currentEnquiryId) return;
    try {
        localStorage.removeItem(hblStorageKey());
    } catch (e) { /* ignore */ }
    updateSavedDraftNotice();
}

function openSavedPdfFile() {
    const inp = document.getElementById('hblPdfFileInput');
    if (!inp) return;
    inp.onchange = function onHblPdfPicked(ev) {
        const f = ev.target.files && ev.target.files[0];
        inp.onchange = null;
        inp.value = '';
        if (!f) return;
        const url = URL.createObjectURL(f);
        window.open(url, '_blank', 'noopener,noreferrer');
        setTimeout(() => URL.revokeObjectURL(url), 600000);
    };
    inp.click();
}

function pdfSuggestedTitle() {
    const raw = (document.getElementById('mtdBlNo')?.textContent || 'HBL').trim() || 'HBL';
    const safe = raw.replace(/[^\w.\-]+/g, '_').slice(0, 48);
    const type = document.getElementById('blTypeSelect').value;
    const typePart = type === 'seaway' ? 'Seaway' : type === 'draft' ? 'Draft' : 'Original';
    return `MTD-HBL-${safe}-${typePart}`;
}

function saveAsPdf() {
    if (isEditing) toggleEdit();
    document.title = pdfSuggestedTitle();
    window.print();
}

function applyWatermarkVisibility() {
    const watermark = document.getElementById('watermark');
    const blType = document.getElementById('blTypeSelect').value;
    if (!watermark) return;
    if (blType !== 'seaway' || !watermarkEnabled) {
        watermark.classList.add('hidden');
    } else {
        watermark.classList.remove('hidden');
    }
}

function toggleWatermark(enabled) {
    watermarkEnabled = enabled;
    applyWatermarkVisibility();
}

function printDoc() {
    if (isEditing) toggleEdit();
    document.title = '\u00A0';
    window.print();
}

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
    window.addEventListener('afterprint', function () {
        document.title = HBL_PAGE_TITLE;
    });

    const enquiryId = new URLSearchParams(window.location.search).get('enquiry_id');
    if (!enquiryId) {
        alert('No enquiry ID provided');
        window.history.back();
        return;
    }
    currentEnquiryId = enquiryId;
    await loadDocument(enquiryId);
});

async function loadDocument(id) {
    try {
        const res = await fetch(`${CONFIG.API_URL}/api/enquiry/hbl-document/${id}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json();
        populateDocument(d);
        updateSavedDraftNotice();
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
    document.getElementById('mtdBlNo').textContent = d.enquiry_number || '';

    document.getElementById('consignor').textContent = d.consignor || d.client_name || '';
    document.getElementById('shipmentRefNo').textContent = d.enquiry_number || '';
    document.getElementById('consignee').textContent = d.consignee || '';
    document.getElementById('deliveryAgent').textContent = d.delivery_agent || '';
    document.getElementById('notifyParty1').textContent = d.notify_party_address || '';
    document.getElementById('notifyParty2').textContent = d.notify_party_2_address || '';

    const origin = d.origin || '';
    const dest = d.destination || '';
    document.getElementById('placeAcceptance').textContent = d.place_of_receipt || origin;
    document.getElementById('portLoading').textContent = d.port_of_loading || d.preferred_origin_port || origin;
    document.getElementById('portDischarge').textContent = d.port_of_discharge || d.preferred_destination_port || dest;
    document.getElementById('placeDelivery').textContent = d.final_place_of_delivery || dest;
    document.getElementById('dateAcceptance').textContent = '';
    document.getElementById('routeTranshipment').textContent = '';
    document.getElementById('vesselName').textContent = d.vessel || '';
    document.getElementById('voyageNo').textContent = d.voyage_no || '';
    document.getElementById('modesTransport').textContent = d.mode_of_transport_origin || '';
    document.getElementById('dateDelivery').textContent = fmtDate(d.eta);

    const descParts = [];
    if (d.commodity) descParts.push(d.commodity);
    if (d.hs_code) descParts.push(`HS Code: ${d.hs_code}`);
    document.getElementById('cargoDescription').textContent = descParts.join('\n') || '';

    const wt = [];
    if (d.weight_per_container) {
        wt.push(`${d.weight_per_container} ${d.weight_measurement || 'KG'}`);
        if (d.container_count && d.container_count > 1) {
            const total = d.weight_per_container * d.container_count;
            wt.push(`Total: ${total} ${d.weight_measurement || 'KG'}`);
        }
    }
    document.getElementById('cargoWeight').textContent = wt.join('\n') || '';

    const containerInfo = [];
    if (d.container_type) containerInfo.push(d.container_type);
    if (d.container_count) containerInfo.push(`× ${d.container_count}`);
    document.getElementById('cargoMeasurement').textContent = containerInfo.join(' ') || '';

    document.getElementById('sobDate').textContent = fmtDate(d.sob);
    document.getElementById('placeAndDateOfIssue').textContent = 'Gurugram, ' + new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    document.getElementById('endOfBlNo').textContent = d.enquiry_number || '';
}

function switchBlType(type) {
    const label = document.getElementById('blTypeLabel');
    const count = document.getElementById('mtdOriginalCount');
    const watermark = document.getElementById('watermark');
    const toggleWrap = document.getElementById('watermarkToggleWrap');
    const toggle = document.getElementById('watermarkToggle');
    const draftBanner = document.getElementById('draftBanner');

    if (type === 'seaway') {
        label.textContent = 'SEAWAY BILL OF LADING';
        count.textContent = 'Number of Original MTD: 0 / ZERO';
        watermark.textContent = 'Seaway BL';
        if (toggleWrap) toggleWrap.style.display = 'flex';
        if (toggle) toggle.checked = watermarkEnabled;
        applyWatermarkVisibility();
    } else {
        label.textContent = '';
        count.textContent = 'Number of Original MTD: 3 / THREE';
        if (toggleWrap) toggleWrap.style.display = 'none';
        watermark.classList.add('hidden');
    }

    if (draftBanner) {
        const showDraft = type === 'draft';
        draftBanner.classList.toggle('hidden', !showDraft);
        draftBanner.setAttribute('aria-hidden', showDraft ? 'false' : 'true');
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
