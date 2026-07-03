const HBL_PAGE_TITLE = 'HBL / MTD Document – Logipod Atlas';
const HBL_TERMS_PDF_URL = 'Reverse%20side%20terms%20%26%20conditions%20new.pdf';
const HBL_PDFJS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const HBL_TERMS_PAGE_MARGIN_MM = 5;
const HBL_TERMS_LOGICAL_DPI = 150;
const HBL_TERMS_RENDER_QUALITY = 3;
const HBL_TERMS_LOADED_VERSION = '3';

let hblTermsPagesReady = false;
let hblTermsPagesPromise = null;

let watermarkEnabled = true;
let applySignEnabled = false;
let currentEnquiryId = null;
let isEditing = false;

const HBL_SNAPSHOT_FIELD_IDS = [
    'mtdBlNo', 'consignor', 'shipmentRefNo', 'consignee', 'deliveryAgent',
    'notifyParty1', 'notifyParty2', 'placeAcceptance', 'portLoading', 'dateAcceptance',
    'portDischarge', 'placeDelivery', 'routeTranshipment', 'vesselName', 'voyageNo',
    'modesTransport', 'dateDelivery', 'containerNos', 'marksNumber', 'cargoDescription',
    'cargoWeight', 'cargoMeasurement', 'sobDate', 'placeAndDateOfIssue', 'endOfBlNo'
];

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
            // Use textContent so whitespace/newlines/alignment via spaces survives restore.
            // (innerHTML can be rewritten by the browser during contenteditable editing.)
            fields[id] = el ? (el.textContent || '') : '';
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
        freight: getFreightSelection(),
        fields
    };
}

function applySnapshot(s) {
    if (!s || !s.fields) return;
    for (const id of HBL_SNAPSHOT_FIELD_IDS) {
        if (s.fields[id] !== undefined) {
            const el = document.getElementById(id);
            if (el) el.textContent = s.fields[id] ?? '';
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
    splitCargoFromStoredFull();
}

async function fetchSavedSnapshot(enquiryId = currentEnquiryId) {
    if (!enquiryId) return { snapshot: null, saved_at: null };
    try {
        const res = await fetch(`${CONFIG.API_URL}/api/enquiry/hbl-document/${enquiryId}/snapshot`);
        if (!res.ok) return { snapshot: null, saved_at: null };
        return await res.json();
    } catch {
        return { snapshot: null, saved_at: null };
    }
}

function prepareDocumentForSave() {
    if (!isEditing) return;
    finishEditingWithoutResplit();
    flushAllPreviewCargo();
    splitAllCargoFields();
}

function flashSaveButton() {
    const btn = document.getElementById('saveLocalBtn');
    if (!btn) return;
    const prev = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check"></i> Saved';
    setTimeout(() => { btn.innerHTML = prev; }, 2200);
}

async function saveDocumentToServer(options = {}) {
    const { silent = false } = options;
    if (!currentEnquiryId) return false;
    try {
        prepareDocumentForSave();
        const snapshot = collectSnapshot();
        const res = await fetch(`${CONFIG.API_URL}/api/enquiry/hbl-document/${currentEnquiryId}/snapshot`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ snapshot }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const saved = await res.json();
        if (!silent) flashSaveButton();
        return true;
    } catch (e) {
        console.error(e);
        if (!silent) alert('Could not save to server. Please try again.');
        return false;
    }
}

function setReadOnlySavedView() {
    // No edit/save/restore on this page: show the saved snapshot only.
    isEditing = false;
    document.body.classList.remove('edit-mode');

    document.querySelectorAll('.editable').forEach((el) => {
        el.removeAttribute('contenteditable');
    });

    const idsToHide = ['editBtn', 'saveLocalBtn', 'viewDraftBtn'];
    idsToHide.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.hidden = true;
        el.setAttribute('aria-hidden', 'true');
        el.style.display = 'none';
        el.tabIndex = -1;
    });
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

function applyViewDraftMode() {
    const draftCb = document.getElementById('draftMarkToggle');
    if (draftCb) draftCb.checked = true;
    applyDraftPrefixVisibility();
}

function viewDraftFromToolbar() {
    applyViewDraftMode();
    document.getElementById('hblPrintArea')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function applyWatermarkVisibility() {
    const blType = document.getElementById('blTypeSelect').value;
    const show = blType === 'seaway' && watermarkEnabled;
    ['watermarkLayer', 'watermarkLayerPage2'].forEach((id) => {
        const layer = document.getElementById(id);
        if (!layer) return;
        layer.classList.toggle('hidden', !show);
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

const HBL_CARGO_ROW_HEIGHT_PX = 190;

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

function normalizeCargoText(text) {
    return (text || '').replace(/\u00a0/g, ' ').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function getCargoCellPlainText(elOrPreviewId) {
    const el = resolveCargoTextEl(elOrPreviewId);
    if (!el) return '';
    return normalizeCargoText(el.innerText || el.textContent || '').trim();
}

function getCargoCellRawText(elOrPreviewId) {
    const el = resolveCargoTextEl(elOrPreviewId);
    if (!el) return '';
    return normalizeCargoText(el.innerText || el.textContent || '');
}

function setCargoCellPlainText(el, text) {
    if (!el) return;
    const normalized = normalizeCargoText(text);
    const next = normalized.length ? normalized : '\u00a0';
    if (el.textContent === next) return;
    el.textContent = next;
}

// #hblCargoPage1Box .cargo-preview-inner has 0 padding on screen but gets
// `padding: 2px 4px !important` under @media print (see hbl-document.html). The split
// point is only ever computed on screen, so without reserving this margin here, text
// that just fits on screen gets clipped once print padding shrinks its real box.
const HBL_CARGO_PRINT_PAD_X = 8;
const HBL_CARGO_PRINT_PAD_Y = 4;

function measureCargoCellInnerBox(cellEl) {
    if (!cellEl) return { width: 80, height: 58 };
    const cs = window.getComputedStyle(cellEl);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const borderY = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    return {
        width: Math.max(20, cellEl.clientWidth - padX - HBL_CARGO_PRINT_PAD_X),
        height: Math.max(12, cellEl.clientHeight - padY - borderY - HBL_CARGO_PRINT_PAD_Y),
        style: cs
    };
}

function createCargoMeasureEl(width, style) {
    const measure = document.createElement('div');
    measure.style.cssText = [
        'position:fixed', 'left:-9999px', 'top:0', 'visibility:hidden',
        'white-space:pre-line', 'overflow-wrap:break-word', 'word-wrap:break-word',
        `width:${width}px`, `font-size:${style.fontSize}`,
        `font-family:${style.fontFamily}`, `line-height:${style.lineHeight}`,
        `font-weight:${style.fontWeight}`, `padding:0`
    ].join(';');
    document.body.appendChild(measure);
    return measure;
}

function measureCargoTextHeight(text, measure) {
    measure.textContent = text.length ? text : ' ';
    return measure.scrollHeight;
}

/** Word-wrap split for one line that exceeds the box height. */
function truncateLineToFitHeight(line, measure, maxHeight) {
    if (!line) return '';
    let fit = '';
    const parts = line.split(/(\s+)/);
    for (const part of parts) {
        if (!part) continue;
        const trial = fit + part;
        measure.textContent = trial;
        if (measure.scrollHeight > maxHeight && fit.trim()) break;
        fit = trial;
    }
    return fit;
}

/**
 * Split cargo for page 1 / page 2 at whole-line boundaries when possible.
 * Multi-line input keeps one line per row; only a single over-tall line is word-split.
 */
function splitCargoTextForPreview(text, previewCellEl) {
    const normalized = normalizeCargoText(text);
    if (!normalized || !previewCellEl) {
        return { head: '', tail: '', splitAtLineBoundary: true };
    }

    const { width, height, style } = measureCargoCellInnerBox(previewCellEl);
    const measure = createCargoMeasureEl(width, style);
    const lines = normalized.split('\n');

    let fitLineCount = 0;
    for (let i = 1; i <= lines.length; i++) {
        const trialHead = lines.slice(0, i).join('\n');
        if (measureCargoTextHeight(trialHead, measure) > height) break;
        fitLineCount = i;
    }

    if (fitLineCount > 0) {
        const head = lines.slice(0, fitLineCount).join('\n');
        const tail = lines.slice(fitLineCount).join('\n');
        document.body.removeChild(measure);
        return { head, tail, splitAtLineBoundary: true };
    }

    const firstLine = lines[0] ?? '';
    const head = truncateLineToFitHeight(firstLine, measure, height);
    const firstRemainder = firstLine.slice(head.length);
    const tailParts = [];
    if (firstRemainder) tailParts.push(firstRemainder);
    if (lines.length > 1) tailParts.push(lines.slice(1).join('\n'));
    const tail = tailParts.join('\n');
    document.body.removeChild(measure);
    return { head, tail, splitAtLineBoundary: false };
}

function joinCargoHeadTail(head, tail, splitAtLineBoundary) {
    const h = normalizeCargoText(head);
    const t = normalizeCargoText(tail);
    // Empty cells hold a lone " " placeholder which normalizes to " " (truthy) —
    // treat whitespace-only head/tail as empty or a stray blank line leaks into the join.
    const hEmpty = h.trim() === '';
    const tEmpty = t.trim() === '';
    if (hEmpty) return tEmpty ? '' : t;
    if (tEmpty) return h;
    if (!splitAtLineBoundary) return h + t;
    if (h.endsWith('\n') || t.startsWith('\n')) return h + t;
    return `${h}\n${t}`;
}

function getCargoFullText(page2Id, previewId) {
    const preview = getCargoPreviewCell(previewId);
    const head = getCargoCellRawText(previewId);
    const tail = getCargoCellRawText(document.getElementById(page2Id));
    const atLine = preview?.dataset.cargoSplitAtLine !== '0';
    return joinCargoHeadTail(head, tail, atLine);
}

function setCargoSplit(page2Id, previewId, fullText) {
    const preview = getCargoPreviewCell(previewId);
    const editor = getCargoPreviewEditor(previewId);
    const page2 = document.getElementById(page2Id);
    if (!preview || !editor || !page2) return;
    const { head, tail, splitAtLineBoundary } = splitCargoTextForPreview(fullText || '', preview);
    setCargoCellPlainText(editor, head);
    setCargoCellPlainText(page2, tail);
    preview.dataset.shownLen = String(head.length);
    preview.dataset.cargoSplitAtLine = splitAtLineBoundary ? '1' : '0';
}

function cargoFieldHasOverflow(page2Id) {
    const page2 = document.getElementById(page2Id);
    return getCargoCellPlainText(page2).length > 0;
}

function hasAnyCargoOverflow() {
    return HBL_CARGO_PREVIEW_MAP.some(([page2Id]) => cargoFieldHasOverflow(page2Id));
}

function placeEndOfBlBlock(anyOverflow) {
    const endBlock = document.getElementById('hblEndOfBlBlock');
    const anchor = document.getElementById(anyOverflow ? 'hblEndOfBlAnchorPage2' : 'hblEndOfBlAnchorPage1');
    if (endBlock && anchor && endBlock.parentElement !== anchor) {
        anchor.appendChild(endBlock);
    }
}

function updateCargoOverflowState() {
    const box = document.getElementById('hblCargoPage1Box');
    const note = document.getElementById('hblCargoContinuedNote');
    const page2 = document.getElementById('hblPage2');
    const anyOverflow = hasAnyCargoOverflow();
    box?.classList.toggle('has-cargo-overflow', anyOverflow);
    page2?.classList.toggle('hidden', !anyOverflow);
    page2?.setAttribute('aria-hidden', anyOverflow ? 'false' : 'true');
    placeEndOfBlBlock(anyOverflow);
    if (note) {
        note.classList.toggle('hidden', !anyOverflow);
        note.setAttribute('aria-hidden', anyOverflow ? 'false' : 'true');
    }
}

/**
 * Re-splitting a cargo field can flip on `has-cargo-overflow`, which shrinks the
 * page-1 row height (to make room for the "Contd." note) for every column at once.
 * That shrink can push previously-fitting columns into overflow too, so once it
 * happens we must re-run the split against the corrected height — otherwise the
 * page-1/page-2 boundary is computed against a row height that no longer applies.
 */
function applyCargoSplitsWithOverflowCorrection(fullTextByPreviewId) {
    const applyPass = () => {
        HBL_CARGO_PREVIEW_MAP.forEach(([page2Id, previewId]) => {
            setCargoSplit(page2Id, previewId, fullTextByPreviewId[previewId] || '');
        });
    };
    applyPass();
    updateCargoOverflowState();
    if (document.getElementById('hblCargoPage1Box')?.classList.contains('has-cargo-overflow')) {
        applyPass();
        updateCargoOverflowState();
    }
}

function splitAllCargoFields() {
    if (hblCargoSyncLock) return;
    hblCargoSyncLock = true;
    const fullTextByPreviewId = {};
    HBL_CARGO_PREVIEW_MAP.forEach(([page2Id, previewId]) => {
        fullTextByPreviewId[previewId] = getCargoFullText(page2Id, previewId);
    });
    applyCargoSplitsWithOverflowCorrection(fullTextByPreviewId);
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
    const fullTextByPreviewId = {};
    HBL_CARGO_PREVIEW_MAP.forEach(([page2Id, previewId]) => {
        const page2 = document.getElementById(page2Id);
        fullTextByPreviewId[previewId] = page2 ? getCargoCellRawText(page2) : '';
    });
    applyCargoSplitsWithOverflowCorrection(fullTextByPreviewId);
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
    const box = document.getElementById('hblCargoPage1Box');
    const hadOverflow = !!box?.classList.contains('has-cargo-overflow');

    const rawHead = getCargoCellRawText(editor);
    let tail = getCargoCellRawText(page2);
    const full = joinCargoHeadTail(rawHead, tail, preview.dataset.cargoSplitAtLine !== '0');
    const { head, tail: newTail, splitAtLineBoundary } = splitCargoTextForPreview(full, preview);

    if (head !== rawHead || newTail !== tail) {
        setCargoCellPlainText(editor, head);
        setCargoCellPlainText(page2, newTail);
    }

    preview.dataset.shownLen = String(head.length);
    preview.dataset.cargoSplitAtLine = splitAtLineBoundary ? '1' : '0';
    updateCargoOverflowState();

    // All 5 cargo columns share one row height, so the instant any column starts (or
    // stops) overflowing onto page 2, the "Contd." note eats into every column's box —
    // even ones nobody just edited. Re-split every column now against the corrected
    // height; otherwise the other columns sit visually clipped until the next full
    // resplit (Done Editing / Save), which is what makes text look like it "jumps" to
    // page 2 only after saving.
    const nowOverflow = !!box?.classList.contains('has-cargo-overflow');
    if (nowOverflow !== hadOverflow) {
        const fullTextByPreviewId = {};
        HBL_CARGO_PREVIEW_MAP.forEach(([pid2, pvid]) => {
            fullTextByPreviewId[pvid] = getCargoFullText(pid2, pvid);
        });
        applyCargoSplitsWithOverflowCorrection(fullTextByPreviewId);
    }
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
    updateCargoOverflowState();
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
}

function getHblTermsPrintBoxPx() {
    const mmToPx = (mm) => (mm / 25.4) * HBL_TERMS_LOGICAL_DPI;
    const width = mmToPx(210 - HBL_TERMS_PAGE_MARGIN_MM * 2);
    const height = mmToPx(297 - HBL_TERMS_PAGE_MARGIN_MM * 2);
    return { width, height };
}

async function loadHblTermsPages() {
    const container = document.getElementById('hblTermsPrintPages');
    const pdfjs = window.pdfjsLib;
    if (!container || !pdfjs) return;
    if (container.dataset.loaded === HBL_TERMS_LOADED_VERSION) {
        hblTermsPagesReady = true;
        return;
    }

    container.querySelectorAll('.hbl-terms-page').forEach((el) => el.remove());

    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = HBL_PDFJS_WORKER_URL;
    }

    const pdf = await pdfjs.getDocument(HBL_TERMS_PDF_URL).promise;
    const box = getHblTermsPrintBoxPx();

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const baseViewport = page.getViewport({ scale: 1 });
        const fitScale = Math.min(box.width / baseViewport.width, box.height / baseViewport.height);
        const renderScale = fitScale * HBL_TERMS_RENDER_QUALITY;
        const viewport = page.getViewport({ scale: renderScale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport, intent: 'print' }).promise;

        const pageEl = document.createElement('div');
        pageEl.className = 'hbl-terms-page';
        const img = document.createElement('img');
        img.className = 'hbl-terms-page-img';
        img.alt = `Terms and conditions page ${pageNum}`;
        img.src = canvas.toDataURL('image/png');
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain';
        img.style.objectPosition = 'top center';
        pageEl.appendChild(img);
        container.appendChild(pageEl);
    }

    container.dataset.loaded = HBL_TERMS_LOADED_VERSION;
    hblTermsPagesReady = true;
}

function ensureHblTermsPages() {
    if (hblTermsPagesReady) return Promise.resolve();
    if (!hblTermsPagesPromise) {
        hblTermsPagesPromise = loadHblTermsPages().catch((err) => {
            hblTermsPagesPromise = null;
            console.error('Failed to load HBL terms PDF:', err);
            throw err;
        });
    }
    return hblTermsPagesPromise;
}

async function printDoc() {
    prepareDocumentForSave();
    await saveDocumentToServer({ silent: true });
    prepareCargoForPrint();
    try {
        await ensureHblTermsPages();
    } catch {
        /* print HBL even if terms PDF fails */
    }
    document.title = '\u00A0';
    window.print();
}

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
    bindCargoPreviewSync();
    ensureHblTermsPages().catch(() => {});
    window.addEventListener('beforeprint', () => {
        prepareCargoForPrint();
        ensureHblTermsPages().catch(() => {});
    });
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

    if (new URLSearchParams(window.location.search).get('view_draft') === '1') {
        applyViewDraftMode();
        document.getElementById('hblPrintArea')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
});

async function loadDocument(id) {
    try {
        const saved = await fetchSavedSnapshot(id);
        if (!saved?.snapshot) {
            alert('No saved HBL found for this enquiry.');
            window.history.back();
            return;
        }

        // Render strictly the saved snapshot, not the auto-populated enquiry defaults.
        applySnapshot(saved.snapshot);
        setReadOnlySavedView();
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
    splitAllCargoFields();

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
            if (wm) wm.textContent = 'SEAWAY BL';
        });
        if (toggleWrap) toggleWrap.style.display = 'flex';
        if (toggle) toggle.checked = watermarkEnabled;
        applyWatermarkVisibility();
    } else {
        label.textContent = '';
        count.textContent = 'Number of Original MTD: 3 / THREE';
        if (toggleWrap) toggleWrap.style.display = 'none';
        ['watermarkLayer', 'watermarkLayerPage2'].forEach((id) => {
            const layer = document.getElementById(id);
            if (layer) layer.classList.add('hidden');
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
