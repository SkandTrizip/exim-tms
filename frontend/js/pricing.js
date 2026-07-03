// Pricing Page Logic
let currentEnquiry = null;
let pricingQuotes = [];
let activeQuoteIndex = 0;
let currentExchangeRate = 86.8;
let isConfirmMode = false;  // controls vendor rate column visibility
/** URL `mode=` so we can keep the calculator open for Confirm Quote flows even after a quote is already accepted */
let pricingPageMode = '';
/** True after Save Quote until user opens via mode=edit / mode=confirm or finalizes quote (sessionStorage-backed). */
let pricingLockedAfterSave = false;
let _confirmUiSetupTimer = null;

function isQuoteAcceptedStatus(q) {
    return q && String(q.status || '').toLowerCase() === 'accepted';
}

function pricingSavedLockStorageKey() {
    return currentEnquiry && currentEnquiry.id != null
        ? `pricing_saved_lock_${currentEnquiry.id}`
        : null;
}

function isPricingSheetSavedLocked() {
    if (pricingLockedAfterSave) return true;
    const k = pricingSavedLockStorageKey();
    if (!k) return false;
    try {
        return sessionStorage.getItem(k) === '1';
    } catch (_) {
        return false;
    }
}

function resetSaveQuoteButtonAppearance() {
    const saveBtn = document.querySelector('.form-actions button[onclick="savePricing()"]');
    if (!saveBtn) return;
    saveBtn.disabled = false;
    saveBtn.style.opacity = '';
    saveBtn.style.cursor = '';
    saveBtn.innerHTML =
        '<i class="fas fa-save" style="color: var(--navy-600)"></i> Save Quote';
}

function clearPricingSavedLock() {
    pricingLockedAfterSave = false;
    const k = pricingSavedLockStorageKey();
    if (k) {
        try {
            sessionStorage.removeItem(k);
        } catch (_) { /* ignore */ }
    }
    resetSaveQuoteButtonAppearance();
}

/** Disable route + calculator after Save Quote; keep Export PDF & (if draft) Confirm This Quote. */
function applyPricingSheetSavedLock() {
    if (!isPricingSheetSavedLocked()) return;

    const route = document.querySelector('.route-section');
    const calc = document.getElementById('calculatorSection');
    const targets = [route, calc].filter(Boolean);

    targets.forEach(container => {
        container.querySelectorAll('input, select, textarea').forEach(el => {
            el.disabled = true;
            el.readOnly = true;
            el.style.opacity = '0.78';
            el.style.cursor = 'not-allowed';
        });
        container.querySelectorAll('button').forEach(btn => {
            const oc = btn.getAttribute('onclick') || '';
            if (oc.includes('generatePDF')) {
                btn.disabled = false;
                btn.style.display = '';
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
                return;
            }
            btn.disabled = true;
            btn.style.display = 'none';
        });
    });

    const saveBtn = document.querySelector('.form-actions button[onclick="savePricing()"]');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.style.display = 'inline-flex';
        saveBtn.style.opacity = '0.72';
        saveBtn.style.cursor = 'not-allowed';
        saveBtn.innerHTML =
            '<i class="fas fa-lock" style="color: var(--navy-600);"></i> Saved (locked)';
    }

    const confirmBtn = document.getElementById('confirmQuoteBtn');
    if (!confirmBtn) return;
    const hasAccepted = pricingQuotes.some(isQuoteAcceptedStatus);
    let calcVisible = false;
    try {
        calcVisible = calc && window.getComputedStyle(calc).display !== 'none';
    } catch (_) {
        calcVisible = calc && calc.style.display !== 'none' && calc.style.display !== '';
    }
    if (!hasAccepted && calcVisible) {
        confirmBtn.style.display = 'inline-flex';
        confirmBtn.disabled = false;
        confirmBtn.style.opacity = '1';
        confirmBtn.style.cursor = 'pointer';
    }
}

document.addEventListener('DOMContentLoaded', async function () {
    if (new URLSearchParams(window.location.search).get('embedded') === '1') {
        document.documentElement.classList.add('embedded-mode');
        document.body.classList.add('embedded-mode');
    }
    // 1. Initial UI Setup
    populateInitialDropdowns();
    bindQuoteConfirmationActions();

    // 2. Load Data
    const urlParams = new URLSearchParams(window.location.search);
    const enquiryId = urlParams.get('enquiry_id');
    const mode = urlParams.get('mode');
    pricingPageMode = mode ? String(mode) : '';

    if (enquiryId) {
        if (pricingPageMode === 'edit' || pricingPageMode === 'confirm') {
            pricingLockedAfterSave = false;
            try {
                sessionStorage.removeItem(`pricing_saved_lock_${enquiryId}`);
            } catch (_) { /* ignore */ }
        }

        await fetchEnquiryData(enquiryId);
        updateEnquirySummary(); // Populate the top summary bar
        await fetchQuotesForEnquiry(enquiryId);
        await fetchExchangeRate();

        const hasAcceptedQuote = pricingQuotes.some(isQuoteAcceptedStatus);

        // Once confirmed, pricing is permanently read-only in Quotes & Pricing.
        if (hasAcceptedQuote && pricingPageMode !== 'view') {
            pricingPageMode = 'view';
        }

        if (pricingPageMode === 'confirm') {
            initConfirmMode();
        } else if (pricingPageMode === 'view') {
            isConfirmMode = false;
            document.body.classList.remove('confirm-mode');
            initViewMode();
        } else if (pricingPageMode === 'edit') {
            const hasAcceptedEdit = pricingQuotes.some(isQuoteAcceptedStatus);
            if (hasAcceptedEdit) {
                isConfirmMode = true;
                document.body.classList.add('confirm-mode');
            } else {
                isConfirmMode = false;
                document.body.classList.remove('confirm-mode');
            }
            initPricingTable(true); // true means force edit
            resetSaveQuoteButtonAppearance();
        } else {
            // Default behaviour (dashboard open with no mode)
            isConfirmMode = false;
            document.body.classList.remove('confirm-mode');
            initPricingTable();
        }

        if (
            enquiryId &&
            pricingPageMode !== 'edit' &&
            pricingPageMode !== 'confirm' &&
            isPricingSheetSavedLocked()
        ) {
            setTimeout(() => applyPricingSheetSavedLock(), 620);
        }
        hideEmbeddedDrawerBackButtons();
        applyLockedQuoteViewChrome();
    }
});

function applyLockedQuoteViewChrome() {
    const pg = document.getElementById('quoteConfirmationPage');
    if (!pg) return;

    // Legacy / cached markup — remove edit affordances on confirmed quote
    pg.querySelector('#postConfirmEditDetailsBtn')?.remove();
    pg.querySelectorAll('.pricing-card-header button').forEach((btn) => {
        btn.remove();
    });

    const embedded = typeof isEmbeddedDrawer === 'function' && isEmbeddedDrawer();
    const viewOnly = pricingPageMode === 'view' || embedded;

    if (viewOnly) {
        pg.querySelectorAll('#postConfirmGoTrackingBtn, #postConfirmViewBreakdownBtn').forEach((btn) => {
            btn.style.display = 'none';
        });
        const footer = pg.querySelector('.pricing-card-body > div:last-of-type');
        if (footer && footer.querySelector('#postConfirmGoTrackingBtn, #postConfirmViewBreakdownBtn')) {
            const visible = footer.querySelectorAll('button:not([style*="display: none"])');
            if (visible.length === 0) footer.style.display = 'none';
        }
    }

    if (embedded) {
        const hint = document.getElementById('confirmPricingHint');
        if (hint) {
            hint.innerHTML =
                '<i class="fas fa-info-circle" style="margin-right: 8px; color: var(--navy-400);"></i>' +
                'This quote is confirmed and locked. Rate changes after SI submission are done from ' +
                '<strong>Tracking → Update Quote</strong>.';
        }
    }
}

function initViewMode() {
    console.log('👁️ Entering View-Only Mode');
    const formActions = document.querySelector('.form-actions');
    if (formActions) formActions.style.display = 'none';
    initPricingTable(false, true); // forceView = true (unused in table; kept for future)
    applyLockedQuoteViewChrome();

    // Disable all inputs after a short delay to ensure dynamic content is loaded
    setTimeout(() => {
        const containers = ['#calculatorSection', '.route-section'];
        containers.forEach(selector => {
            const container = document.querySelector(selector);
            if (container) {
                const elements = container.querySelectorAll('input, select, textarea, button:not(.btn-secondary)');
                elements.forEach(el => {
                    if (!el.onclick || !el.onclick.toString().includes('goBack')) {
                        el.disabled = true;
                        el.style.opacity = '0.7';
                        el.style.cursor = 'not-allowed';
                    }
                });
            }
        });

        document.querySelectorAll('.btn-add, .btn-remove, .btn-primary, .tab-actions').forEach(el => {
            if (el.closest('#quoteConfirmationPage')) return;
            el.style.display = 'none';
        });
        applyLockedQuoteViewChrome();
    }, 500);
}

function initConfirmMode() {
    console.log('🛡️ Entering Confirm Mode — shipping line rate & client rate editable');
    isConfirmMode = true;                          // show vendor column in newly rendered rows
    document.body.classList.add('confirm-mode');   // show vendor total card via CSS

    initPricingTable(false, true);

    const hasAccepted = pricingQuotes.some(isQuoteAcceptedStatus);

    resetSaveQuoteButtonAppearance();

    // Hide administrative actions; allow Save once a quote exists so totals can persist from Confirm flow.
    const saveBtn = document.querySelector('button[onclick="savePricing()"]');
    const addQuoteBtn = document.querySelector('button[onclick="addNewQuote()"]');
    if (saveBtn) saveBtn.style.display = hasAccepted ? '' : 'none';
    if (addQuoteBtn) addQuoteBtn.style.display = 'none';

    const confirmBtn = document.getElementById('confirmQuoteBtn');
    if (confirmBtn) {
        if (hasAccepted) {
            confirmBtn.style.display = 'none';
        } else {
            confirmBtn.style.display = 'flex';
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = 'Confirm This Quote <i class="fas fa-check-circle" style="margin-left: 8px;"></i>';
            confirmBtn.style.background = '';
        }
    }

    // Lock everything EXCEPT shipping line rate / ex. rate + client rate columns
    const confirmEditableInputs = '.p-vendor, .p-rate, .p-ex';
    if (_confirmUiSetupTimer) clearTimeout(_confirmUiSetupTimer);
    _confirmUiSetupTimer = setTimeout(() => {
        _confirmUiSetupTimer = null;
        if (isPricingSheetSavedLocked()) return;
        const containers = ['#calculatorSection', '.route-section'];
        containers.forEach(selector => {
            const container = document.querySelector(selector);
            if (container) {
                const elements = container.querySelectorAll(
                    'input:not(.p-vendor, .p-rate, .p-ex), select, textarea, button:not(.btn-secondary):not(#confirmQuoteBtn):not(.btn-icon-overlay):not(.btn-add-integrated)'
                );
                elements.forEach(el => {
                    el.disabled = true;
                    el.style.opacity = '0.75';
                    el.style.cursor = 'not-allowed';
                });
            }
        });
        document.querySelectorAll(confirmEditableInputs).forEach(el => {
            el.readOnly = false;
            el.style.opacity = '1';
            el.style.cursor = 'text';
            el.disabled = false;
        });
    }, 500);
}

function confirmQuoteFromPage() {
    if (activeQuoteIndex < 0 || activeQuoteIndex >= pricingQuotes.length) return;
    finalizeSelectedQuote(activeQuoteIndex);
}

function renderSelectionGrid() {
    const grid = document.getElementById('selectionGrid');
    if (!grid) return;

    if (pricingQuotes.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-tertiary); background: white; border-radius: 12px; border: 1px dashed var(--border-medium);">No quotes found for this enquiry. Please go back to the Pricing section to add quotations first.</div>';
        return;
    }

    grid.innerHTML = pricingQuotes.map((q, idx) => {
        const summary = getQuoteSummary(q);
        return `
            <div class="selection-card" style="border: 2px solid var(--border-light); border-radius: 16px; padding: 24px; background: white; transition: all 0.3s ease; box-shadow: var(--shadow-sm); display: flex; flex-direction: column;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 20px;">
                    <div>
                        <h4 style="margin: 0; color: var(--navy-900); font-size: 1.1rem; font-weight: 800;">${q.name}</h4>
                        <span class="badge" style="margin-top: 6px; background: var(--navy-50); color: var(--navy-700);">${q.line || 'Standard Line'}</span>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 20px; font-weight: 800; color: #059669;">₹${summary.origin.toLocaleString()}</div>
                        <div style="font-size: 10px; color: var(--text-tertiary); font-weight: 700; text-transform: uppercase;">Amount (INR)</div>
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; font-size: 13px; color: var(--text-secondary); background: var(--gray-50); padding: 12px; border-radius: 8px;">
                    <div><i class="fas fa-clock" style="width: 14px; color: var(--navy-400); margin-right: 4px;"></i> <strong>${q.transit_time || '-'}</strong> Days</div>
                    <div><i class="fas fa-calendar-check" style="width: 14px; color: var(--navy-400); margin-right: 4px;"></i> Exp: <strong>${q.validity || '-'}</strong></div>
                    <div><i class="fas fa-box" style="width: 14px; color: var(--navy-400); margin-right: 4px;"></i> Free: <strong>7 Days</strong></div>
                    <div><i class="fas fa-coins" style="width: 14px; color: var(--navy-400); margin-right: 4px;"></i> <strong>${q.currency || 'USD'}</strong> Rate</div>
                </div>

                <div style="margin-top: auto; padding-top: 20px; border-top: 1px solid var(--border-light);">
                    <button class="btn btn-primary" style="width: 100%; justify-content: center; background: #059669; padding: 14px; font-weight: 800;" onclick="finalizeSelectedQuote(${idx})">
                        Confirm & Lock Quote <i class="fas fa-check-circle" style="margin-left:8px;"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function populateInitialDropdowns() {
    populateDropdown(document.getElementById('pricingLine'), CONFIG.shippingLines);
    populateDropdown(document.getElementById('pricingIncoterm'), CONFIG.incoterms);
}

async function fetchEnquiryData(id) {
    try {
        const response = await fetch(`${CONFIG.API_URL}/api/enquiry/${id}`);
        if (response.ok) {
            currentEnquiry = await response.json();
        }
    } catch (error) {
        console.error('Error fetching enquiry:', error);
    }
}

async function fetchQuotesForEnquiry(enquiryId) {
    try {
        const response = await fetch(`${CONFIG.API_URL}/api/quotes/enquiry/${enquiryId}`);
        if (response.ok) {
            const quotes = await response.json();
            if (quotes && quotes.length > 0) {
                pricingQuotes = quotes.map(q => ({
                    id: q.id,
                    name: q.quote_name || 'Quote',
                    quote_number: q.quote_number,
                    line: q.shipping_line,
                    por: q.place_of_receipt,
                    pol: q.port_of_loading,
                    pod: q.port_of_discharge,
                    fpod: q.final_place_of_delivery,
                    currency: q.rate_currency,
                    incoterm: q.incoterm,
                    transit_time: q.transit_time_days,
                    validity: q.rate_validity_date ? q.rate_validity_date.split('T')[0] : '',
                    free_days: q.destination_free_days,
                    container_prices: q.containers
                        ? [...q.containers]
                            .sort((a, b) =>
                                (a.container_sequence ?? 0) - (b.container_sequence ?? 0) ||
                                (a.id ?? 0) - (b.id ?? 0))
                            .map(c => ({
                                container_type: c.container_type,
                                charges: c.charges
                                    ? [...c.charges]
                                        .sort((a, b) =>
                                            (a.charge_sequence ?? 0) - (b.charge_sequence ?? 0) ||
                                            (a.id ?? 0) - (b.id ?? 0))
                                        .map(ch => ({
                                            desc: ch.charge_description,
                                            account: ch.account_type,
                                            curr: ch.currency,
                                            on: ch.charged_on,
                                            qty: ch.quantity,
                                            rate: ch.rate,
                                            ex: ch.exchange_rate,
                                            vendor_rate: ch.vendor_rate != null ? ch.vendor_rate : null
                                        }))
                                    : []
                            }))
                        : [],
                    status: q.status || 'draft'
                }));
            }
        }
    } catch (error) {
        console.error('Error fetching quotes:', error);
    }
}

async function fetchExchangeRate() {
    try {
        const response = await fetch(`${CONFIG.API_URL}/api/exchange-rate/rate`);
        if (response.ok) {
            const data = await response.json();
            if (data.rate) currentExchangeRate = data.rate;
        }
    } catch (e) {
        console.warn('Using default exchange rate');
    }
}

function updateEnquirySummary() {
    if (!currentEnquiry) return;

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        try {
            return new Date(dateStr).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            });
        } catch (e) { return dateStr; }
    };

    document.getElementById('display_enquiry_number').textContent = currentEnquiry.enquiry_number || '-';
    document.getElementById('display_enquiry_date').textContent = formatDate(currentEnquiry.created_at || currentEnquiry.enquiry_date);
    document.getElementById('display_stuffing_date').textContent = formatDate(currentEnquiry.stuffing_date);
    document.getElementById('display_client_name').textContent = currentEnquiry.client_name || '-';
    document.getElementById('display_shipment_type').textContent = currentEnquiry.shipment_type || '-';
    document.getElementById('display_origin').textContent = currentEnquiry.origin || '-';
    document.getElementById('display_destination').textContent = currentEnquiry.destination || '-';
    document.getElementById('display_container_type').textContent = currentEnquiry.container_type || '-';
    document.getElementById('display_commodity').textContent = currentEnquiry.commodity || '-';
    document.getElementById('display_cargo_value').textContent = currentEnquiry.cargo_value ? `$${Number(currentEnquiry.cargo_value).toLocaleString()
        }` : '-';
    document.getElementById('display_client_rate').textContent = currentEnquiry.client_target_rate ? `$${Number(currentEnquiry.client_target_rate).toLocaleString()}` : '-';
}

function initPricingTable(forceEdit = false, forceView = false) {
    if (currentEnquiry) {
        document.getElementById('pricingPOR').value = currentEnquiry.origin || '';
        document.getElementById('pricingFPOD').value = currentEnquiry.destination || '';
        document.getElementById('pricingPOL').value = currentEnquiry.origin_port_code || '';
        document.getElementById('pricingPOD').value = currentEnquiry.destination_port_code || '';
    }

    if (pricingQuotes.length === 0) {
        addNewQuote();
    } else {
        renderQuoteTabs();

        const confirmedIdx = pricingQuotes.findIndex(isQuoteAcceptedStatus);

        // Locked summary sheet: accepted quote exists — always read-only here.
        const useLockedSummary =
            confirmedIdx !== -1 && !forceEdit;

        if (useLockedSummary) {
            activeQuoteIndex = confirmedIdx;
            loadQuote(confirmedIdx);

            // Lock UI immediately
            document.getElementById('calculatorSection').style.display = 'none';
            document.getElementById('quoteConfirmationPage').style.display = 'block';

            renderConfirmedTable(pricingQuotes[confirmedIdx]);

            const formActions = document.querySelector('.form-actions');
            if (formActions) formActions.style.display = 'none';

            applyLockedQuoteViewChrome();

            // Sync action button
            const btn = document.getElementById('confirmQuoteBtn');
            if (btn) {
                btn.innerHTML = 'Quote Confirmed <i class="fas fa-check-circle" style="margin-left:8px;"></i>';
                btn.style.background = 'var(--success)';
                btn.disabled = true;
            }
        } else {
            loadQuote(activeQuoteIndex);
        }
    }
}

function addNewQuote() {
    saveCurrentQuoteState();
    const nextNum = pricingQuotes.length + 1;
    const newQuote = {
        name: `Quote ${nextNum}`,
        line: '',
        por: document.getElementById('pricingPOR').value,
        pol: document.getElementById('pricingPOL').value,
        pod: document.getElementById('pricingPOD').value,
        fpod: document.getElementById('pricingFPOD').value,
        currency: 'USD',
        incoterm: '',
        transit_time: '',
        validity: '',
        free_days: '',
        container_prices: [{
            container_type: currentEnquiry ? currentEnquiry.container_type : '',
            charges: JSON.parse(JSON.stringify(CONFIG.defaultCharges))
        }]
    };
    pricingQuotes.push(newQuote);
    activeQuoteIndex = pricingQuotes.length - 1;
    renderQuoteTabs();
    loadQuote(activeQuoteIndex);
}

function renderQuoteTabs() {
    const container = document.getElementById('pricingTabs');
    if (!container) return;
    container.innerHTML = '';
    pricingQuotes.forEach((quote, index) => {
        const tab = document.createElement('div');
        tab.className = `pricing-tab ${index === activeQuoteIndex ? 'active' : ''}`;
        tab.innerHTML = `<span>${quote.name}</span> <button class="btn-delete-quote" style="background: none; border: none; margin-left: 8px; color: inherit; cursor: pointer; opacity: 0.6;" onclick="event.stopPropagation(); deleteQuote(${index})"><i class="fas fa-times"></i></button>`;
        tab.onclick = () => switchQuote(index);
        container.appendChild(tab);
    });
}

function switchQuote(index) {
    saveCurrentQuoteState();
    activeQuoteIndex = index;
    renderQuoteTabs();
    loadQuote(index);
}

function deleteQuote(index) {
    if (pricingQuotes.length === 1) return showModal("Notice", "At least one quote is required.", "warning");

    showModal('Confirm Delete', `Delete quote "${pricingQuotes[index].name}" ? `, 'warning', () => {
        pricingQuotes.splice(index, 1);
        activeQuoteIndex = Math.max(0, activeQuoteIndex - 1);
        renderQuoteTabs();
        loadQuote(activeQuoteIndex);
    });
}

function saveCurrentQuoteState() {
    if (activeQuoteIndex < 0 || activeQuoteIndex >= pricingQuotes.length) return;
    const quote = pricingQuotes[activeQuoteIndex];
    if (!quote) return;

    quote.line = document.getElementById('pricingLine').value;
    quote.por = document.getElementById('pricingPOR').value;
    quote.pol = document.getElementById('pricingPOL').value;
    quote.pod = document.getElementById('pricingPOD').value;
    quote.fpod = document.getElementById('pricingFPOD').value;
    quote.currency = document.getElementById('pricingCurrency').value;
    quote.incoterm = document.getElementById('pricingIncoterm').value;
    quote.transit_time = document.getElementById('transitTime').value;
    quote.validity = document.getElementById('rateValidity').value;
    quote.free_days = document.getElementById('destFreeDays').value;

    const sections = document.querySelectorAll('.container-pricing-section');
    quote.container_prices = Array.from(sections).map(section => ({
        container_type: section.querySelector('.c-type').value,
        charges: Array.from(section.querySelectorAll('tbody tr')).map(row => {
            const vendorInput = row.querySelector('.p-vendor');
            const rateVal = row.querySelector('.p-rate').value;
            let vendorRateVal;
            if (vendorInput) {
                vendorRateVal = vendorInput.value !== ''
                    ? vendorInput.value
                    : (row.dataset.vendorRate !== undefined && row.dataset.vendorRate !== '' ? row.dataset.vendorRate : rateVal);
            } else {
                vendorRateVal = (row.dataset.vendorRate !== undefined && row.dataset.vendorRate !== '')
                    ? row.dataset.vendorRate
                    : rateVal;
            }
            return {
                desc: row.querySelector('.p-desc').value,
                account: row.querySelector('.p-account').value,
                curr: row.querySelector('.p-curr').value,
                on: row.querySelector('.p-on').value,
                qty: row.querySelector('.p-qty').value,
                rate: rateVal,
                ex: row.querySelector('.p-ex').value,
                vendor_rate: vendorRateVal
            };
        })
    }));
}

function loadQuote(index) {
    const quote = pricingQuotes[index];
    if (!quote) return;

    document.getElementById('activeQuoteTitle').textContent = `Active Calculator: ${quote.name}`;
    document.getElementById('pricingLine').value = quote.line || '';
    document.getElementById('pricingPOR').value = quote.por || '';
    document.getElementById('pricingPOL').value = quote.pol || '';
    document.getElementById('pricingPOD').value = quote.pod || '';
    document.getElementById('pricingFPOD').value = quote.fpod || '';
    document.getElementById('pricingCurrency').value = quote.currency || 'USD';
    document.getElementById('pricingIncoterm').value = quote.incoterm || '';
    document.getElementById('transitTime').value = quote.transit_time || '';
    document.getElementById('rateValidity').value = quote.validity || '';
    document.getElementById('destFreeDays').value = quote.free_days || '';

    const containerList = document.getElementById('quoteContainersList');
    containerList.innerHTML = '';
    quote.container_prices.forEach((cp, idx) => renderContainerSection(cp, idx));
    calculatePricingTotal();
    if (isPricingSheetSavedLocked()) {
        requestAnimationFrame(() => applyPricingSheetSavedLock());
    }
}

function renderContainerSection(data, index) {
    const containerList = document.getElementById('quoteContainersList');
    const section = document.createElement('div');
    section.className = 'container-pricing-section';
    section.innerHTML = `
        <div class="pricing-container-header">
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-weight: 700; color: var(--navy-800); font-size: 0.85rem;">Group ${index + 1}</span>
                <select class="c-type" style="width: auto; padding: 2px 8px; font-weight: 600; font-size: 0.75rem; height: 26px;"></select>
            </div>
            <button type="button" class="btn btn-remove" style="padding: 4px 10px; font-size: 11px; height: 26px;" onclick="removeContainerSection(${index})">
                <i class="fas fa-trash-alt"></i> Remove
            </button>
        </div>
        <div class="pricing-table-container">
            <table class="pricing-table">
                <thead>
                    <tr>
                        <th class="col-desc">Charge Name</th>
                        <th class="col-account">Account</th>
                        <th class="col-curr">Curr</th>
                        <th class="col-on">Charged On</th>
                        <th class="col-qty">Qty</th>
                        <th class="col-amt">Rate</th>
                        <th class="col-ex">Ex. Rate</th>
                        <th class="col-inr">Shipping Line (INR)</th>
                        ${isConfirmMode ? '<th class="col-vendor">Client Rate</th>' : ''}
                    </tr>
                </thead>
                <tbody></tbody>
                <tfoot>
                    <tr>
                        <td colspan="${isConfirmMode ? 9 : 8}" style="padding: 0;">
                            <button type="button" class="btn-add-integrated" style="padding: 10px !important; font-size: 0.7rem;" onclick="addPricingRowToSection(this)">
                                <i class="fas fa-plus-circle"></i> Add Charge Item
                            </button>
                        </td>
                    </tr>
                </tfoot>
            </table>
        </div>
    `;
    const select = section.querySelector('.c-type');
    populateDropdown(select, CONFIG.containerTypes);
    select.value = data.container_type;
    const tbody = section.querySelector('tbody');
    data.charges.forEach(ch => addPricingRowToTbody(tbody, ch));
    containerList.appendChild(section);
}

function addContainerSection() {
    const cp = { container_type: '', charges: JSON.parse(JSON.stringify(CONFIG.defaultCharges)) };
    renderContainerSection(cp, document.querySelectorAll('.container-pricing-section').length);
}

function removeContainerSection(idx) {
    showModal('Confirm Delete', 'Remove this container price table?', 'warning', () => {
        saveCurrentQuoteState();
        pricingQuotes[activeQuoteIndex].container_prices.splice(idx, 1);
        loadQuote(activeQuoteIndex);
    });
}

function addPricingRowToSection(btn) {
    addPricingRowToTbody(btn.closest('table').querySelector('tbody'));
    calculatePricingTotal();
}

function removePricingRow(btn) {
    const row = btn.closest('tr');
    if (!row) return;
    row.remove();
    calculatePricingTotal();
}

function addPricingRowToTbody(tbody, data = {}) {
    const row = document.createElement('tr');
    const defaultQty = currentEnquiry ? (currentEnquiry.container_count || 1) : 1;
    const defaultEx = (data.curr === 'USD') ? (data.ex || currentExchangeRate) : (data.ex || 1);
    const hasStoredVendor = data.vendor_rate != null && data.vendor_rate !== '';
    const defaultVendorRate = hasStoredVendor ? data.vendor_rate : (data.rate || '');
    const vendorManual = hasStoredVendor && String(data.vendor_rate) !== String(data.rate ?? '') ? 'true' : 'false';

    const deleteBtn =
        '<button type="button" class="btn-icon-overlay" onclick="removePricingRow(this)" title="Remove charge line"><i class="fas fa-trash"></i></button>';

    row.innerHTML = `
        <td><input type="text" class="p-desc" value="${data.desc || ''}" oninput="calculatePricingTotal()"></td>
        <td><select class="p-account" onchange="calculatePricingTotal()"><option value="On Your Account" ${data.account === 'On Your Account' ? 'selected' : ''}>On Your Account</option><option value="Consignee Account" ${data.account === 'Consignee Account' ? 'selected' : ''}>Consignee Account</option></select></td>
        <td><select class="p-curr" onchange="handleCurrencyChange(this)"><option value="USD" ${data.curr === 'USD' ? 'selected' : ''}>USD</option><option value="INR" ${data.curr === 'INR' ? 'selected' : ''}>INR</option></select></td>
        <td><select class="p-on" onchange="handleChargedOnChange(this)"><option value="Per BL" ${data.on === 'Per BL' ? 'selected' : ''}>Per BL</option><option value="Per Container" ${data.on === 'Per Container' ? 'selected' : ''}>Per Container</option></select></td>
        <td><input type="number" class="p-qty" value="${data.on === 'Per BL' ? 1 : (data.qty || defaultQty)}" ${data.on === 'Per BL' ? 'readonly' : ''} min="0" oninput="if(this.value<0)this.value=0; calculatePricingTotal()" onkeydown="if(event.key==='-')event.preventDefault()"></td>
        <td><input type="number" class="p-rate" value="${data.rate || ''}" min="0" oninput="if(this.value<0)this.value=0; syncVendorRate(this); calculatePricingTotal()" onkeydown="if(event.key==='-')event.preventDefault()"></td>
        <td><input type="number" class="p-ex" value="${defaultEx}" min="0" oninput="if(this.value<0)this.value=0; calculatePricingTotal()" onkeydown="if(event.key==='-')event.preventDefault()"></td>
        <td class="col-inr" style="position:relative; font-weight:600; color:#1e3a8a;"><span class="p-inr-val">₹0</span>${deleteBtn}</td>
        ${isConfirmMode ? `<td class="col-vendor"><input type="number" class="p-vendor" value="${defaultVendorRate}" data-manual="${vendorManual}" min="0" placeholder="0" oninput="if(this.value<0)this.value=0; this.dataset.manual='true'; const tr=this.closest('tr'); if(tr) tr.dataset.vendorRate=this.value; calculatePricingTotal()" onkeydown="if(event.key==='-')event.preventDefault()"></td>` : ''}
    `;
    const vrPersist = hasStoredVendor ? String(data.vendor_rate) : String(data.rate ?? '');
    row.dataset.vendorRate = vrPersist;
    tbody.appendChild(row);
}

/** Auto-sync Vendor Rate with Rate if user hasn't manually set it */
function syncVendorRate(rateInput) {
    const row = rateInput.closest('tr');
    const vendorEl = row.querySelector('.p-vendor');
    if (vendorEl && vendorEl.dataset.manual !== 'true') {
        vendorEl.value = rateInput.value;
    }
}

function calculatePricingTotal() {
    let totShippingLine = 0, totVendor = 0;
    document.querySelectorAll('.container-pricing-section').forEach(sec => {
        sec.querySelectorAll('tbody tr').forEach(row => {
            const qty = parseFloat(row.querySelector('.p-qty').value) || 0;
            const rate = parseFloat(row.querySelector('.p-rate').value) || 0;
            const ex = parseFloat(row.querySelector('.p-ex').value) || 1;
            const on = row.querySelector('.p-on').value;
            const curr = row.querySelector('.p-curr').value;
            const acc = row.querySelector('.p-account').value;
            const vendorEl = row.querySelector('.p-vendor');
            const vendorRate = parseFloat(vendorEl ? vendorEl.value : 0) || 0;

            // INR calculation: USD charges always multiply by exchange rate;
            // INR charges don't need conversion.
            // Per BL + USD → qty(1) × rate × ex  (exchange rate still applies)
            // Per BL + INR → qty(1) × rate  (no conversion needed)
            const tot = qty * rate;
            const inr = curr === 'USD' ? tot * ex : tot;

            const vendorTot = qty * vendorRate;
            const vendorInr = curr === 'USD' ? vendorTot * ex : vendorTot;

            row.querySelector('.p-inr-val').textContent = '₹' + Math.round(inr).toLocaleString();

            if (acc === 'On Your Account') {
                totShippingLine += inr;
                totVendor += vendorInr;
            }
        });
    });
    document.getElementById('totalOriginINR').textContent = '₹' + Math.round(totShippingLine).toLocaleString();
    document.getElementById('totalDestINR').textContent = '₹' + Math.round(totVendor).toLocaleString();
    document.getElementById('finalQuoteINR').textContent = '₹' + Math.round(totShippingLine).toLocaleString();
}

function handleChargedOnChange(sel) {
    const row = sel.closest('tr');
    const qty = row.querySelector('.p-qty');
    const ex = row.querySelector('.p-ex');
    if (sel.value === 'Per BL') {
        qty.value = 1; qty.readOnly = true;
        // For USD+Per BL, keep exchange rate active; for INR reset to 1
        if (row.querySelector('.p-curr').value !== 'USD') {
            ex.value = 1;
        } else {
            ex.value = currentExchangeRate;
        }
        ex.readOnly = false; // Always allow override
    } else {
        qty.readOnly = false; ex.readOnly = false;
        ex.value = row.querySelector('.p-curr').value === 'USD' ? currentExchangeRate : 1;
    }
    calculatePricingTotal();
}

function handleCurrencyChange(sel) {
    const row = sel.closest('tr');
    const ex = row.querySelector('.p-ex');
    // For Per BL: USD should use exchange rate, INR should be 1
    if (row.querySelector('.p-on').value === 'Per BL') {
        ex.value = sel.value === 'USD' ? currentExchangeRate : 1;
    } else {
        ex.value = sel.value === 'USD' ? currentExchangeRate : 1;
    }
    calculatePricingTotal();
}

async function savePricingData(silent = false) {
    saveCurrentQuoteState();
    if (!currentEnquiry) {
        if (!silent) showModal("Error", "Enquiry missing", "error");
        throw new Error("Enquiry missing");
    }

    for (const quote of pricingQuotes) {
        const summary = getQuoteSummary(quote);
        const body = {
            enquiry_id: currentEnquiry.id,
            quote_name: quote.name,
            shipping_line: quote.line,
            place_of_receipt: quote.por,
            port_of_loading: quote.pol,
            port_of_discharge: quote.pod,
            final_place_of_delivery: quote.fpod,
            incoterm: quote.incoterm,
            rate_currency: quote.currency,
            transit_time_days: parseInt(quote.transit_time) || 0,
            rate_validity_date: quote.validity || null,
            destination_free_days: parseInt(quote.free_days) || 0,
            total_origin_charges_inr: summary.origin,
            total_destination_charges_usd: summary.destination,
            final_quote_inr: summary.origin,
            status: quote.status || 'draft',
            containers: quote.container_prices.map(c => ({
                container_type: c.container_type,
                charges: c.charges.map(ch => ({
                    charge_description: ch.desc,
                    account_type: ch.account,
                    currency: ch.curr,
                    charged_on: ch.on,
                    quantity: parseFloat(ch.qty) || 1,
                    rate: parseFloat(ch.rate) || 0,
                    exchange_rate: parseFloat(ch.ex) || 1,
                    vendor_rate: parseFloat(ch.vendor_rate) || 0
                }))
            }))
        };
        const method = quote.id ? 'PUT' : 'POST';
        const url = quote.id ? `${CONFIG.API_URL}/api/quotes/${quote.id}` : `${CONFIG.API_URL}/api/quotes/`;

        const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!response.ok) {
            const errDetail = await response.text();
            throw new Error(`Failed to save quote: ${errDetail}`);
        }
        const saved = await response.json();
        quote.id = saved.id;
        console.log(`✅ Quote ${quote.name} saved with ID: ${quote.id}`);
    }
}

function syncPostConfirmChromeAfterQuoteSave() {
    const pg = document.getElementById('quoteConfirmationPage');
    const hint = document.getElementById('confirmPricingHint');
    if (!pg) return;
    let confirmPageVisible = false;
    try {
        confirmPageVisible = window.getComputedStyle(pg).display !== 'none';
    } catch (_) {
        confirmPageVisible = pg.style.display === 'block';
    }
    if (!confirmPageVisible) return;
    if (hint) {
        hint.innerHTML =
            '<i class="fas fa-info-circle" style="margin-right: 8px; color: var(--navy-400);"></i>' +
            'This quote is saved. Review the <strong>Final rate breakdown</strong>, or proceed to tracking.';
    }
}

async function savePricing() {
    if (isPricingSheetSavedLocked()) {
        showModal('Locked', 'This quote was saved and locked. Open <strong>Edit Quotes</strong> from the dashboard (or Confirm Quote mode) to change values.', 'info');
        return;
    }
    try {
        await savePricingData();
        if (currentEnquiry && currentEnquiry.id != null) {
            try {
                sessionStorage.setItem(`pricing_saved_lock_${currentEnquiry.id}`, '1');
            } catch (_) { /* ignore */ }
        }
        pricingLockedAfterSave = true;
        if (_confirmUiSetupTimer) {
            clearTimeout(_confirmUiSetupTimer);
            _confirmUiSetupTimer = null;
        }
        syncPostConfirmChromeAfterQuoteSave();
        applyPricingSheetSavedLock();
        showModal(
            'Success',
            'Pricing saved and locked. Use <strong>Edit Quotes</strong> from the dashboard if you need to change it.',
            'success'
        );
    } catch (e) {
        showModal('Error', 'Failed to save pricing: ' + e.message, 'error');
    }
}

async function confirmQuote() {
    saveCurrentQuoteState(); // Sync current inputs

    // Check if at least one quote has basic details
    if (pricingQuotes.some(q => !q.line)) {
        return showModal('Incomplete Data', 'Some of your quotes are missing Shipping Line details. Please check all tabs.', 'warning');
    }

    // Build Comparison Grid HTML
    let comparisonHtml = `
        <p style="margin-bottom: 20px; color: var(--text-secondary);">Select the final quote you wish to proceed with. This will lock all pricing details.</p>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; max-height: 400px; overflow-y: auto; padding: 4px;">
                ${pricingQuotes.map((q, idx) => {
        const summary = getQuoteSummary(q);
        return `
                    <div class="selection-card" style="border: 2px solid var(--border-light); border-radius: 12px; padding: 16px; cursor: pointer; transition: all 0.2s; position: relative;" 
                         onmouseover="this.style.borderColor='var(--navy-400)'; this.style.background='var(--gray-50)'" 
                         onmouseout="this.style.borderColor='var(--border-light)'; this.style.background='white'"
                         onclick="finalizeSelectedQuote(${idx})">
                        <div style="font-weight: 800; color: var(--navy-900); font-size: 0.9rem; margin-bottom: 8px; display: flex; justify-content: space-between;">
                            <span>${q.name}</span>
                            <span style="color: #059669;">₹${summary.origin.toLocaleString()}</span>
                        </div>
                        <div style="font-size: 0.75rem; color: var(--text-tertiary); display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                            <div>Line: <span style="color: var(--navy-700); font-weight: 700;">${q.line}</span></div>
                            <div>Transit: <span style="color: var(--navy-700); font-weight: 700;">${q.transit_time} Days</span></div>
                        </div>
                        <div style="margin-top: 12px; text-align: center;">
                            <span style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #059669; letter-spacing: 0.05em;">Select this Quote <i class="fas fa-chevron-right"></i></span>
                        </div>
                    </div>
                `;
    }).join('')}
            </div>
    `;

    showModal('Final Quote Selection', comparisonHtml, 'info');
}

function getQuoteSummary(quote) {
    let totShippingLine = 0, totVendor = 0;
    quote.container_prices.forEach(cp => {
        cp.charges.forEach(ch => {
            const qty = parseFloat(ch.qty) || 0;
            const rate = parseFloat(ch.rate) || 0;
            const ex = parseFloat(ch.ex) || 1;
            const vendorRate = parseFloat(ch.vendor_rate) || 0;
            const tot = qty * rate;
            // USD charges always multiply by exchange rate (including Per BL)
            const inr = ch.curr === 'USD' ? tot * ex : tot;
            const vendorTot = qty * vendorRate;
            const vendorInr = ch.curr === 'USD' ? vendorTot * ex : vendorTot;
            if (ch.account === 'On Your Account') {
                totShippingLine += inr;
                totVendor += vendorInr;
            }
        });
    });
    return { origin: totShippingLine, vendor: totVendor, destination: 0 };
}

async function finalizeSelectedQuote(idx) {
    const quote = pricingQuotes[idx];
    activeQuoteIndex = idx;

    closeModal();

    showQuoteRemarksModal({
        title: 'Remarks before finalizing quote',
        confirmLabel: 'Continue',
        onConfirm: (remarks) => {
            showModal(
                'Confirm Selection',
                `Are you sure you want to finalize <strong>${quote.name}</strong> (${quote.line})? This will lock the pricing sheet.`,
                'warning',
                async () => {
                    await executeFinalizeQuote(quote, remarks);
                }
            );
        },
    });
}

async function executeFinalizeQuote(quote, remarks) {
    try {
        console.log('Finalizing quote:', quote);
        await savePricingData(true);
        console.log('Post-save quote ID:', quote.id);

        if (quote.id) {
            const statusRes = await fetch(
                `${CONFIG.API_URL}/api/quotes/${quote.id}/status?status=accepted`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        remarks_reason: remarks.remarks_reason,
                        remarks_other: remarks.remarks_other,
                    }),
                }
            );
            if (!statusRes.ok) {
                const err = await statusRes.json().catch(() => ({}));
                throw new Error(err.detail || 'Failed to update quote status');
            }
            quote.status = 'accepted';
            quote.accepted_remarks_reason = remarks.remarks_reason;
            quote.accepted_remarks_other = remarks.remarks_other;
            console.log('✅ Quote status updated to accepted');
        }

        const stageRes = await fetch(`${CONFIG.API_URL}/api/enquiry/${currentEnquiry.id}/stage?stage=3`, {
            method: 'PATCH',
        });
        if (!stageRes.ok) console.error('Failed to update enquiry stage:', await stageRes.text());
        else console.log('✅ Enquiry stage updated to 3');

        document.getElementById('calculatorSection').style.display = 'none';
        document.getElementById('quoteConfirmationPage').style.display = 'block';

        renderConfirmedTable(quote, remarks);

        clearPricingSavedLock();

        showPostConfirmOptions(quote);
    } catch (e) {
        showModal('Error', 'Failed to lock quote: ' + e.message, 'error');
    }
}

function showPostConfirmOptions(quote) {
    const enquiryId = currentEnquiry?.id;
    const quoteName = quote?.name || 'this quote';
    const lineName = quote?.line || '-';

    const message = `
        <div style="display:flex; flex-direction:column; gap:12px;">
            <div style="color: var(--text-secondary); font-weight: 600;">
                <strong>${quoteName}</strong> (${lineName}) is confirmed. What would you like to do next?
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:10px; justify-content:flex-end;">
                <button class="btn btn-primary" onclick="postConfirmViewBreakdown()" style="padding: 10px 14px; background: #2563eb; border: none;">
                    <i class="fas fa-list"></i> Final rate breakdown
                </button>
                <button class="btn btn-primary" onclick="postConfirmGoTracking(${enquiryId})" style="padding: 10px 14px; background: #059669; border: none;">
                    <i class="fas fa-route"></i> Proceed to tracking
                </button>
            </div>
        </div>
    `;

    showModal('Quote Confirmed', message, 'success');
}

function postConfirmViewBreakdown() {
    closeModal();
    const confirmedPage = document.getElementById('quoteConfirmationPage');
    if (confirmedPage) confirmedPage.style.display = 'block';
    const anchor = document.getElementById('confirmationDocumentTable') || confirmedPage;
    if (anchor && anchor.scrollIntoView) {
        setTimeout(() => anchor.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
}

function postConfirmGoTracking(enquiryId) {
    if (!enquiryId) return;
    closeModal();
    window.location.href = `/upload-track?enquiry_id=${enquiryId}`;
}

/** Inline onclick uses a legacy scope; expose handlers on window for modal HTML + consistency */
window.postConfirmViewBreakdown = postConfirmViewBreakdown;
window.postConfirmGoTracking = postConfirmGoTracking;

function bindQuoteConfirmationActions() {
    const breakdownBtn = document.getElementById('postConfirmViewBreakdownBtn');
    const trackingBtn = document.getElementById('postConfirmGoTrackingBtn');
    if (breakdownBtn) {
        breakdownBtn.addEventListener('click', () => postConfirmViewBreakdown());
    }
    if (trackingBtn) {
        trackingBtn.addEventListener('click', () => {
            const id = currentEnquiry?.id;
            if (id) postConfirmGoTracking(id);
        });
    }
}

function renderConfirmedTable(quote, remarks = null) {
    const container = document.getElementById('confirmationDocumentTable');
    if (!container) return;

    const summary = getQuoteSummary(quote);
    const remarkLabel = remarks?.remarks_label
        || (quote.accepted_remarks_reason ? getQuoteRemarkLabel(quote.accepted_remarks_reason) : '');
    const remarkOther = remarks?.remarks_other || quote.accepted_remarks_other;
    const remarksHtml = remarkLabel ? `
        <div style="background:#f8fafc; border:1px solid var(--border-light); border-radius:10px; padding:14px 16px; margin-bottom:20px;">
            <div style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-tertiary); margin-bottom:6px;">Finalization remarks</div>
            <div style="font-size:14px; font-weight:600; color:var(--navy-800);">${escapeHtml(remarkLabel)}</div>
            ${remarkOther ? `<div style="font-size:13px; color:var(--text-secondary); margin-top:6px;">${escapeHtml(remarkOther)}</div>` : ''}
        </div>
    ` : '';

    let html = remarksHtml + `
        <div style="background: white; padding: 20px; border: 1px solid var(--border-medium); border-radius: 12px; margin-bottom: 24px;">
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; text-align: left;">
                <div>
                    <div style="font-size: 11px; text-transform: uppercase; color: var(--text-tertiary); margin-bottom: 4px;">Shipping Line</div>
                    <div style="font-weight: 700; color: var(--navy-800);">${quote.line}</div>
                </div>
                <div>
                    <div style="font-size: 11px; text-transform: uppercase; color: var(--text-tertiary); margin-bottom: 4px;">Route</div>
                    <div style="font-weight: 700; color: var(--navy-800);">${quote.pol} → ${quote.pod}</div>
                </div>
                <div>
                    <div style="font-size: 11px; text-transform: uppercase; color: var(--text-tertiary); margin-bottom: 4px;">Validity</div>
                    <div style="font-weight: 700; color: #dc2626;">${quote.validity || 'N/A'}</div>
                </div>
            </div>
        </div>

        <div style="border: 1px solid var(--border-medium); border-radius: 8px; overflow: hidden;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead style="background: var(--gray-50);">
                    <tr>
                        <th style="padding: 12px; text-align: left; border-bottom: 2px solid var(--border-light);">Breakdown Item</th>
                        <th style="padding: 12px; text-align: left; border-bottom: 2px solid var(--border-light);">Notes</th>
                        <th style="padding: 12px; text-align: right; border-bottom: 2px solid var(--border-light);">Shipping Line (INR)</th>
                        <th style="padding: 12px; text-align: right; border-bottom: 2px solid var(--border-light); color: #374151;">Client Rate (INR)</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="padding: 12px;">Total Origin Charges</td>
                        <td style="padding: 12px; color: var(--text-tertiary);">Incoterm: ${quote.incoterm}</td>
                        <td style="padding: 12px; text-align: right; font-weight: 700;">₹${Math.round(summary.origin).toLocaleString()}</td>
                        <td style="padding: 12px; text-align: right; font-weight: 700; color: #374151;">₹${Math.round(summary.vendor).toLocaleString()}</td>
                    </tr>
                    <tr>
                        <td style="padding: 12px;">Transit Time</td>
                        <td style="padding: 12px; color: var(--text-tertiary);">Estimated Days</td>
                        <td colspan="2" style="padding: 12px; text-align: right; font-weight: 700;">${quote.transit_time} Days</td>
                    </tr>
                </tbody>
                <tfoot style="background: var(--navy-50);">
                    <tr>
                        <th colspan="2" style="padding: 12px; text-align: left; font-size: 15px;">Shipping Line Total (INR)</th>
                        <th style="padding: 12px; text-align: right; font-weight: 800; color: #1e3a8a; font-size: 18px;">
                            ₹${Math.round(summary.origin).toLocaleString()}
                        </th>
                        <th style="padding: 12px; text-align: right; font-weight: 800; color: #374151; font-size: 18px;">
                            ₹${Math.round(summary.vendor).toLocaleString()}
                        </th>
                    </tr>
                </tfoot>
            </table>
        </div>
        
        <div style="margin-top: 24px;">
            <h4 style="font-size: 14px; color: var(--navy-700); margin-bottom: 12px; font-weight: 700;">Final Rate Breakdown</h4>
            ${quote.container_prices.map(cp => `
                <div style="margin-bottom: 12px; border: 1px solid var(--border-light); border-radius: 8px; padding: 12px; background: white;">
                    <div style="font-weight: 800; color: var(--navy-900); border-bottom: 1px solid var(--border-light); padding-bottom: 6px; margin-bottom: 6px; font-size: 0.85rem;">
                        Container: ${cp.container_type}
                    </div>
                    <table style="width: 100%; font-size: 12px;">
                        <thead>
                            <tr style="color: var(--text-tertiary); font-size: 10px; text-transform: uppercase;">
                                <td style="padding: 4px 0;">Charge</td>
                                <td style="padding: 4px 0; text-align: right;">Shipping Line Rate</td>
                                <td style="padding: 4px 0; text-align: right; color: #374151;">Client Rate</td>
                            </tr>
                        </thead>
                        <tbody>
                        ${cp.charges.filter(ch => ch.account === 'On Your Account').map(ch => {
        const vRate = parseFloat(ch.vendor_rate) || parseFloat(ch.rate) || 0;
        return `
                            <tr>
                                <td style="padding: 4px 0; color: var(--text-secondary);">${ch.desc}</td>
                                <td style="padding: 4px 0; text-align: right; font-weight: 600;">${ch.curr} ${parseFloat(ch.rate).toLocaleString()}</td>
                                <td style="padding: 4px 0; text-align: right; font-weight: 600; color: #374151;">${ch.curr} ${vRate.toLocaleString()}</td>
                            </tr>`;
    }).join('')}
                        </tbody>
                    </table>
                </div>
            `).join('')}
        </div>
    `;
    container.innerHTML = html;
    document.getElementById('confirmedQuoteNumber').textContent = `Ref: ${quote.quote_number || 'QT-' + Math.floor(1000 + Math.random() * 9000)}`;
}

async function generatePDF() {
    if (!currentEnquiry || !currentEnquiry.id) {
        showModal('Error', 'Enquiry data not loaded. Please try again.', 'error');
        return;
    }

    try {
        // Auto-save before downloading to ensure backend has latest data/calculations
        await savePricingData(true);

        // Open the PDF generation endpoint
        window.open(`${CONFIG.API_URL}/api/pricing/pdf/${currentEnquiry.id}`, '_blank');
    } catch (e) {
        showModal('Error', 'Failed to save data for PDF generation: ' + e.message, 'error');
    }
}
