const HBL_PAGE_TITLE = 'HBL / MTD Document – ShipFlow TMS';

let watermarkEnabled = true;
let applySignEnabled = false;
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

const HBL_CARGO_SOURCE_IDS = new Set([
    'containerNos', 'marksNumber', 'cargoDescription', 'cargoWeight', 'cargoMeasurement'
]);

function collectSnapshot() {
    const fields = {};
    for (const id of HBL_SNAPSHOT_FIELD_IDS) {
        const el = document.getElementById(id);
        if (!el) continue;
        fields[id] = HBL_CARGO_SOURCE_IDS.has(id) ? getCargoFullText(id) : el.innerHTML;
    }
    const draftCb = document.getElementById('draftMarkToggle');
    return {
        version: 1,
        savedAt: new Date().toISOString(),
        enquiryId: currentEnquiryId,
        blType: document.getElementById('blTypeSelect').value,
        draftMark: !!(draftCb && draftCb.checked),
        watermarkEnabled,
        applySign: applySignEnabled,
        freight: getFreightSelection(),
        fields
    };
}

function applySnapshot(s) {
    if (!s || !s.fields) return;
    for (const id of HBL_SNAPSHOT_FIELD_IDS) {
        if (s.fields[id] !== undefined) {
            const el = document.getElementById(id);
            if (!el) continue;
            if (HBL_CARGO_SOURCE_IDS.has(id)) {
                el.textContent = s.fields[id];
            } else {
                el.innerHTML = s.fields[id];
            }
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
    if (typeof s.applySign === 'boolean') {
        applySignEnabled = s.applySign;
        const signToggle = document.getElementById('applySignToggle');
        if (signToggle) signToggle.checked = s.applySign;
        applySignatureVisibility();
    }
    if (s.freight) {
        selectFreight(s.freight === 'collect' ? 'collect' : 'prepaid');
    }
    resplitAllCargoFields();
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
        text.textContent = when
            ? `Previously saved copy from ${when}.`
            : 'Previously saved copy available for this enquiry.';
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

function openPreviouslySaved() {
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
    const blType = document.getElementById('blTypeSelect').value;
    const show = blType === 'seaway' && watermarkEnabled;
    ['watermark', 'watermarkPage2'].forEach((id) => {
        const wm = document.getElementById(id);
        if (!wm) return;
        wm.classList.toggle('hidden', !show);
    });
}

function toggleWatermark(enabled) {
    watermarkEnabled = enabled;
    applyWatermarkVisibility();
}

function applySignatureVisibility() {
    const img = document.getElementById('hblAuthSignature');
    const block = document.getElementById('signatureBlock');
    if (!img) return;
    img.classList.toggle('hidden', !applySignEnabled);
    if (block) block.classList.toggle('with-signature', applySignEnabled);
}

function toggleApplySign(enabled) {
    applySignEnabled = enabled;
    applySignatureVisibility();
}

const HBL_CARGO_PREVIEW_MAP = [
    ['containerNos', 'containerNosPreview'],
    ['marksNumber', 'marksNumberPreview'],
    ['cargoDescription', 'cargoDescriptionPreview'],
    ['cargoWeight', 'cargoWeightPreview'],
    ['cargoMeasurement', 'cargoMeasurementPreview']
];

let hblCargoSyncLock = false;

function getCargoCellPlainText(el) {
    if (!el) return '';
    return (el.innerText || el.textContent || '').replace(/\u00a0/g, ' ').trim();
}

function setCargoCellPlainText(el, text) {
    if (!el) return;
    el.textContent = text && text.trim() ? text : '\u00a0';
}

function measureCargoCellInnerBox(el) {
    if (!el) return { width: 80, height: 58 };
    const cs = window.getComputedStyle(el);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const borderY = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    return {
        width: Math.max(20, el.clientWidth - padX),
        height: Math.max(12, el.clientHeight - padY - borderY),
        style: cs
    };
}

function truncateTextToFitCell(text, cellEl) {
    if (!text || !cellEl) return '';
    const { width, height, style } = measureCargoCellInnerBox(cellEl);
    const measure = document.createElement('div');
    measure.style.cssText = [
        'position:fixed', 'left:-9999px', 'top:0', 'visibility:hidden',
        'white-space:pre-line', 'overflow-wrap:break-word', 'word-wrap:break-word',
        `width:${width}px`, `font-size:${style.fontSize}`,
        `font-family:${style.fontFamily}`, `line-height:${style.lineHeight}`,
        `font-weight:${style.fontWeight}`, `padding:${style.paddingTop} ${style.paddingRight} ${style.paddingBottom} ${style.paddingLeft}`
    ].join(';');
    document.body.appendChild(measure);

    let fit = '';
    const paragraphs = text.split('\n');
    for (let p = 0; p < paragraphs.length; p++) {
        const para = paragraphs[p];
        const parts = para.length ? para.split(/(\s+)/) : [''];
        for (const part of parts) {
            if (!part) continue;
            const trial = fit + part;
            measure.textContent = trial;
            if (measure.scrollHeight > height && fit.trim()) break;
            fit = trial;
        }
        if (measure.scrollHeight > height && fit.trim()) break;
        if (p < paragraphs.length - 1) {
            const withNl = fit + '\n';
            measure.textContent = withNl;
            if (measure.scrollHeight > height && fit.trim()) break;
            fit = withNl;
        }
    }

    document.body.removeChild(measure);
    return fit.replace(/\n+$/, '');
}

function mergeCargoParts(head, overflow) {
    const h = (head || '').replace(/\u00a0/g, ' ').replace(/\n+$/, '');
    const o = (overflow || '').replace(/\u00a0/g, ' ').trim();
    if (!h) return o;
    if (!o) return h;
    return `${h}\n${o}`;
}

function splitCargoHeadOverflow(fullText, previewEl) {
    const text = (fullText || '').replace(/\u00a0/g, ' ').trim();
    if (!text) return { head: '', overflow: '' };
    const lines = text.split('\n');
    let maxFit = 0;
    for (let i = 1; i <= lines.length; i++) {
        const head = lines.slice(0, i).join('\n');
        if (truncateTextToFitCell(head, previewEl) === head) {
            maxFit = i;
        } else {
            break;
        }
    }
    return {
        head: lines.slice(0, maxFit).join('\n'),
        overflow: lines.slice(maxFit).join('\n')
    };
}

function getCargoFullText(srcId) {
    const pair = HBL_CARGO_PREVIEW_MAP.find(([sid]) => sid === srcId);
    if (!pair) {
        const el = document.getElementById(srcId);
        return el ? getCargoCellPlainText(el) : '';
    }
    const preview = document.getElementById(pair[1]);
    const src = document.getElementById(srcId);
    return mergeCargoParts(
        preview ? getCargoCellPlainText(preview) : '',
        src ? getCargoCellPlainText(src) : ''
    );
}

function markPreviewOverflow(preview, overflowText) {
    const hasOverflow = !!(overflowText && overflowText.trim());
    preview.classList.toggle('cargo-preview-overflow', hasOverflow);
    preview.title = hasOverflow ? 'Additional lines continue on page 2' : '';
}

function resplitCargoPair(srcId, previewId) {
    const src = document.getElementById(srcId);
    const preview = document.getElementById(previewId);
    if (!src || !preview) return;

    const head = getCargoCellPlainText(preview);
    const overflowPart = getCargoCellPlainText(src);
    const full = mergeCargoParts(head, overflowPart);
    const { head: newHead, overflow: newOverflow } = splitCargoHeadOverflow(full, preview);

    setCargoCellPlainText(preview, newHead);
    setCargoCellPlainText(src, newOverflow);
    markPreviewOverflow(preview, newOverflow);
}

function resplitAllCargoFields() {
    if (hblCargoSyncLock) return;
    hblCargoSyncLock = true;
    const printArea = document.getElementById('hblPrintArea');
    printArea?.classList.add('hbl-measure-preview');
    HBL_CARGO_PREVIEW_MAP.forEach(([srcId, previewId]) => resplitCargoPair(srcId, previewId));
    printArea?.classList.remove('hbl-measure-preview');
    hblCargoSyncLock = false;
}

function syncCargoPreview() {
    resplitAllCargoFields();
}

function syncPreviewToCargo(previewId) {
    const pair = HBL_CARGO_PREVIEW_MAP.find(([, pid]) => pid === previewId);
    if (!pair || hblCargoSyncLock) return;
    hblCargoSyncLock = true;
    const printArea = document.getElementById('hblPrintArea');
    printArea?.classList.add('hbl-measure-preview');
    resplitCargoPair(pair[0], pair[1]);
    printArea?.classList.remove('hbl-measure-preview');
    hblCargoSyncLock = false;
}

function mergeAllCargoForPrint() {
    HBL_CARGO_PREVIEW_MAP.forEach(([srcId, previewId]) => {
        const src = document.getElementById(srcId);
        const preview = document.getElementById(previewId);
        if (!src || !preview) return;
        const full = mergeCargoParts(
            getCargoCellPlainText(preview),
            getCargoCellPlainText(src)
        );
        setCargoCellPlainText(src, full);
    });
}

function bindCargoPreviewSync() {
    HBL_CARGO_PREVIEW_MAP.forEach(([srcId, previewId]) => {
        const src = document.getElementById(srcId);
        if (src && !src.dataset.previewBound) {
            src.dataset.previewBound = '1';
            src.addEventListener('input', syncCargoPreview);
        }
        const preview = document.getElementById(previewId);
        if (preview && !preview.dataset.previewBound) {
            preview.dataset.previewBound = '1';
            preview.addEventListener('input', () => syncPreviewToCargo(previewId));
        }
    });
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resplitAllCargoFields, 120);
    });
}

function printDoc() {
    if (isEditing) toggleEdit();
    resplitAllCargoFields();
    mergeAllCargoForPrint();
    document.title = '\u00A0';
    window.print();
}

let isEditing = false;

function toggleEdit() {
    isEditing = !isEditing;
    const sheets = document.querySelectorAll('#hblPrintArea .mtd-sheet');
    const btn = document.getElementById('editBtn');
    const editables = document.querySelectorAll('#hblPrintArea .editable');

    if (isEditing) {
        sheets.forEach((sheet) => sheet.classList.add('edit-mode'));
        btn.innerHTML = '<i class="fas fa-check"></i> Done Editing';
        btn.style.background = '#2563eb';
        btn.style.color = '#fff';
        editables.forEach((el) => el.setAttribute('contenteditable', 'true'));
    } else {
        sheets.forEach((sheet) => sheet.classList.remove('edit-mode'));
        btn.innerHTML = '<i class="fas fa-pen"></i> Edit';
        btn.style.background = '';
        btn.style.color = '';
        editables.forEach((el) => el.removeAttribute('contenteditable'));
        resplitAllCargoFields();
    }
}

document.addEventListener('DOMContentLoaded', async function () {
    bindCargoPreviewSync();
    window.addEventListener('beforeprint', () => {
        resplitAllCargoFields();
        mergeAllCargoForPrint();
    });
    window.addEventListener('afterprint', function () {
        resplitAllCargoFields();
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
    resplitAllCargoFields();
}

function switchBlType(type) {
    const label = document.getElementById('blTypeLabel');
    const count = document.getElementById('mtdOriginalCount');
    const toggleWrap = document.getElementById('watermarkToggleWrap');
    const toggle = document.getElementById('watermarkToggle');

    if (type === 'seaway') {
        label.textContent = 'SEAWAY BILL OF LADING';
        count.textContent = 'Number of Original MTD: 0 / ZERO';
        ['watermark', 'watermarkPage2'].forEach((id) => {
            const wm = document.getElementById(id);
            if (wm) wm.textContent = 'Seaway BL';
        });
        if (toggleWrap) toggleWrap.style.display = 'flex';
        if (toggle) toggle.checked = watermarkEnabled;
        applyWatermarkVisibility();
    } else {
        label.textContent = '';
        count.textContent = 'Number of Original MTD: 3 / THREE';
        if (toggleWrap) toggleWrap.style.display = 'none';
        ['watermark', 'watermarkPage2'].forEach((id) => {
            const wm = document.getElementById(id);
            if (wm) wm.classList.add('hidden');
        });
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
