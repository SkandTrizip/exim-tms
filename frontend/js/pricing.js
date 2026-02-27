// Pricing Page Logic
let currentEnquiry = null;
let pricingQuotes = [];
let activeQuoteIndex = 0;
let currentExchangeRate = 86.8;
let isConfirmMode = false;  // controls vendor rate column visibility

document.addEventListener('DOMContentLoaded', async function () {
    // 1. Initial UI Setup
    populateInitialDropdowns();

    // 2. Load Data
    const urlParams = new URLSearchParams(window.location.search);
    const enquiryId = urlParams.get('enquiry_id');
    const mode = urlParams.get('mode');

    if (enquiryId) {
        await fetchEnquiryData(enquiryId);
        updateEnquirySummary(); // Populate the top summary bar
        await fetchQuotesForEnquiry(enquiryId);
        await fetchExchangeRate();

        if (mode === 'confirm') {
            initConfirmMode();
        } else if (mode === 'view') {
            initViewMode();
        } else if (mode === 'edit') {
            initPricingTable(true); // true means force edit
        } else {
            // Default behavior
            initPricingTable();
        }
    }
});

function initViewMode() {
    console.log('👁️ Entering View-Only Mode');
    initPricingTable(false, true); // forceView = true

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

        // Specifically hide add/remove buttons
        document.querySelectorAll('.btn-add, .btn-remove, .btn-primary, .tab-actions').forEach(el => {
            el.style.display = 'none';
        });
    }, 500);
}

function initConfirmMode() {
    console.log('🛡️ Entering Confirm Mode — Vendor Rate editable only');
    isConfirmMode = true;                          // show vendor column in newly rendered rows
    document.body.classList.add('confirm-mode');   // show vendor total card via CSS

    // Show calculator but mostly read-only
    initPricingTable(false, true);

    // Hide administrative actions
    const saveBtn = document.querySelector('button[onclick="savePricing()"]');
    const addQuoteBtn = document.querySelector('button[onclick="addNewQuote()"]');
    if (saveBtn) saveBtn.style.display = 'none';
    if (addQuoteBtn) addQuoteBtn.style.display = 'none';

    // Show the Confirm button
    const confirmBtn = document.getElementById('confirmQuoteBtn');
    if (confirmBtn) confirmBtn.style.display = 'flex';

    // Lock everything EXCEPT .p-vendor inputs
    setTimeout(() => {
        const containers = ['#calculatorSection', '.route-section'];
        containers.forEach(selector => {
            const container = document.querySelector(selector);
            if (container) {
                const elements = container.querySelectorAll(
                    'input:not(.p-vendor), select, textarea, button:not(.btn-secondary):not(#confirmQuoteBtn)'
                );
                elements.forEach(el => {
                    el.disabled = true;
                    el.style.opacity = '0.75';
                    el.style.cursor = 'not-allowed';
                });
            }
        });
        // Keep vendor rate cells clearly editable
        document.querySelectorAll('.p-vendor').forEach(el => {
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
                    container_prices: q.containers ? q.containers.map(c => ({
                        container_type: c.container_type,
                        charges: c.charges ? c.charges.map(ch => ({
                            desc: ch.charge_description,
                            account: ch.account_type,
                            curr: ch.currency,
                            on: ch.charged_on,
                            qty: ch.quantity,
                            rate: ch.rate,
                            ex: ch.exchange_rate,
                            vendor_rate: ch.vendor_rate || 0
                        })) : []
                    })) : [],
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

        const confirmedIdx = pricingQuotes.findIndex(q => q.status === 'accepted');

        // Auto-lock logic (Skip if forceEdit is true)
        if (confirmedIdx !== -1 && !forceEdit) {
            activeQuoteIndex = confirmedIdx;
            loadQuote(confirmedIdx);

            // Lock UI immediately
            document.getElementById('calculatorSection').style.display = 'none';
            document.getElementById('quoteConfirmationPage').style.display = 'block';

            renderConfirmedTable(pricingQuotes[confirmedIdx]);

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
        charges: Array.from(section.querySelectorAll('tbody tr')).map(row => ({
            desc: row.querySelector('.p-desc').value,
            account: row.querySelector('.p-account').value,
            curr: row.querySelector('.p-curr').value,
            on: row.querySelector('.p-on').value,
            qty: row.querySelector('.p-qty').value,
            rate: row.querySelector('.p-rate').value,
            ex: row.querySelector('.p-ex').value,
            // If vendor input exists use it; otherwise default to rate (mirrors rate in normal mode)
            vendor_rate: row.querySelector('.p-vendor')
                ? (row.querySelector('.p-vendor').value || row.querySelector('.p-rate').value)
                : row.querySelector('.p-rate').value
        }))
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

function addPricingRowToTbody(tbody, data = {}) {
    const row = document.createElement('tr');
    const defaultQty = currentEnquiry ? (currentEnquiry.container_count || 1) : 1;
    const core = ["Ocean Freight", "BL Fee", "Origin THC", "Seal Charge", "MUC"];
    const isCore = data.desc && core.includes(data.desc);
    const defaultEx = data.on === 'Per BL' ? 1 : (data.ex || (data.curr === 'USD' ? currentExchangeRate : 1));
    // Default vendor_rate mirrors rate — user can override in confirm mode
    const defaultVendorRate = (data.vendor_rate != null && data.vendor_rate > 0) ? data.vendor_rate : (data.rate || '');
    // Was vendor_rate explicitly set to a different value than rate?
    const vendorManual = (data.vendor_rate != null && data.vendor_rate > 0 && data.vendor_rate !== data.rate) ? 'true' : 'false';

    // Delete button overlaid on the INR cell (only for non-core rows)
    const deleteBtn = !isCore
        ? `<button type="button" class="btn-icon-overlay" onclick="this.closest('tr').remove(); calculatePricingTotal()" title="Remove row"><i class="fas fa-trash"></i></button>`
        : '';

    row.innerHTML = `
        <td><input type="text" class="p-desc" value="${data.desc || ''}" ${isCore ? 'readonly' : ''} oninput="calculatePricingTotal()"></td>
        <td><select class="p-account" onchange="calculatePricingTotal()"><option value="On Your Account" ${data.account === 'On Your Account' ? 'selected' : ''}>On Your Account</option><option value="Consignee Account" ${data.account === 'Consignee Account' ? 'selected' : ''}>Consignee Account</option></select></td>
        <td><select class="p-curr" onchange="handleCurrencyChange(this)"><option value="USD" ${data.curr === 'USD' ? 'selected' : ''}>USD</option><option value="INR" ${data.curr === 'INR' ? 'selected' : ''}>INR</option></select></td>
        <td><select class="p-on" onchange="handleChargedOnChange(this)"><option value="Per BL" ${data.on === 'Per BL' ? 'selected' : ''}>Per BL</option><option value="Per Container" ${data.on === 'Per Container' ? 'selected' : ''}>Per Container</option></select></td>
        <td><input type="number" class="p-qty" value="${data.on === 'Per BL' ? 1 : (data.qty || defaultQty)}" ${data.on === 'Per BL' ? 'readonly' : ''} min="0" oninput="if(this.value<0)this.value=0; calculatePricingTotal()" onkeydown="if(event.key==='-')event.preventDefault()"></td>
        <td><input type="number" class="p-rate" value="${data.rate || ''}" min="0" oninput="if(this.value<0)this.value=0; syncVendorRate(this); calculatePricingTotal()" onkeydown="if(event.key==='-')event.preventDefault()"></td>
        <td><input type="number" class="p-ex" value="${defaultEx}" min="0" oninput="if(this.value<0)this.value=0; calculatePricingTotal()" onkeydown="if(event.key==='-')event.preventDefault()"></td>
        <td class="col-inr" style="position:relative; font-weight:600; color:#1e3a8a;"><span class="p-inr-val">₹0</span>${deleteBtn}</td>
        ${isConfirmMode ? `<td class="col-vendor"><input type="number" class="p-vendor" value="${defaultVendorRate}" data-manual="${vendorManual}" min="0" placeholder="0" oninput="if(this.value<0)this.value=0; this.dataset.manual='true'; calculatePricingTotal()" onkeydown="if(event.key==='-')event.preventDefault()"></td>` : ''}
    `;
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

            // Shipping Line Total INR: qty × rate × ex_rate
            const tot = qty * rate;
            const inr = on === 'Per BL' ? tot : (curr === 'USD' ? tot * ex : tot);

            // Vendor Total INR: vendor_rate × qty × ex_rate (same formula)
            const vendorTot = qty * vendorRate;
            const vendorInr = on === 'Per BL' ? vendorTot : (curr === 'USD' ? vendorTot * ex : vendorTot);

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
        ex.value = 1; ex.readOnly = true;
    } else {
        qty.readOnly = false; ex.readOnly = false;
        ex.value = row.querySelector('.p-curr').value === 'USD' ? currentExchangeRate : 1;
    }
    calculatePricingTotal();
}

function handleCurrencyChange(sel) {
    const row = sel.closest('tr');
    const ex = row.querySelector('.p-ex');
    if (row.querySelector('.p-on').value === 'Per BL') ex.value = 1;
    else ex.value = sel.value === 'USD' ? currentExchangeRate : 1;
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

async function savePricing() {
    try {
        await savePricingData();
        showModal('Success', 'Pricing saved successfully!', 'success');
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
            const inr = ch.on === 'Per BL' ? tot : (ch.curr === 'USD' ? tot * ex : tot);
            // Vendor total: vendor_rate × qty × ex_rate (same formula)
            const vendorTot = qty * vendorRate;
            const vendorInr = ch.on === 'Per BL' ? vendorTot : (ch.curr === 'USD' ? vendorTot * ex : vendorTot);
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
    activeQuoteIndex = idx; // Switch to the selected one for rendering

    closeModal();

    showModal('Confirm Selection', `Are you sure you want to finalize <strong>${quote.name}</strong> (${quote.line})? This will lock the pricing sheet.`, 'warning', async () => {
        try {
            console.log('Finalizing quote:', quote);
            await savePricingData(true);
            console.log('Post-save quote ID:', quote.id);

            // Update backend status to accepted
            if (quote.id) {
                const statusRes = await fetch(`${CONFIG.API_URL}/api/quotes/${quote.id}/status?status=accepted`, {
                    method: 'PATCH'
                });
                if (!statusRes.ok) console.error('Failed to update quote status:', await statusRes.text());
                else console.log('✅ Quote status updated to accepted');
            }

            // Update enquiry stage to 3 (Upload & Track)
            const stageRes = await fetch(`${CONFIG.API_URL}/api/enquiry/${currentEnquiry.id}/stage?stage=3`, {
                method: 'PATCH'
            });
            if (!stageRes.ok) console.error('Failed to update enquiry stage:', await stageRes.text());
            else console.log('✅ Enquiry stage updated to 3');



            // Update UI
            document.getElementById('calculatorSection').style.display = 'none';
            document.getElementById('quoteConfirmationPage').style.display = 'block';

            renderConfirmedTable(quote);

            showModal('Quote Finalized', `Quotation for <strong>${quote.line}</strong> has been confirmed. You can now proceed to Tracking.`, 'success', () => {
                window.location.href = `/upload-track?enquiry_id=${currentEnquiry.id}`;
            });
        } catch (e) {
            showModal('Error', 'Failed to lock quote: ' + e.message, 'error');
        }
    });
}

function renderConfirmedTable(quote) {
    const container = document.getElementById('confirmationDocumentTable');
    if (!container) return;

    const summary = getQuoteSummary(quote);
    let html = `
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

function goBack() {
    window.location.href = '/#dashboard';
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
