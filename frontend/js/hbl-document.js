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
    const draftCb = document.getElementById('draftMarkToggle');
    return {
        version: 1,
        savedAt: new Date().toISOString(),
        enquiryId: currentEnquiryId,
        blType: document.getElementById('blTypeSelect').value,
        draftMark: !!(draftCb && draftCb.checked),
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
    const draftCb = document.getElementById('draftMarkToggle');
    if (sel && s.blType) {
        let bl = s.blType;
        if (bl === 'draft') {
            bl = 'original';
            if (draftCb) draftCb.checked = true;
        } else if (typeof s.draftMark === 'boolean' && draftCb) {
            draftCb.checked = s.draftMark;
        } else if (draftCb) {
            draftCb.checked = false;
        }
        sel.value = bl;
        switchBlType(bl);
    } else if (typeof s.draftMark === 'boolean' && draftCb) {
        draftCb.checked = s.draftMark;
    }
    applyDraftPrefixVisibility();
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

function applyDraftPrefixVisibility() {
    const draftPrefix = document.getElementById('mtdDraftPrefix');
    const cb = document.getElementById('draftMarkToggle');
    if (!draftPrefix) return;
    const show = !!(cb && cb.checked);
    draftPrefix.classList.toggle('hidden', !show);
    draftPrefix.setAttribute('aria-hidden', show ? 'false' : 'true');
}

function toggleDraftMark() {
    applyDraftPrefixVisibility();
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

const HBL_CARGO_FIELD_IDS = [
    'containerNos', 'marksNumber', 'cargoDescription', 'cargoWeight', 'cargoMeasurement'
];

let hblPaginationBackup = null;

function getCargoCellPlainText(el) {
    if (!el) return '';
    return (el.innerText || el.textContent || '').replace(/\u00a0/g, ' ').trim();
}

function setCargoCellPlainText(el, text) {
    if (!el) return;
    el.textContent = text && text.trim() ? text : '\u00a0';
}

function getCargoContentHeightPx() {
    const printArea = document.getElementById('hblPrintArea');
    const sample = document.querySelector('#cargoTable .cargo-data-row td');
    if (!sample) return 58;
    printArea?.classList.add('hbl-measure-print');
    const h = sample.clientHeight;
    printArea?.classList.remove('hbl-measure-print');
    return h > 0 ? h : 58;
}

function splitTextIntoChunks(text, maxWidth, maxHeight, style) {
    if (!text) return [''];
    const measure = document.createElement('div');
    measure.style.cssText = [
        'position:fixed', 'left:-9999px', 'top:0', 'visibility:hidden',
        'white-space:pre-line', 'overflow-wrap:break-word', 'word-wrap:break-word',
        `width:${maxWidth}px`, `font-size:${style.fontSize}`,
        `font-family:${style.fontFamily}`, `line-height:${style.lineHeight}`,
        `font-weight:${style.fontWeight}`, `padding:${style.padding}`
    ].join(';');
    document.body.appendChild(measure);

    const chunks = [];
    let current = '';
    const paragraphs = text.split('\n');

    const pushChunk = () => {
        const trimmed = current.replace(/\n+$/, '');
        if (trimmed || chunks.length === 0) chunks.push(trimmed);
        current = '';
    };

    for (let p = 0; p < paragraphs.length; p++) {
        const para = paragraphs[p];
        const parts = para.length ? para.split(/(\s+)/) : [''];
        for (const part of parts) {
            if (!part) continue;
            const trial = current + part;
            measure.textContent = trial;
            if (measure.scrollHeight > maxHeight && current.trim()) {
                pushChunk();
                current = part.replace(/^\s+/, '') || part;
            } else {
                current = trial;
            }
        }
        if (p < paragraphs.length - 1) current += '\n';
    }
    if (current.trim() || chunks.length === 0) pushChunk();

    document.body.removeChild(measure);
    return chunks.length ? chunks : [''];
}

function splitCargoFieldIntoChunks(fieldId, maxContentHeight) {
    const el = document.getElementById(fieldId);
    if (!el) return [''];
    const text = getCargoCellPlainText(el);
    if (!text) return [''];
    const cs = window.getComputedStyle(el);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const innerWidth = Math.max(20, el.clientWidth - padX);
    const innerHeight = Math.max(12, maxContentHeight - padY);
    return splitTextIntoChunks(text, innerWidth, innerHeight, {
        fontSize: cs.fontSize,
        fontFamily: cs.fontFamily,
        lineHeight: cs.lineHeight,
        fontWeight: cs.fontWeight,
        padding: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`
    });
}

function buildContinuationCargoTable(chunksByField, pageIndex, includeParticulars) {
    const table = document.createElement('table');
    table.className = 'cargo-table';
    table.innerHTML = `
        <colgroup>
            <col style="width: 12%;"><col style="width: 12%;"><col style="width: 44%;">
            <col style="width: 16%;"><col style="width: 16%;">
        </colgroup>
        <thead><tr>
            <th>Container No(s)</th><th>Marks &amp; Number</th>
            <th>Number of packages, Kind of packages, General description of goods</th>
            <th>Gross Weight</th><th>Measurement</th>
        </tr></thead>
        <tbody><tr class="cargo-data-row"></tr></tbody>
        ${includeParticulars ? `<tfoot><tr><td colspan="5" class="particulars-note">Particulars above furnished by consignee/consignor</td></tr></tfoot>` : ''}`;
    const row = table.querySelector('tr.cargo-data-row');
    HBL_CARGO_FIELD_IDS.forEach((id) => {
        const td = document.createElement('td');
        const arr = chunksByField[id] || [''];
        const val = arr[pageIndex] || '';
        td.textContent = val.trim() ? val : '\u00a0';
        row.appendChild(td);
    });
    return table;
}

function cloneWatermarkForContinuation() {
    const src = document.getElementById('watermark');
    if (!src) return null;
    const w = src.cloneNode(true);
    w.removeAttribute('id');
    if (src.classList.contains('hidden')) w.classList.add('hidden');
    return w;
}

function prepareHblPrintPagination() {
    cleanupHblPrintPagination();

    const printArea = document.getElementById('hblPrintArea');
    const primaryPage = document.getElementById('hblPrimaryPage');
    const endBlock = document.getElementById('hblEndOfBlBlock');
    const contHost = document.getElementById('hblCargoContinuations');
    const cargoFoot = document.getElementById('cargoTableFoot');
    if (!printArea || !contHost) return;

    const maxContentHeight = getCargoContentHeightPx();
    const chunksByField = {};
    HBL_CARGO_FIELD_IDS.forEach((id) => {
        chunksByField[id] = splitCargoFieldIntoChunks(id, maxContentHeight);
    });
    const pageCount = Math.max(1, ...HBL_CARGO_FIELD_IDS.map((id) => chunksByField[id].length));

    if (pageCount <= 1) return;

    hblPaginationBackup = {
        cellTexts: {},
        endParent: endBlock?.parentNode,
        endNext: endBlock?.nextSibling
    };
    HBL_CARGO_FIELD_IDS.forEach((id) => {
        const el = document.getElementById(id);
        hblPaginationBackup.cellTexts[id] = el ? el.innerHTML : '';
    });

    HBL_CARGO_FIELD_IDS.forEach((id) => {
        setCargoCellPlainText(document.getElementById(id), chunksByField[id][0] || '');
    });

    printArea.classList.add('hbl-print-paginated');
    primaryPage?.classList.add('hbl-has-continuations');
    endBlock?.classList.add('hbl-detached-tail');
    cargoFoot?.classList.add('hbl-hide-on-print-split');

    for (let p = 1; p < pageCount; p++) {
        const isLast = p === pageCount - 1;
        const page = document.createElement('div');
        page.className = 'hbl-cargo-continuation';

        const sheet = document.createElement('div');
        sheet.className = 'mtd-sheet';
        const wm = cloneWatermarkForContinuation();
        if (wm) sheet.appendChild(wm);

        const frame = document.createElement('div');
        frame.className = 'mtd-grid-frame';
        frame.appendChild(buildContinuationCargoTable(chunksByField, p, isLast));
        sheet.appendChild(frame);
        page.appendChild(sheet);

        if (isLast && endBlock) page.appendChild(endBlock);

        contHost.appendChild(page);
    }

    contHost.setAttribute('aria-hidden', 'false');
}

function cleanupHblPrintPagination() {
    const printArea = document.getElementById('hblPrintArea');
    const contHost = document.getElementById('hblCargoContinuations');
    const primaryPage = document.getElementById('hblPrimaryPage');
    const endBlock = document.getElementById('hblEndOfBlBlock');
    const cargoFoot = document.getElementById('cargoTableFoot');

    if (hblPaginationBackup) {
        HBL_CARGO_FIELD_IDS.forEach((id) => {
            const el = document.getElementById(id);
            if (el && hblPaginationBackup.cellTexts[id] !== undefined) {
                el.innerHTML = hblPaginationBackup.cellTexts[id];
            }
        });
        if (endBlock && hblPaginationBackup.endParent) {
            hblPaginationBackup.endParent.insertBefore(endBlock, hblPaginationBackup.endNext);
        }
        hblPaginationBackup = null;
    }

    if (contHost) {
        contHost.innerHTML = '';
        contHost.setAttribute('aria-hidden', 'true');
    }
    printArea?.classList.remove('hbl-print-paginated', 'hbl-measure-print');
    primaryPage?.classList.remove('hbl-has-continuations');
    endBlock?.classList.remove('hbl-detached-tail');
    cargoFoot?.classList.remove('hbl-hide-on-print-split');
}

function printDoc() {
    if (isEditing) toggleEdit();
    prepareHblPrintPagination();
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
    window.addEventListener('beforeprint', prepareHblPrintPagination);
    window.addEventListener('afterprint', function () {
        cleanupHblPrintPagination();
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

    applyDraftPrefixVisibility();
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
