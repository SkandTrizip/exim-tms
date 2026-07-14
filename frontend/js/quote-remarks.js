/**
 * Shared quote remark reasons — used before finalizing / revising quotes.
 */
const QUOTE_REMARK_REASONS = [
    { value: 'currency_rate', label: 'Change in Currency Rate' },
    { value: 'ssr_request', label: 'Additional Charges - SSR Request' },
    { value: 'telex_surrender', label: 'Additional Charges - Telex/Surrender Charges' },
    { value: 'detention', label: 'Additional Charges - Detention' },
    { value: 'booking_rollover', label: 'Booking Rollover Charges' },
    { value: 'bill_discount', label: 'Bill Discounted Offered' },
    { value: 'other', label: 'Other Reason' },
];

function getQuoteRemarkLabel(value) {
    const found = QUOTE_REMARK_REASONS.find((r) => r.value === value);
    return found ? found.label : value || '';
}

function buildQuoteRemarksFormHtml() {
    const options = QUOTE_REMARK_REASONS.map((r) => `
        <label class="quote-remark-option">
            <input type="radio" name="quoteRemarkReason" value="${r.value}">
            <span>${escapeHtml(r.label)}</span>
        </label>
    `).join('');

    return `
        <p style="margin:0 0 16px; color:var(--text-secondary); font-size:14px;">
            Select the reason for this quote finalization. Required before you can proceed.
        </p>
        <div class="quote-remarks-list" id="quoteRemarksList">${options}</div>
        <div id="quoteRemarksOtherWrap" class="quote-remarks-other" style="display:none; margin-top:16px;">
            <label for="quoteRemarksOtherText" style="display:block; font-size:12px; font-weight:700; color:var(--navy-700); margin-bottom:6px;">
                Please specify other reason
            </label>
            <textarea id="quoteRemarksOtherText" class="form-control" rows="3"
                placeholder="Describe the reason…" style="width:100%; resize:vertical;"></textarea>
        </div>
        <p id="quoteRemarksError" class="quote-remarks-error" style="display:none; margin-top:12px; color:#dc2626; font-size:13px; font-weight:600;"></p>
    `;
}

function bindQuoteRemarksFormEvents(overlay) {
    const list = overlay.querySelector('#quoteRemarksList');
    const otherWrap = overlay.querySelector('#quoteRemarksOtherWrap');
    if (!list || !otherWrap) return;

    list.addEventListener('change', (e) => {
        if (e.target.name !== 'quoteRemarkReason') return;
        const isOther = e.target.value === 'other';
        otherWrap.style.display = isOther ? 'block' : 'none';
        const err = overlay.querySelector('#quoteRemarksError');
        if (err) err.style.display = 'none';
    });
}

function readQuoteRemarksFromOverlay(overlay) {
    const selected = overlay.querySelector('input[name="quoteRemarkReason"]:checked');
    const err = overlay.querySelector('#quoteRemarksError');
    const showErr = (msg) => {
        if (err) {
            err.textContent = msg;
            err.style.display = 'block';
        }
    };

    if (!selected) {
        showErr('Please select a remark reason.');
        return null;
    }

    const reason = selected.value;
    let other = '';
    if (reason === 'other') {
        other = (overlay.querySelector('#quoteRemarksOtherText')?.value || '').trim();
        if (!other) {
            showErr('Please provide details for Other Reason.');
            const ta = overlay.querySelector('#quoteRemarksOtherText');
            if (ta) ta.focus();
            return null;
        }
    }

    if (err) err.style.display = 'none';
    return {
        remarks_reason: reason,
        remarks_other: other || null,
        remarks_label: getQuoteRemarkLabel(reason),
    };
}

/**
 * @param {{ title?: string, confirmLabel?: string, onConfirm: (remarks: object) => void|Promise<void> }} opts
 */
function showQuoteRemarksModal(opts) {
    const { title = 'Quote remarks', confirmLabel = 'Continue', onConfirm } = opts || {};
    let overlay = document.getElementById('quoteRemarksModalOverlay');

    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'quoteRemarksModalOverlay';
        overlay.className = 'quote-remarks-overlay';
        overlay.innerHTML = `
            <div class="quote-remarks-dialog" role="dialog" aria-modal="true" aria-labelledby="quoteRemarksTitle">
                <div class="quote-remarks-header">
                    <h3 id="quoteRemarksTitle"></h3>
                    <button type="button" class="quote-remarks-close" aria-label="Close"><i class="fas fa-times"></i></button>
                </div>
                <div class="quote-remarks-body" id="quoteRemarksBody"></div>
                <div class="quote-remarks-footer">
                    <button type="button" class="btn btn-secondary" data-action="cancel">Cancel</button>
                    <button type="button" class="btn btn-primary" data-action="confirm" style="background:#059669;border:none;"></button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelector('.quote-remarks-close')?.addEventListener('click', closeQuoteRemarksModal);
        overlay.querySelector('[data-action="cancel"]')?.addEventListener('click', closeQuoteRemarksModal);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeQuoteRemarksModal();
        });
    }

    overlay.querySelector('#quoteRemarksTitle').textContent = title;
    overlay.querySelector('#quoteRemarksBody').innerHTML = buildQuoteRemarksFormHtml();
    overlay.querySelector('[data-action="confirm"]').textContent = confirmLabel;

    bindQuoteRemarksFormEvents(overlay);

    const confirmBtn = overlay.querySelector('[data-action="confirm"]');
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    newConfirmBtn.addEventListener('click', async () => {
        const remarks = readQuoteRemarksFromOverlay(overlay);
        if (!remarks) return;
        newConfirmBtn.disabled = true;
        newConfirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Please wait…';
        try {
            await onConfirm(remarks);
            closeQuoteRemarksModal();
        } catch (err) {
            const errEl = overlay.querySelector('#quoteRemarksError');
            if (errEl) {
                errEl.textContent = err.message || 'Something went wrong. Try again.';
                errEl.style.display = 'block';
            }
        } finally {
            newConfirmBtn.disabled = false;
            newConfirmBtn.textContent = confirmLabel;
        }
    });

    overlay.style.display = 'flex';
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('app-modal-open');
    document.body.style.overflow = 'hidden';
}

function closeQuoteRemarksModal() {
    const overlay = document.getElementById('quoteRemarksModalOverlay');
    if (!overlay) return;
    overlay.style.display = 'none';
    overlay.setAttribute('aria-hidden', 'true');
    if (!document.getElementById('updateQuoteModal')?.style.display ||
        document.getElementById('updateQuoteModal')?.style.display === 'none') {
        document.body.style.overflow = '';
        if (!document.querySelector('.modal-overlay.active')) {
            document.body.classList.remove('app-modal-open');
        }
    }
}

window.QUOTE_REMARK_REASONS = QUOTE_REMARK_REASONS;
window.getQuoteRemarkLabel = getQuoteRemarkLabel;
window.showQuoteRemarksModal = showQuoteRemarksModal;
window.closeQuoteRemarksModal = closeQuoteRemarksModal;
