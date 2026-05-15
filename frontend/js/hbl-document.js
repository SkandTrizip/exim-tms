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

function collectSnapshot() {
    const fields = {};
    for (const id of HBL_SNAPSHOT_FIELD_IDS) {
        const el = document.getElementById(id);
        const cargoPair = HBL_CARGO_PREVIEW_MAP.find(([page2Id]) => page2Id === id);
        if (cargoPair) {
            fields[id] = getCargoFullText(cargoPair[0], cargoPair[1]);
        } else {
            fields[id] = el ? el.innerHTML : '';
        }
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
        cargoBoxHeight: getCargoBoxHeightPx(),
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
    if (typeof s.applySign === 'boolean') {
        applySignEnabled = s.applySign;
        const signToggle = document.getElementById('applySignToggle');
        if (signToggle) signToggle.checked = s.applySign;
        applySignatureVisibility();
    }
    if (typeof s.cargoBoxHeight === 'number') {
        applyCargoBoxHeight(s.cargoBoxHeight, { skipSplit: true, persist: false });
    }
    if (s.freight) {
        selectFreight(s.freight === 'collect' ? 'collect' : 'prepaid');
    }
    splitCargoFromStoredFull();
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

const HBL_CARGO_HEIGHT_KEY = 'hbl_cargo_box_height';
const HBL_CARGO_HEIGHT_MIN = 80;
const HBL_CARGO_HEIGHT_MAX = 500;
const HBL_CARGO_HEIGHT_DEFAULT = 180;
const HBL_CARGO_HEIGHT_STEP = 24;

function getCargoPreviewCell(previewId) {
    return document.getElementById(previewId);
}

function getCargoPreviewEditor(previewId) {
    const cell = getCargoPreviewCell(previewId);
    if (!cell) return null;
    return cell.querySelector('.cargo-preview-inner') || cell;
}

function resolveCargoTextEl(elOrPreviewId) {
    if (typeof elOrPreviewId === 'string') return getCargoPreviewEditor(elOrPreviewId);
    if (!elOrPreviewId) return null;
    return elOrPreviewId.querySelector?.('.cargo-preview-inner') || elOrPreviewId;
}

function getCargoBoxHeightPx() {
    const box = document.getElementById('hblCargoPage1Box');
    if (!box) return HBL_CARGO_HEIGHT_DEFAULT;
    const raw = getComputedStyle(box).getPropertyValue('--hbl-cargo-row-h').trim();
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : HBL_CARGO_HEIGHT_DEFAULT;
}

function applyCargoBoxHeight(px, options = {}) {
    const box = document.getElementById('hblCargoPage1Box');
    if (!box) return;
    const h = Math.round(Math.max(HBL_CARGO_HEIGHT_MIN, Math.min(HBL_CARGO_HEIGHT_MAX, px)));
    box.style.setProperty('--hbl-cargo-row-h', `${h}px`);
    const label = document.getElementById('hblCargoHeightLabel');
    if (label) label.textContent = `${h}px`;
    if (options.persist !== false) {
        try { localStorage.setItem(HBL_CARGO_HEIGHT_KEY, String(h)); } catch (e) { /* ignore */ }
    }
    if (!options.skipSplit && !isEditing) splitAllCargoFields();
}

function adjustCargoBoxHeight(delta) {
    applyCargoBoxHeight(getCargoBoxHeightPx() + delta);
}

function initCargoBoxResize() {
    let saved;
    try { saved = parseInt(localStorage.getItem(HBL_CARGO_HEIGHT_KEY), 10); } catch (e) { /* ignore */ }
    applyCargoBoxHeight(Number.isFinite(saved) ? saved : HBL_CARGO_HEIGHT_DEFAULT, { skipSplit: true, persist: false });

    const handle = document.getElementById('hblCargoResizeHandle');
    if (!handle) return;

    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const startY = e.clientY;
        const startH = getCargoBoxHeightPx();
        const onMove = (ev) => {
            applyCargoBoxHeight(startH + (ev.clientY - startY), { skipSplit: true, persist: false });
        };
        const onUp = (ev) => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            applyCargoBoxHeight(startH + (ev.clientY - startY), { skipSplit: false, persist: true });
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
}

function getCargoCellPlainText(elOrPreviewId) {
    const el = resolveCargoTextEl(elOrPreviewId);
    if (!el) return '';
    return (el.innerText || el.textContent || '').replace(/\u00a0/g, ' ').trim();
}

function getCargoCellRawText(elOrPreviewId) {
    const el = resolveCargoTextEl(elOrPreviewId);
    if (!el) return '';
    return (el.innerText || el.textContent || '').replace(/\u00a0/g, ' ');
}

function setCargoCellPlainText(el, text) {
    if (!el) return;
    const next = text && text.trim() ? text : '\u00a0';
    if (el.textContent === next) return;
    el.textContent = next;
}

function measureCargoCellInnerBox(cellEl) {
    if (!cellEl) return { width: 80, height: 58 };
    const cs = window.getComputedStyle(cellEl);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const borderY = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    return {
        width: Math.max(20, cellEl.clientWidth - padX),
        height: Math.max(12, cellEl.clientHeight - padY - borderY),
        style: cs
    };
}

function truncateTextToFitCell(text, previewCellEl) {
    if (!text || !previewCellEl) return '';
    const { width, height, style } = measureCargoCellInnerBox(previewCellEl);
    const measure = document.createElement('div');
    measure.style.cssText = [
        'position:fixed', 'left:-9999px', 'top:0', 'visibility:hidden',
        'white-space:pre-line', 'overflow-wrap:break-word', 'word-wrap:break-word',
        `width:${width}px`, `font-size:${style.fontSize}`,
        `font-family:${style.fontFamily}`, `line-height:${style.lineHeight}`,
        `font-weight:${style.fontWeight}`, `padding:0`
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

function getCargoFullText(page2Id, previewId) {
    const head = getCargoCellPlainText(previewId);
    const tail = getCargoCellPlainText(document.getElementById(page2Id));
    return head + tail;
}

function setCargoSplit(page2Id, previewId, fullText) {
    const preview = getCargoPreviewCell(previewId);
    const editor = getCargoPreviewEditor(previewId);
    const page2 = document.getElementById(page2Id);
    if (!preview || !editor || !page2) return;
    const head = truncateTextToFitCell(fullText || '', preview);
    const tail = fullText.length > head.length ? fullText.slice(head.length) : '';
    setCargoCellPlainText(editor, head);
    setCargoCellPlainText(page2, tail);
    preview.dataset.shownLen = String(head.length);
    markPreviewOverflow(preview, fullText, head);
}

function markPreviewOverflow(preview, fullText, headText) {
    const overflow = (fullText || '').length > (headText || '').length;
    preview.classList.toggle('cargo-preview-overflow', overflow);
    preview.title = overflow ? 'Continued on page 2' : '';
}

function splitAllCargoFields(options = {}) {
    if (hblCargoSyncLock) return;
    hblCargoSyncLock = true;
    const printArea = document.getElementById('hblPrintArea');
    if (options.usePrintMetrics) printArea?.classList.add('hbl-print-measure');
    HBL_CARGO_PREVIEW_MAP.forEach(([page2Id, previewId]) => {
        const full = getCargoFullText(page2Id, previewId);
        setCargoSplit(page2Id, previewId, full);
    });
    if (options.usePrintMetrics && !options.keepMeasure) {
        printArea?.classList.remove('hbl-print-measure');
    }
    hblCargoSyncLock = false;
}

/** Print exactly what is on screen — do not re-split or change cargo text before PDF. */
function prepareCargoForPrint() {
    document.getElementById('hblPrintArea')?.classList.add('hbl-print-wysiwyg');
}

function finishEditingWithoutResplit() {
    if (!isEditing) return;
    isEditing = false;
    const sheets = document.querySelectorAll('#hblPrintArea .mtd-sheet');
    const btn = document.getElementById('editBtn');
    const editables = document.querySelectorAll('#hblPrintArea .editable');
    sheets.forEach((sheet) => sheet.classList.remove('edit-mode'));
    if (btn) {
        btn.innerHTML = '<i class="fas fa-pen"></i> Edit';
        btn.style.background = '';
        btn.style.color = '';
    }
    editables.forEach((el) => el.removeAttribute('contenteditable'));
}

function splitCargoFromStoredFull() {
    if (hblCargoSyncLock) return;
    hblCargoSyncLock = true;
    HBL_CARGO_PREVIEW_MAP.forEach(([page2Id, previewId]) => {
        const page2 = document.getElementById(page2Id);
        if (!page2) return;
        const full = getCargoCellPlainText(page2);
        setCargoSplit(page2Id, previewId, full);
    });
    hblCargoSyncLock = false;
}

function flushPreviewCargo(previewId) {
    if (hblCargoSyncLock) return;
    const preview = getCargoPreviewCell(previewId);
    const editor = getCargoPreviewEditor(previewId);
    const page2Id = preview?.dataset.cargoSource;
    const page2 = page2Id ? document.getElementById(page2Id) : null;
    if (!preview || !editor || !page2) return;

    hblCargoSyncLock = true;
    const rawHead = getCargoCellRawText(editor);
    let tail = getCargoCellPlainText(page2);
    const truncated = truncateTextToFitCell(rawHead, preview);

    if (truncated.length < rawHead.length) {
        tail = rawHead.slice(truncated.length) + tail;
        setCargoCellPlainText(editor, truncated);
        setCargoCellPlainText(page2, tail);
    }

    preview.dataset.shownLen = String(truncated.length);
    markPreviewOverflow(preview, rawHead + tail, truncated);
    hblCargoSyncLock = false;
}

function flushAllPreviewCargo() {
    HBL_CARGO_PREVIEW_MAP.forEach(([, previewId]) => flushPreviewCargo(previewId));
}

function prepareCargoEditorForTyping(editor) {
    if (!editor) return;
    const t = editor.textContent || '';
    if (t === '\u00a0' || t.trim() === '') {
        editor.textContent = '';
    }
}

function placeCaretAtEnd(el) {
    if (!el) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
}

function syncPage2Cargo(page2Id) {
    if (hblCargoSyncLock) return;
    const pair = HBL_CARGO_PREVIEW_MAP.find(([id]) => id === page2Id);
    if (!pair) return;
    const preview = getCargoPreviewCell(pair[1]);
    const page2 = document.getElementById(page2Id);
    if (!preview || !page2) return;
    const head = getCargoCellPlainText(pair[1]);
    const tail = getCargoCellPlainText(page2);
    markPreviewOverflow(preview, head + tail, head);
}

function bindCargoPreviewSync() {
    HBL_CARGO_PREVIEW_MAP.forEach(([page2Id, previewId]) => {
        const page2 = document.getElementById(page2Id);
        if (page2 && !page2.dataset.previewBound) {
            page2.dataset.previewBound = '1';
            page2.addEventListener('input', () => syncPage2Cargo(page2Id));
        }
        const cell = getCargoPreviewCell(previewId);
        const editor = getCargoPreviewEditor(previewId);
        if (editor && !editor.dataset.previewBound) {
            editor.dataset.previewBound = '1';
            editor.addEventListener('focus', () => {
                prepareCargoEditorForTyping(editor);
            });
            editor.addEventListener('focusout', (e) => {
                if (e.relatedTarget && cell?.contains(e.relatedTarget)) return;
                flushPreviewCargo(previewId);
            });
        }
    });
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (!isEditing) splitAllCargoFields();
        }, 120);
    });
}

function printDoc() {
    finishEditingWithoutResplit();
    prepareCargoForPrint();
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
        editables.forEach((el) => {
            el.setAttribute('contenteditable', 'true');
            if (el.classList.contains('cargo-preview-inner')) {
                el.setAttribute('dir', 'ltr');
                prepareCargoEditorForTyping(el);
            }
        });
    } else {
        sheets.forEach((sheet) => sheet.classList.remove('edit-mode'));
        btn.innerHTML = '<i class="fas fa-pen"></i> Edit';
        btn.style.background = '';
        btn.style.color = '';
        editables.forEach((el) => el.removeAttribute('contenteditable'));
        flushAllPreviewCargo();
        splitAllCargoFields();
    }
}

document.addEventListener('DOMContentLoaded', async function () {
    initCargoBoxResize();
    bindCargoPreviewSync();
    window.addEventListener('beforeprint', prepareCargoForPrint);
    window.addEventListener('afterprint', function () {
        const printArea = document.getElementById('hblPrintArea');
        printArea?.classList.remove('hbl-print-measure', 'hbl-print-wysiwyg');
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
    const wt = [];
    if (d.weight_per_container) {
        wt.push(`${d.weight_per_container} ${d.weight_measurement || 'KG'}`);
        if (d.container_count && d.container_count > 1) {
            const total = d.weight_per_container * d.container_count;
            wt.push(`Total: ${total} ${d.weight_measurement || 'KG'}`);
        }
    }

    const containerInfo = [];
    if (d.container_type) containerInfo.push(d.container_type);
    if (d.container_count) containerInfo.push(`× ${d.container_count}`);

    setCargoSplit('cargoDescription', 'cargoDescriptionPreview', descParts.join('\n') || '');
    setCargoSplit('cargoWeight', 'cargoWeightPreview', wt.join('\n') || '');
    setCargoSplit('cargoMeasurement', 'cargoMeasurementPreview', containerInfo.join(' ') || '');
    setCargoSplit('containerNos', 'containerNosPreview', '');
    setCargoSplit('marksNumber', 'marksNumberPreview', '');

    document.getElementById('sobDate').textContent = fmtDate(d.sob);
    document.getElementById('placeAndDateOfIssue').textContent = 'Gurugram, ' + new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    document.getElementById('endOfBlNo').textContent = d.enquiry_number || '';
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
