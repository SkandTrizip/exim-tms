/**
 * Update Quote modal — post-SI revisions in Tracking.
 * Shows Initial Quote (read-only) vs Final Quote (editable).
 */

let uqState = {
    quoteId: null,
    initialQuote: null,
    finalContainers: [],
    // Fallback cross-rates to INR, used until /api/exchange-rate/rates resolves.
    exchangeRates: { USD: 86.8, EUR: 94.35, GBP: 109.87, JPY: 0.55 },
    saving: false,
};

function getUqExchangeRate(curr) {
    if (curr === 'INR') return 1;
    return formatUqExRate(uqState.exchangeRates[curr] || 1);
}

function formatUqExRate(value) {
    const n = parseFloat(value);
    if (!Number.isFinite(n)) return 1;
    return Math.round(n * 100) / 100;
}

function displayUqExRate(value) {
    const n = formatUqExRate(value);
    return n === 1 ? '1' : n.toFixed(2);
}

function getUqChargeCurrencies() {
    return (CONFIG.CHARGE_CURRENCIES && CONFIG.CHARGE_CURRENCIES.length)
        ? CONFIG.CHARGE_CURRENCIES
        : ['USD', 'EUR', 'GBP', 'JPY', 'INR'];
}

let uqContext = {
    containerCount: null,
    hostedInParent: false,
};

function getUqContainerCount() {
    if (uqContext.containerCount != null) return uqContext.containerCount;
    if (typeof currentEnquiryData !== 'undefined' && currentEnquiryData?.container_count != null) {
        return currentEnquiryData.container_count;
    }
    return 1;
}

function ensureUpdateQuoteModalShell() {
    if (document.getElementById('updateQuoteModal')) return;

    const overlay = document.createElement('div');
    overlay.id = 'updateQuoteModal';
    overlay.className = 'update-quote-overlay';
    overlay.style.display = 'none';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeUpdateQuoteModal();
    });
    overlay.innerHTML = `
        <div class="update-quote-dialog" role="dialog" aria-modal="true" aria-labelledby="updateQuoteTitle">
            <div class="update-quote-header">
                <h2 id="updateQuoteTitle"><i class="fas fa-file-invoice-dollar" style="color:#059669"></i> Update Quote</h2>
                <button type="button" class="update-quote-close" onclick="closeUpdateQuoteModal()" aria-label="Close">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="update-quote-body" id="uqModalBody">
                <div id="uqModalLoading" class="action-modal-loading" style="display:none;">
                    <i class="fas fa-spinner fa-spin"></i> Loading quote data…
                </div>
                <div id="uqModalContent">
                    <section class="uq-section" aria-labelledby="uqInitialHeading">
                        <div class="uq-section-title initial" id="uqInitialHeading">
                            <i class="fas fa-lock"></i> Initial Quote
                            <span class="uq-initial-badge">Confirmed at client sign-off</span>
                        </div>
                        <div id="uqInitialTables"></div>
                        <div class="uq-totals-grid" style="margin-top:12px;">
                            <div class="uq-total-card">
                                <label>Initial Quote Total (INR)</label>
                                <div class="amount" id="uqInitialTotal">₹0</div>
                            </div>
                        </div>
                    </section>
                    <section class="uq-section" aria-labelledby="uqFinalHeading">
                        <div class="uq-section-title final" id="uqFinalHeading">
                            <i class="fas fa-pen"></i> Final Quote
                            <span class="uq-initial-badge" style="background:#ecfdf5;color:#059669;">Editable after SI</span>
                        </div>
                        <div id="uqFinalTables"></div>
                        <div class="uq-totals-grid">
                            <div class="uq-total-card">
                                <label><i class="fas fa-ship"></i> Shipping Line Total (INR)</label>
                                <div class="amount" id="uqFinalLineTotal" style="color:#2563eb">₹0</div>
                            </div>
                            <div class="uq-total-card">
                                <label><i class="fas fa-plane"></i> Client Rate Total (INR)</label>
                                <div class="amount" id="uqFinalClientTotal" style="color:#374151">₹0</div>
                            </div>
                            <div class="uq-total-card highlight">
                                <label><i class="fas fa-money-bill-wave"></i> Final Quote Amount</label>
                                <div class="amount" id="uqFinalQuoteAmount">₹0</div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
            <div class="update-quote-footer">
                <button type="button" class="btn btn-secondary" onclick="closeUpdateQuoteModal()">Cancel</button>
                <button type="button" class="btn btn-primary" id="uqSaveBtn" onclick="saveFinalQuoteRevision()"
                    style="background:#059669;border:none;">
                    <i class="fas fa-save"></i> Save Final Quote
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function notifyTrackingIframeFinalQuoteSaved(finalQuote) {
    try {
        const iframe = document.getElementById('actionModalBody')
            ?.querySelector('.action-modal-iframe, iframe[src*="upload-track"]');
        iframe?.contentWindow?.postMessage({ type: 'final-quote-saved', finalQuote }, '*');
    } catch (_) { /* ignore */ }
}

function calcChargeInr(ch) {
    const qty = parseFloat(ch.quantity ?? ch.qty) || 0;
    const rate = parseFloat(ch.rate) || 0;
    const ex = parseFloat(ch.exchange_rate ?? ch.ex) || 1;
    const curr = String(ch.currency ?? ch.curr ?? 'INR').toUpperCase();
    const tot = qty * rate;
    return curr !== 'INR' ? tot * ex : tot;
}

function calcClientInr(ch) {
    const qty = parseFloat(ch.quantity ?? ch.qty) || 0;
    const vendorEx = parseFloat(ch.vendor_exchange_rate ?? ch.exchange_rate ?? ch.ex) || 1;
    const curr = String(ch.currency ?? ch.curr ?? 'INR').toUpperCase();
    const vendor = ch.vendor_rate != null && ch.vendor_rate !== ''
        ? (parseFloat(ch.vendor_rate) || 0)
        : (parseFloat(ch.rate) || 0);
    const tot = qty * vendor;
    return curr !== 'INR' ? tot * vendorEx : tot;
}

function sumContainersInr(containers, useClient = false) {
    let total = 0;
    (containers || []).forEach((c) => {
        (c.charges || []).forEach((ch) => {
            if ((ch.account_type || ch.account) !== 'On Your Account') return;
            total += useClient ? calcClientInr(ch) : calcChargeInr(ch);
        });
    });
    return Math.round(total);
}

function mapApiQuoteToContainers(quote) {
    if (!quote?.containers) return [];
    return [...quote.containers]
        .sort((a, b) => (a.container_sequence ?? 0) - (b.container_sequence ?? 0))
        .map((c) => ({
            container_type: c.container_type,
            charges: [...(c.charges || [])]
                .sort((a, b) => (a.charge_sequence ?? 0) - (b.charge_sequence ?? 0))
                .map((ch) => ({
                    charge_description: ch.charge_description,
                    account_type: ch.account_type || 'On Your Account',
                    currency: ch.currency || 'USD',
                    charged_on: ch.charged_on || 'Per Container',
                    quantity: ch.quantity ?? 1,
                    rate: ch.rate ?? 0,
                    exchange_rate: formatUqExRate(ch.exchange_rate ?? 1),
                    vendor_rate: ch.vendor_rate != null ? ch.vendor_rate : ch.rate ?? 0,
                    vendor_exchange_rate: formatUqExRate(ch.vendor_exchange_rate ?? ch.exchange_rate ?? 1),
                })),
        }));
}

function mapSnapshotContainersToEditable(snapshot) {
    return (snapshot?.containers || []).map((c) => ({
        container_type: c.container_type,
        charges: (c.charges || []).map((ch) => ({
            charge_description: ch.charge_description || '',
            account_type: ch.account_type || 'On Your Account',
            currency: ch.currency || 'USD',
            charged_on: ch.charged_on || 'Per Container',
            quantity: ch.quantity ?? 1,
            rate: ch.rate ?? 0,
            exchange_rate: ch.exchange_rate ?? 1,
            vendor_rate: ch.vendor_rate != null ? ch.vendor_rate : ch.rate ?? 0,
            vendor_exchange_rate: ch.vendor_exchange_rate ?? ch.exchange_rate ?? 1,
        })),
    }));
}

function parseSnapshotInr(snapshot) {
    if (!snapshot) return null;
    try {
        const s = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
        const val = s.final_quote_inr ?? s.total_origin_charges_inr;
        return val != null ? Math.round(val) : null;
    } catch (_) {
        return null;
    }
}

function mapSnapshotContainers(snapshot) {
    return mapSnapshotContainersToEditable(snapshot);
}

function renderInitialTable(containers) {
    const host = document.getElementById('uqInitialTables');
    if (!host) return;
    if (!containers.length) {
        host.innerHTML = '<p class="cell-muted" style="padding:12px;">No initial quote snapshot available.</p>';
        return;
    }
    host.innerHTML = containers.map((c, idx) => `
        <div class="uq-container-card readonly">
            <div class="uq-container-head">Group ${idx + 1} · ${escapeHtml(c.container_type || '—')}</div>
            <table class="uq-charges-table readonly">
                <thead>
                    <tr>
                        <th>Charge Name</th>
                        <th>Account</th>
                        <th>Curr</th>
                        <th>Charged On</th>
                        <th>Qty</th>
                        <th>Rate</th>
                        <th>Ex. Rate</th>
                        <th style="text-align:right">Shipping Line (INR)</th>
                        <th style="text-align:right">Client Rate</th>
                        <th>Client Ex. Rate</th>
                        <th style="text-align:right">Client Rate (INR)</th>
                    </tr>
                </thead>
                <tbody>
                    ${(c.charges || []).map((ch) => `
                        <tr>
                            <td>${escapeHtml(ch.charge_description || '')}</td>
                            <td>${escapeHtml(ch.account_type || '')}</td>
                            <td>${escapeHtml(ch.currency || '')}</td>
                            <td>${escapeHtml(ch.charged_on || '')}</td>
                            <td>${ch.quantity ?? ''}</td>
                            <td>${ch.rate ?? ''}</td>
                            <td>${displayUqExRate(ch.exchange_rate ?? 1)}</td>
                            <td class="inr-cell">₹${Math.round(ch.shipping_line_inr ?? calcChargeInr(ch)).toLocaleString()}</td>
                            <td>${ch.vendor_rate ?? ch.rate ?? ''}</td>
                            <td>${displayUqExRate(ch.vendor_exchange_rate ?? ch.exchange_rate ?? 1)}</td>
                            <td class="inr-cell" style="color:#374151">₹${Math.round(ch.client_rate_inr ?? calcClientInr(ch)).toLocaleString()}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `).join('');
}

function renderFinalTables() {
    const host = document.getElementById('uqFinalTables');
    if (!host) return;
    const defaultQty = getUqContainerCount();

    host.innerHTML = uqState.finalContainers.map((c, cIdx) => `
        <div class="uq-container-card" data-container-idx="${cIdx}">
            <div class="uq-container-head">
                <span>Group ${cIdx + 1}</span>
                <select class="uq-c-type" data-cidx="${cIdx}" style="margin-left:8px;padding:4px 8px;font-size:12px;border-radius:6px;">
                    ${(CONFIG.containerTypes || []).map((t) =>
                        `<option value="${escapeHtml(t)}" ${t === c.container_type ? 'selected' : ''}>${escapeHtml(t)}</option>`
                    ).join('')}
                </select>
            </div>
            <table class="uq-charges-table">
                <thead>
                    <tr>
                        <th>Charge Name</th>
                        <th>Account</th>
                        <th>Curr</th>
                        <th>Charged On</th>
                        <th>Qty</th>
                        <th>Rate</th>
                        <th>Ex. Rate</th>
                        <th style="text-align:right">Shipping Line (INR)</th>
                        <th style="text-align:right">Client Rate</th>
                        <th>Client Ex. Rate</th>
                        <th style="text-align:right">Client Rate (INR)</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody data-cidx="${cIdx}">
                    ${(c.charges || []).map((ch, rIdx) => renderFinalRow(ch, cIdx, rIdx, defaultQty)).join('')}
                </tbody>
            </table>
            <button type="button" class="uq-add-charge" data-cidx="${cIdx}"><i class="fas fa-plus-circle"></i> Add Charge Item</button>
        </div>
    `).join('');

    host.querySelectorAll('.uq-c-type').forEach((sel) => {
        sel.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.cidx, 10);
            uqState.finalContainers[idx].container_type = e.target.value;
        });
    });

    host.querySelectorAll('.uq-add-charge').forEach((btn) => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.cidx, 10);
            uqState.finalContainers[idx].charges.push({
                charge_description: '',
                account_type: 'On Your Account',
                currency: 'USD',
                charged_on: 'Per Container',
                quantity: defaultQty,
                rate: 0,
                exchange_rate: getUqExchangeRate('USD'),
                vendor_rate: 0,
                vendor_exchange_rate: getUqExchangeRate('USD'),
            });
            renderFinalTables();
            updateFinalTotals();
        });
    });

    bindFinalRowEvents(host);
    updateFinalTotals();
}

function renderFinalRow(ch, cIdx, rIdx, defaultQty) {
    const on = ch.charged_on || 'Per Container';
    const qty = on === 'Per BL' ? 1 : (ch.quantity ?? defaultQty);
    const curr = String(ch.currency || 'USD').toUpperCase();
    const ex = formatUqExRate(ch.exchange_rate || getUqExchangeRate(ch.currency));
    const vendorEx = formatUqExRate(ch.vendor_exchange_rate ?? ch.exchange_rate ?? getUqExchangeRate(ch.currency));
    const inr = calcChargeInr({ ...ch, quantity: qty, exchange_rate: ex });
    const clientInr = calcClientInr({ ...ch, quantity: qty, vendor_exchange_rate: vendorEx });
    const exReadonly = curr === 'INR';
    return `
        <tr data-cidx="${cIdx}" data-ridx="${rIdx}">
            <td><input type="text" class="uq-desc" value="${escapeHtml(ch.charge_description || '')}"></td>
            <td>
                <select class="uq-account">
                    <option value="On Your Account" ${ch.account_type === 'On Your Account' ? 'selected' : ''}>On Your Account</option>
                    <option value="Consignee Account" ${ch.account_type === 'Consignee Account' ? 'selected' : ''}>Consignee Account</option>
                </select>
            </td>
            <td>
                <select class="uq-curr">
                    ${getUqChargeCurrencies().map(c => `<option value="${c}" ${ch.currency === c ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
            </td>
            <td>
                <select class="uq-on">
                    <option value="Per BL" ${on === 'Per BL' ? 'selected' : ''}>Per BL</option>
                    <option value="Per Container" ${on === 'Per Container' ? 'selected' : ''}>Per Container</option>
                </select>
            </td>
            <td><input type="number" class="uq-qty" value="${qty}" min="0" ${on === 'Per BL' ? 'readonly' : ''}></td>
            <td><input type="number" class="uq-rate" value="${ch.rate ?? ''}" min="0" step="any"></td>
            <td><input type="number" class="uq-ex" value="${displayUqExRate(ex)}" min="0" step="0.01" ${exReadonly ? 'readonly' : ''}></td>
            <td class="inr-cell uq-line-inr">₹${Math.round(inr).toLocaleString()}</td>
            <td><input type="number" class="uq-vendor" value="${ch.vendor_rate ?? ch.rate ?? ''}" min="0" step="any" style="min-width:72px"></td>
            <td><input type="number" class="uq-vendor-ex" value="${displayUqExRate(vendorEx)}" min="0" step="0.01" ${exReadonly ? 'readonly' : ''} style="min-width:72px"></td>
            <td class="inr-cell uq-client-inr" style="color:#374151">₹${Math.round(clientInr).toLocaleString()}</td>
            <td>
                <button type="button" class="btn-icon-overlay uq-remove-row" title="Remove charge" style="position:static;">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `;
}

function bindFinalRowEvents(host) {
    host.querySelectorAll('tbody tr').forEach((row) => {
        const sync = () => {
            syncRowToState(row);
            updateRowInr(row);
            updateFinalTotals();
        };
        row.querySelectorAll('input, select').forEach((el) => {
            el.addEventListener('input', sync);
            el.addEventListener('change', sync);
        });
        row.querySelector('.uq-on')?.addEventListener('change', (e) => {
            const qtyEl = row.querySelector('.uq-qty');
            if (e.target.value === 'Per BL') {
                qtyEl.value = 1;
                qtyEl.readOnly = true;
            } else {
                qtyEl.readOnly = false;
                if (!qtyEl.value || qtyEl.value === '1') {
                    qtyEl.value = getUqContainerCount();
                }
            }
            sync();
        });
        row.querySelector('.uq-curr')?.addEventListener('change', (e) => {
            const nextEx = getUqExchangeRate(e.target.value);
            const exEl = row.querySelector('.uq-ex');
            const vendorExEl = row.querySelector('.uq-vendor-ex');
            const isInr = e.target.value === 'INR';
            if (exEl) {
                exEl.value = displayUqExRate(nextEx);
                exEl.readOnly = isInr;
            }
            if (vendorExEl) {
                vendorExEl.value = displayUqExRate(nextEx);
                vendorExEl.readOnly = isInr;
            }
            sync();
        });
        row.querySelector('.uq-remove-row')?.addEventListener('click', () => {
            const cIdx = parseInt(row.dataset.cidx, 10);
            const rIdx = parseInt(row.dataset.ridx, 10);
            uqState.finalContainers[cIdx].charges.splice(rIdx, 1);
            renderFinalTables();
        });
    });
}

function syncRowToState(row) {
    const cIdx = parseInt(row.dataset.cidx, 10);
    const rIdx = parseInt(row.dataset.ridx, 10);
    const ch = uqState.finalContainers[cIdx].charges[rIdx];
    if (!ch) return;
    ch.charge_description = row.querySelector('.uq-desc')?.value || '';
    ch.account_type = row.querySelector('.uq-account')?.value || 'On Your Account';
    ch.currency = row.querySelector('.uq-curr')?.value || 'USD';
    ch.charged_on = row.querySelector('.uq-on')?.value || 'Per Container';
    ch.quantity = parseFloat(row.querySelector('.uq-qty')?.value) || 0;
    ch.rate = parseFloat(row.querySelector('.uq-rate')?.value) || 0;
    ch.exchange_rate = formatUqExRate(row.querySelector('.uq-ex')?.value);
    ch.vendor_rate = parseFloat(row.querySelector('.uq-vendor')?.value) || 0;
    ch.vendor_exchange_rate = formatUqExRate(row.querySelector('.uq-vendor-ex')?.value);
}

function updateRowInr(row) {
    syncRowToState(row);
    const cIdx = parseInt(row.dataset.cidx, 10);
    const rIdx = parseInt(row.dataset.ridx, 10);
    const ch = uqState.finalContainers[cIdx].charges[rIdx];
    const lineCell = row.querySelector('.uq-line-inr');
    const clientCell = row.querySelector('.uq-client-inr');
    if (lineCell) lineCell.textContent = '₹' + Math.round(calcChargeInr(ch)).toLocaleString();
    if (clientCell) clientCell.textContent = '₹' + Math.round(calcClientInr(ch)).toLocaleString();
}

function updateFinalTotals() {
    const line = sumContainersInr(uqState.finalContainers, false);
    const client = sumContainersInr(uqState.finalContainers, true);
    const initialContainers = uqState.initialQuote
        ? mapApiQuoteToContainers(uqState.initialQuote)
        : [];
    const initial = sumContainersInr(initialContainers, false);

    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = '₹' + val.toLocaleString();
    };
    set('uqInitialTotal', initial);
    set('uqFinalLineTotal', line);
    set('uqFinalClientTotal', client);
    set('uqFinalQuoteAmount', line);
}

function syncAllFinalRowsFromDom() {
    document.querySelectorAll('#uqFinalTables tbody tr').forEach(syncRowToState);
}

async function fetchExchangeRateForUq() {
    try {
        const res = await fetch(`${CONFIG.API_URL}/api/exchange-rate/rates`);
        if (res.ok) {
            const data = await res.json();
            if (data && !data.error) {
                Object.keys(data).forEach((key) => {
                    uqState.exchangeRates[key] = formatUqExRate(data[key]);
                });
            }
        }
    } catch (_) { /* keep default */ }
}

function getTrackingQuoteData() {
    return window.currentPricingData || (typeof currentPricingData !== 'undefined' ? currentPricingData : null);
}

function notifyParentUqModal(open) {
    /* Legacy — modal now opens in parent when embedded in the tracking drawer. */
}

async function openUpdateQuoteModalFromHost(payload) {
    const quote = payload?.quote;
    if (!quote?.id) return;
    await openUpdateQuoteModalInternal(quote, {
        containerCount: payload.containerCount,
        hostedInParent: true,
    });
}

async function openUpdateQuoteModal() {
    const quote = getTrackingQuoteData();
    if (!quote?.id) {
        showModal('No Quote', 'No accepted quote found for this shipment.', 'warning');
        return;
    }
    if (String(quote.status || '').toLowerCase() !== 'accepted') {
        showModal('Quote Not Confirmed', 'Confirm the quote in Quotes & Pricing before updating it here.', 'warning');
        return;
    }
    const siChecked = !!document.getElementById('status_si_submitted')?.checked;
    if (!siChecked) {
        showModal('SI Required', 'Upload SI and mark SI Submitted before updating the quote.', 'warning');
        return;
    }

    if (window.parent !== window) {
        window.parent.postMessage({
            type: 'open-update-quote',
            quote: { id: quote.id, status: quote.status },
            containerCount: typeof currentEnquiryData !== 'undefined' ? currentEnquiryData?.container_count : null,
        }, '*');
        return;
    }

    await openUpdateQuoteModalInternal(quote);
}

async function openUpdateQuoteModalInternal(quote, options = {}) {
    uqContext = {
        containerCount: options.containerCount ?? null,
        hostedInParent: !!options.hostedInParent,
    };

    ensureUpdateQuoteModalShell();

    const overlay = document.getElementById('updateQuoteModal');
    if (!overlay) return;

    overlay.style.display = 'flex';
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('uq-modal-open');
    document.body.style.overflow = 'hidden';
    notifyParentUqModal(true);

    const loading = document.getElementById('uqModalLoading');
    const content = document.getElementById('uqModalContent');
    if (loading) loading.style.display = 'flex';
    if (content) content.style.display = 'none';

    try {
        await fetchExchangeRateForUq();

        const [initialRes, finalRes] = await Promise.all([
            fetch(`${CONFIG.API_URL}/api/quotes/${quote.id}/initial`),
            fetch(`${CONFIG.API_URL}/api/quotes/${quote.id}/final`),
        ]);

        if (!initialRes.ok) {
            const errBody = await initialRes.json().catch(() => ({}));
            throw new Error(errBody.detail || 'Failed to load initial quote');
        }

        const initialData = await initialRes.json();
        const initialQuote = initialData.quote || initialData;

        uqState.quoteId = initialQuote.id;
        uqState.initialQuote = initialQuote;

        if (finalRes.ok) {
            const finalQuote = await finalRes.json();
            uqState.finalContainers = finalQuote
                ? mapApiQuoteToContainers(finalQuote)
                : mapApiQuoteToContainers(initialQuote);
        } else {
            uqState.finalContainers = mapApiQuoteToContainers(initialQuote);
        }

        if (loading) loading.style.display = 'none';
        if (content) content.style.display = 'block';

        renderInitialTable(mapApiQuoteToContainers(initialQuote));
        renderFinalTables();
        updateFinalTotals();
    } catch (err) {
        closeUpdateQuoteModal();
        showModal('Error', err.message || 'Could not load quote for update.', 'error');
    }
}

function closeUpdateQuoteModal() {
    const overlay = document.getElementById('updateQuoteModal');
    if (overlay) {
        overlay.style.display = 'none';
        overlay.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('uq-modal-open');
    document.body.style.overflow = '';
    notifyParentUqModal(false);
}

async function saveFinalQuoteRevision() {
    if (uqState.saving || !uqState.quoteId) return;

    showQuoteRemarksModal({
        title: 'Remarks for final quote update',
        confirmLabel: 'Save final quote',
        onConfirm: async (remarks) => {
            await persistFinalQuoteRevision(remarks);
        },
    });
}

async function persistFinalQuoteRevision(remarks) {
    if (uqState.saving || !uqState.quoteId) return;
    syncAllFinalRowsFromDom();

    const lineTotal = sumContainersInr(uqState.finalContainers, false);
    const payload = {
        total_origin_charges_inr: lineTotal,
        final_quote_inr: lineTotal,
        remarks_reason: remarks.remarks_reason,
        remarks_other: remarks.remarks_other,
        containers: uqState.finalContainers.map((c) => ({
            container_type: c.container_type,
            charges: c.charges.map((ch) => ({
                charge_description: ch.charge_description,
                account_type: ch.account_type,
                currency: ch.currency,
                charged_on: ch.charged_on,
                quantity: ch.quantity,
                rate: ch.rate,
                exchange_rate: formatUqExRate(ch.exchange_rate),
                vendor_rate: ch.vendor_rate,
                vendor_exchange_rate: formatUqExRate(ch.vendor_exchange_rate),
            })),
        })),
    };

    const saveBtn = document.getElementById('uqSaveBtn');
    uqState.saving = true;
    if (saveBtn) {
        saveBtn.classList.add('is-loading');
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';
        saveBtn.disabled = true;
    }

    try {
        const res = await fetch(`${CONFIG.API_URL}/api/quotes/${uqState.quoteId}/final-revision`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || 'Save failed');
        }
        const saved = await res.json();
        if (typeof window.onFinalQuoteSaved === 'function') {
            window.onFinalQuoteSaved(saved);
        }
        if (uqContext.hostedInParent) {
            notifyTrackingIframeFinalQuoteSaved(saved);
        }
        closeUpdateQuoteModal();
        showModal('Saved', 'Final quote updated successfully.', 'success');
    } catch (err) {
        showModal('Error', err.message || 'Failed to save final quote.', 'error');
    } finally {
        uqState.saving = false;
        if (saveBtn) {
            saveBtn.classList.remove('is-loading');
            saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Final Quote';
            saveBtn.disabled = false;
        }
    }
}

function updateUpdateQuoteRowVisibility() {
    const row = document.getElementById('row_update_quote');
    if (!row) return;
    const siChecked = !!document.getElementById('status_si_submitted')?.checked;
    const quote = getTrackingQuoteData();
    const hasQuote = !!(quote?.id && String(quote.status || '').toLowerCase() === 'accepted');
    row.style.display = siChecked && hasQuote ? 'table-row' : 'none';
}

window.openUpdateQuoteModal = openUpdateQuoteModal;
window.openUpdateQuoteModalFromHost = openUpdateQuoteModalFromHost;
window.closeUpdateQuoteModal = closeUpdateQuoteModal;
window.saveFinalQuoteRevision = saveFinalQuoteRevision;
