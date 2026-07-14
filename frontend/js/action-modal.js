/**
 * In-place action drawer for Sales / Quotes / Tracking workflows.
 * Opens a right-side panel instead of navigating away from the dashboard.
 */

const ACTION_MODAL_COPY = {
    'view-sale': {
        title: 'Sale Details',
        subtitle: 'Review and update sale information below',
        primary: 'Update'
    },
    'edit-quotes': {
        title: 'Edit Quotes',
        subtitle: 'Manage quotations and pricing for this sale',
        primary: null
    },
    'confirm-quote': {
        title: 'Confirm Quote',
        subtitle: 'Review and confirm the client quotation',
        primary: null
    },
    'view-quotes': {
        title: 'View Quotes',
        subtitle: 'Review quotation details for this sale',
        primary: null
    },
    'view-tracking': {
        title: 'Tracking & Documents',
        subtitle: 'Manage shipment milestones and status updates',
        primary: null
    },
    'add-client': {
        title: 'Add Client',
        subtitle: 'Create a new client origin and branch',
        primary: 'Save Origin & Continue'
    },
    'edit-client': {
        title: 'Client Master',
        subtitle: 'View or update client master details',
        primary: 'Update Client Master'
    },
    'add-shipping-line': {
        title: 'Add Shipping Line',
        subtitle: 'Register a new shipping line partner',
        primary: 'Save Shipping Line'
    },
    'edit-shipping-line': {
        title: 'Edit Shipping Line',
        subtitle: 'Update shipping line partner details',
        primary: 'Update Shipping Line'
    },
    'view-client': {
        title: 'View Client',
        subtitle: 'Client master and origin details',
        primary: null
    },
    'view-shipping-line': {
        title: 'View Shipping Line',
        subtitle: 'Shipping line partner details',
        primary: null
    },
    'new-sale': {
        title: 'Create New Sale',
        subtitle: 'Enter basic shipment details to start the workflow',
        primary: 'Save Sale'
    },
    'finance-payment': {
        title: 'Payment to Shipping Line',
        subtitle: 'Record payment against shipping line charges',
        primary: null
    },
    'finance-invoice': {
        title: 'Create Invoice',
        subtitle: 'Raise client invoice for this shipment',
        primary: null
    },
    'finance-received': {
        title: 'Record Client Payment',
        subtitle: 'Record payment received against this invoice',
        primary: null
    }
};

let actionModalState = { mode: null, enquiryId: null, enquiry: null };
let actionModalLoadId = 0;

function ensureActionModalShell() {
    if (document.getElementById('actionModalOverlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'actionModalOverlay';
    overlay.className = 'action-modal-overlay';
    overlay.innerHTML = `
        <div class="action-modal" role="dialog" aria-modal="true" aria-labelledby="actionModalTitle">
            <div class="action-modal-header">
                <div>
                    <h2 class="action-modal-title" id="actionModalTitle">Details</h2>
                    <p class="action-modal-subtitle" id="actionModalSubtitle"></p>
                </div>
                <button type="button" class="action-modal-close" onclick="closeActionModal()" aria-label="Close">
                    <i class="fas fa-xmark"></i>
                </button>
            </div>
            <div class="action-modal-body" id="actionModalBody">
                <div class="action-modal-loading">Loading…</div>
            </div>
            <div class="action-modal-footer" id="actionModalFooter">
                <button type="button" class="btn btn-secondary" id="actionModalCancelBtn" onclick="closeActionModal()">Cancel</button>
                <button type="button" class="btn btn-primary" id="actionModalPrimaryBtn" style="display:none;">Update</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeActionModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('active')) closeActionModal();
    });
}

function closeActionDropdowns() {
    document.querySelectorAll('.actions-menu').forEach((m) => {
        m.style.removeProperty('display');
        m.classList.remove('open');
        resetActionsMenuPosition(m);
    });
    document.querySelectorAll('.actions-dropdown').forEach((d) => {
        d.classList.add('actions-menu-dismissed');
        d.classList.remove('actions-menu-open');
    });
}

function resetActionsMenuPosition(menu) {
    if (!menu) return;
    menu.classList.remove('actions-menu-floating');
    menu.style.removeProperty('display');
    menu.style.removeProperty('position');
    menu.style.removeProperty('top');
    menu.style.removeProperty('left');
    menu.style.removeProperty('right');
    menu.style.removeProperty('bottom');
    menu.style.removeProperty('min-width');
    menu.style.removeProperty('max-height');
    menu.style.removeProperty('overflow-y');
    menu.style.removeProperty('z-index');
    menu.style.removeProperty('visibility');

    const anchor = menu._actionsMenuAnchor;
    if (anchor?.parent && menu.parentElement === document.body) {
        if (anchor.next && anchor.next.parentElement === anchor.parent) {
            anchor.parent.insertBefore(menu, anchor.next);
        } else {
            anchor.parent.appendChild(menu);
        }
    }
}

function positionActionsMenu(menu, btn) {
    if (!menu || !btn) return;

    // Portal to body so scroll containers cannot clip the menu.
    if (!menu._actionsMenuAnchor) {
        menu._actionsMenuAnchor = {
            parent: menu.parentElement,
            next: menu.nextSibling,
        };
    }
    if (menu.parentElement !== document.body) {
        document.body.appendChild(menu);
    }

    menu.classList.add('actions-menu-floating');
    menu.style.position = 'fixed';
    menu.style.visibility = 'hidden';
    menu.style.display = 'block';
    menu.style.minWidth = '180px';
    menu.style.zIndex = '1200';
    menu.style.right = 'auto';
    menu.style.bottom = 'auto';

    const rect = btn.getBoundingClientRect();
    const menuWidth = menu.offsetWidth || 180;
    const menuHeight = menu.offsetHeight || 0;
    const gap = 6;
    const margin = 8;

    let top = rect.bottom + gap;
    let left = rect.right - menuWidth;

    if (top + menuHeight > window.innerHeight - margin) {
        top = rect.top - menuHeight - gap;
    }
    if (left < margin) left = margin;
    if (left + menuWidth > window.innerWidth - margin) {
        left = window.innerWidth - menuWidth - margin;
    }

    menu.style.top = `${Math.max(margin, top)}px`;
    menu.style.left = `${Math.max(margin, left)}px`;
    menu.style.visibility = '';
}

window.closeActionModal = function closeActionModal() {
    const overlay = document.getElementById('actionModalOverlay');
    if (!overlay) return;
    actionModalLoadId += 1;
    overlay.classList.remove('active');
    document.body.classList.remove('action-drawer-open');
    const body = document.getElementById('actionModalBody');
    if (body) {
        body.innerHTML = '';
        body.className = 'action-modal-body';
    }
    actionModalState = { mode: null, enquiryId: null, enquiry: null };
    document.querySelectorAll('.actions-dropdown').forEach((d) => {
        d.classList.remove('actions-menu-dismissed');
        d.classList.remove('actions-menu-open');
    });
    document.querySelectorAll('.actions-menu').forEach((m) => {
        m.classList.remove('open');
        resetActionsMenuPosition(m);
    });
};

function renderShipmentClientSection(enq) {
    return `
        <section class="action-section">
            <div class="action-section-head">
                <span class="action-section-icon"><i class="fas fa-building"></i></span>
                Shipment & Client Details
            </div>
            <div class="action-detail-grid">
                <div class="detail-item"><label>Client Name</label><span>${escapeHtml(enq.client_name || '—')}</span></div>
                <div class="detail-item"><label>Enquiry No</label><span>${escapeHtml(enq.enquiry_number || '—')}</span></div>
                <div class="detail-item"><label>Shipment Type</label><span>${escapeHtml(enq.shipment_type || '—')}</span></div>
                <div class="detail-item"><label>From Location</label><span>${escapeHtml(enq.origin || '—')}</span></div>
                <div class="detail-item"><label>To Location</label><span>${escapeHtml(enq.destination || '—')}</span></div>
                <div class="detail-item"><label>Commodity</label><span>${escapeHtml(enq.commodity || '—')}</span></div>
                <div class="detail-item"><label>Container</label><span>${escapeHtml(enq.container_type || '—')} × ${escapeHtml(String(enq.container_count || 0))}</span></div>
                <div class="detail-item"><label>Incoterm</label><span>${escapeHtml(enq.incoterm || '—')}</span></div>
                <div class="detail-item"><label>Client Scope</label><span>${escapeHtml(enq.client_scope || '—')}</span></div>
            </div>
        </section>`;
}

function renderSaleModalBody(enq) {
    const stuffing = enq.stuffing_date ? String(enq.stuffing_date).split('T')[0] : '';
    const hblOn = !!enq.hbl_required;
    const hblDisplay = hblOn ? 'block' : 'none';
    return `
        ${renderShipmentClientSection(enq)}
        <section class="action-section">
            <div class="action-section-head">
                <span class="action-section-icon"><i class="fas fa-clipboard-list"></i></span>
                Basic Sale Details
            </div>
            <div class="action-form-grid">
                <div class="form-group">
                    <label>Stuffing Date</label>
                    <input type="date" id="actionStuffingDate" value="${escapeAttr(stuffing)}">
                </div>
                <div class="form-group">
                    <label>Client Target Rate</label>
                    <input type="number" id="actionTargetRate" min="0" step="0.01" value="${escapeAttr(enq.client_target_rate ?? '')}">
                </div>
                <div class="form-group full-width">
                    <label>Remarks</label>
                    <textarea id="actionRemarks" placeholder="Add remarks">${escapeHtml(enq.remarks || '')}</textarea>
                </div>
                <div class="form-group">
                    <label>HBL Required</label>
                    <label class="toggle-switch" style="display: inline-flex; align-items: center; gap: 10px; cursor: pointer; user-select: none;">
                        <input type="checkbox" id="actionHblRequired" onchange="toggleActionHblFields()" ${hblOn ? 'checked' : ''} style="display: none;">
                        <span class="toggle-track" id="actionHblTrack" style="position: relative; width: 44px; height: 24px; background: ${hblOn ? 'var(--primary, #2563eb)' : '#cbd5e1'}; border-radius: 12px; transition: background 0.2s;">
                            <span class="toggle-thumb" style="position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; background: #fff; border-radius: 50%; transition: transform 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.15); transform: ${hblOn ? 'translateX(20px)' : 'translateX(0)'};"></span>
                        </span>
                        <span id="actionHblLabel" style="font-size: 13px; font-weight: 600; color: ${hblOn ? 'var(--primary, #2563eb)' : 'var(--text-tertiary)'};">${hblOn ? 'Yes' : 'No'}</span>
                    </label>
                </div>
                <div class="form-group full-width" id="actionDeliveryAgentGroup" style="display: ${hblDisplay};">
                    <label>Delivery Agent</label>
                    <textarea id="actionDeliveryAgent" placeholder="Agent name, address, contact details...">${escapeHtml(enq.delivery_agent || '')}</textarea>
                </div>
                <div class="form-group full-width action-hbl-field" id="actionNotifyPartyGroup" style="display: ${hblDisplay};">
                    <label>Notify Party 1 Address</label>
                    <textarea id="actionNotifyPartyAddress" placeholder="Party name, full address, contact number...">${escapeHtml(enq.notify_party_address || '')}</textarea>
                </div>
                <div class="form-group full-width action-hbl-field" id="actionNotifyParty2Group" style="display: ${hblDisplay};">
                    <label>Notify Party 2 Address</label>
                    <textarea id="actionNotifyParty2Address" placeholder="Party name, full address, contact number...">${escapeHtml(enq.notify_party_2_address || '')}</textarea>
                </div>
                <div class="form-group action-hbl-field" id="actionVesselGroup" style="display: ${hblDisplay};">
                    <label>Vessel</label>
                    <input type="text" id="actionVessel" placeholder="e.g., MSC AURORA" value="${escapeAttr(enq.vessel || '')}">
                </div>
                <div class="form-group action-hbl-field" id="actionVoyageNoGroup" style="display: ${hblDisplay};">
                    <label>Voyage No.</label>
                    <input type="text" id="actionVoyageNo" placeholder="e.g., 123W" value="${escapeAttr(enq.voyage_no || '')}">
                </div>
            </div>
        </section>`;
}

window.toggleActionHblFields = function toggleActionHblFields() {
    const cb = document.getElementById('actionHblRequired');
    if (!cb) return;

    const on = cb.checked;
    const label = document.getElementById('actionHblLabel');
    const track = document.getElementById('actionHblTrack');
    const thumb = track?.querySelector('.toggle-thumb');
    const deliveryGroup = document.getElementById('actionDeliveryAgentGroup');

    if (label) {
        label.textContent = on ? 'Yes' : 'No';
        label.style.color = on ? 'var(--primary, #2563eb)' : 'var(--text-tertiary)';
    }
    if (track) track.style.background = on ? 'var(--primary, #2563eb)' : '#cbd5e1';
    if (thumb) thumb.style.transform = on ? 'translateX(20px)' : 'translateX(0)';
    if (deliveryGroup) deliveryGroup.style.display = on ? 'block' : 'none';
    document.querySelectorAll('.action-hbl-field').forEach((el) => {
        el.style.display = on ? 'block' : 'none';
    });
};

function renderQuoteSummarySection(quotes) {
    if (!quotes || quotes.length === 0) {
        return `<section class="action-section"><div class="action-section-head"><span class="action-section-icon"><i class="fas fa-file-invoice-dollar"></i></span>Quote Summary</div><p style="margin:0;color:var(--text-tertiary);font-size:13px;">No quotes saved yet.</p></section>`;
    }

    const cards = quotes.map((q) => {
        const status = (q.status || 'draft').toUpperCase();
        const total = q.final_quote_inr ? `₹${Number(q.final_quote_inr).toLocaleString()}` : '—';
        return `
            <div class="quote-summary-card">
                <div>
                    <strong>${escapeHtml(q.shipping_line || 'Quote')}</strong>
                    <div class="meta">Status: ${escapeHtml(status)} · Total: ${total}</div>
                </div>
            </div>`;
    }).join('');

    return `
        <section class="action-section">
            <div class="action-section-head">
                <span class="action-section-icon"><i class="fas fa-file-invoice-dollar"></i></span>
                Quote Summary
            </div>
            <div class="quote-summary-grid">${cards}</div>
        </section>`;
}

function renderIframeSection(src) {
    return `<iframe class="action-modal-iframe" src="${src}" title="Workflow editor" loading="lazy"></iframe>`;
}

async function fetchEnquiryById(enquiryId) {
    const cached = enquiries.find((e) => e.id === enquiryId);
    if (cached) return { ...cached };

    const res = await fetch(`${CONFIG.API_URL}/api/enquiry/${enquiryId}`);
    if (!res.ok) throw new Error('Could not load enquiry');
    return res.json();
}

async function saveSaleFromModal() {
    const { enquiryId, enquiry } = actionModalState;
    if (!enquiryId || !enquiry) return;

    const hblRequired = !!document.getElementById('actionHblRequired')?.checked;
    const payload = {
        ...enquiry,
        stuffing_date: document.getElementById('actionStuffingDate')?.value || null,
        client_target_rate: parseFloat(document.getElementById('actionTargetRate')?.value) || 0,
        remarks: document.getElementById('actionRemarks')?.value || '',
        hbl_required: hblRequired,
        delivery_agent: hblRequired ? (document.getElementById('actionDeliveryAgent')?.value || null) : null,
        vessel: hblRequired ? (document.getElementById('actionVessel')?.value || null) : null,
        voyage_no: hblRequired ? (document.getElementById('actionVoyageNo')?.value || null) : null,
        notify_party_address: hblRequired ? (document.getElementById('actionNotifyPartyAddress')?.value || null) : null,
        notify_party_2_address: hblRequired ? (document.getElementById('actionNotifyParty2Address')?.value || null) : null,
    };

    const res = await fetch(`${CONFIG.API_URL}/api/enquiry/${enquiryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showModal('Error', err.detail || 'Failed to update sale', 'error');
        return;
    }

    const updated = await res.json();
    const idx = enquiries.findIndex((e) => e.id === enquiryId);
    if (idx !== -1) enquiries[idx] = updated;

    showModal('Updated', 'Sale details saved successfully.', 'success');
    closeActionModal();

    if (typeof updateAllEnquiriesTable === 'function') updateAllEnquiriesTable(currentAllEnquiriesFilter);
    if (typeof updateDashboardTable === 'function') updateDashboardTable();
    if (typeof refreshBulkStatusCache === 'function') refreshBulkStatusCache();
}

function isMasterSaveMode(mode) {
    return ['add-client', 'edit-client', 'add-shipping-line', 'edit-shipping-line'].includes(mode);
}

async function invokeMasterSaveFromDrawer(mode) {
    const iframe = document.querySelector('#actionModalBody .action-modal-iframe');
    const win = iframe && iframe.contentWindow;
    if (!win) throw new Error('Form is still loading. Try again in a moment.');
    if (mode.includes('client')) {
        if (typeof win.saveEmbeddedMaster !== 'function') {
            throw new Error('Client form is not ready yet. Try again.');
        }
        await win.saveEmbeddedMaster();
        return;
    }
    if (typeof win.saveEmbeddedShippingLine !== 'function') {
        throw new Error('Shipping line form is not ready yet. Try again.');
    }
    await win.saveEmbeddedShippingLine();
}

function bindPrimaryAction(mode) {
    const btn = document.getElementById('actionModalPrimaryBtn');
    const footer = document.getElementById('actionModalFooter');
    if (!btn) return;

    let cancelBtn = document.getElementById('actionModalCancelBtn');
    if (!cancelBtn && footer) {
        cancelBtn = footer.querySelector('.btn-secondary');
        if (cancelBtn) cancelBtn.id = 'actionModalCancelBtn';
    }

    const copy = ACTION_MODAL_COPY[mode];
    const hideCancel = mode === 'new-sale';

    if (cancelBtn) {
        cancelBtn.style.display = hideCancel ? 'none' : '';
    }

    if (!copy || !copy.primary) {
        btn.style.display = 'none';
        btn.disabled = false;
        btn.onclick = null;
        if (footer) footer.style.display = hideCancel ? 'none' : '';
        return;
    }

    if (footer) footer.style.display = '';
    btn.style.display = 'inline-flex';
    btn.disabled = false;
    btn.textContent = copy.primary;
    btn.onclick = async () => {
        if (mode === 'view-sale') {
            saveSaleFromModal();
            return;
        }
        if (mode === 'new-sale') {
            const iframe = document.querySelector('#actionModalBody .action-modal-iframe');
            const win = iframe && iframe.contentWindow;
            if (!win || typeof win.saveEnquiry !== 'function') return;

            btn.disabled = true;
            const label = copy.primary;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Saving…';
            try {
                await win.saveEnquiry();
            } finally {
                const overlay = document.getElementById('actionModalOverlay');
                if (overlay && overlay.classList.contains('active') && actionModalState.mode === 'new-sale') {
                    btn.disabled = false;
                    btn.textContent = label;
                }
            }
            return;
        }
        if (isMasterSaveMode(mode)) {
            btn.disabled = true;
            const label = copy.primary;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Saving…';
            try {
                await invokeMasterSaveFromDrawer(mode);
            } catch (err) {
                showModal('Error', err.message || 'Could not save. Try again.', 'error');
            } finally {
                const overlay = document.getElementById('actionModalOverlay');
                if (overlay && overlay.classList.contains('active') && actionModalState.mode === mode) {
                    btn.disabled = false;
                    btn.textContent = label;
                }
            }
        }
    };
}

window.openActionModal = async function openActionModal(mode, enquiryId, quoteStatus = null, options = null) {
    ensureActionModalShell();
    closeActionDropdowns();

    const overlay = document.getElementById('actionModalOverlay');
    const titleEl = document.getElementById('actionModalTitle');
    const subtitleEl = document.getElementById('actionModalSubtitle');
    const bodyEl = document.getElementById('actionModalBody');
    const copy = ACTION_MODAL_COPY[mode] || { title: 'Details', subtitle: '', primary: null };

    let parsedOptions = options || null;
    if (typeof parsedOptions === 'string' && parsedOptions.trim()) {
        try {
            const json = decodeURIComponent(escape(atob(parsedOptions)));
            parsedOptions = JSON.parse(json);
        } catch (e) {
            parsedOptions = null;
        }
    }

    const loadId = ++actionModalLoadId;
    actionModalState = { mode, enquiryId, enquiry: null, options: parsedOptions || null };
    titleEl.textContent = copy.title;
    subtitleEl.textContent = copy.subtitle;
    bindPrimaryAction(mode);

    overlay.classList.add('active');
    document.body.classList.add('action-drawer-open');

    if (mode === 'new-sale') {
        bodyEl.className = 'action-modal-body action-modal-body-iframe';
        bodyEl.innerHTML = renderIframeSection('/enquiry?embedded=1');
        return;
    }

    if (mode === 'add-client') {
        bodyEl.className = 'action-modal-body action-modal-body-iframe';
        bodyEl.innerHTML = renderIframeSection('/client-master?embedded=1&tab=1');
        return;
    }

    if (mode === 'edit-client' && enquiryId) {
        bodyEl.className = 'action-modal-body action-modal-body-iframe';
        bodyEl.innerHTML = renderIframeSection(`/client-master?embedded=1&tab=2&id=${enquiryId}`);
        return;
    }

    if (mode === 'view-client' && enquiryId) {
        bodyEl.className = 'action-modal-body action-modal-body-iframe';
        bodyEl.innerHTML = renderIframeSection(`/client-master?embedded=1&tab=2&id=${enquiryId}&view=1`);
        return;
    }

    if (mode === 'add-shipping-line') {
        bodyEl.className = 'action-modal-body action-modal-body-iframe';
        bodyEl.innerHTML = renderIframeSection('/shipping-line?embedded=1');
        return;
    }

    if (mode === 'edit-shipping-line' && enquiryId) {
        bodyEl.className = 'action-modal-body action-modal-body-iframe';
        bodyEl.innerHTML = renderIframeSection(`/shipping-line?embedded=1&id=${enquiryId}`);
        return;
    }

    if (mode === 'view-shipping-line' && enquiryId) {
        bodyEl.className = 'action-modal-body action-modal-body-iframe';
        bodyEl.innerHTML = renderIframeSection(`/shipping-line?embedded=1&id=${enquiryId}&view=1`);
        return;
    }

    if (mode === 'finance-payment' && enquiryId) {
        bodyEl.className = 'action-modal-body action-modal-body-iframe';
        bodyEl.innerHTML = renderIframeSection(`/finance-details?enquiry_id=${enquiryId}&embedded=1`);
        return;
    }

    if (mode === 'finance-invoice' && enquiryId) {
        bodyEl.className = 'action-modal-body action-modal-body-iframe';
        const o = (actionModalState && actionModalState.options) ? actionModalState.options : null;
        const params = new URLSearchParams({ enquiry_id: String(enquiryId), embedded: '1' });
        if (o && o.item_type) params.set('item_type', String(o.item_type));
        if (o && o.additional_doc_id) params.set('additional_doc_id', String(o.additional_doc_id));
        bodyEl.innerHTML = renderIframeSection(`/create-invoice?${params.toString()}`);
        return;
    }

    if (mode === 'finance-received' && enquiryId) {
        bodyEl.className = 'action-modal-body action-modal-body-iframe';
        bodyEl.innerHTML = renderIframeSection(`/record-payment?invoice_id=${enquiryId}&embedded=1`);
        return;
    }

    if ((mode === 'edit-quotes' || mode === 'confirm-quote' || mode === 'view-quotes') && enquiryId) {
        bodyEl.className = 'action-modal-body action-modal-body-iframe';
        bodyEl.innerHTML = '<div class="action-modal-loading">Loading…</div>';

        try {
            const quotesRes = await fetch(`${CONFIG.API_URL}/api/quotes/enquiry/${enquiryId}`);
            if (loadId !== actionModalLoadId) return;
            const quotes = quotesRes.ok ? await quotesRes.json() : [];
            const hasAccepted = quotes.some((q) => String(q.status || '').toLowerCase() === 'accepted');
            let effectiveMode = mode;
            if (hasAccepted && mode !== 'view-quotes') {
                effectiveMode = 'view-quotes';
            }
            const modeMap = { 'edit-quotes': 'edit', 'confirm-quote': 'confirm', 'view-quotes': 'view' };
            const iframeSrc = `/pricing?enquiry_id=${enquiryId}&mode=${modeMap[effectiveMode]}&embedded=1`;
            bodyEl.innerHTML = renderIframeSection(iframeSrc);
        } catch (err) {
            if (loadId !== actionModalLoadId) return;
            bodyEl.className = 'action-modal-body';
            bodyEl.innerHTML = `<div class="action-modal-loading" style="color:var(--error);">${escapeHtml(err.message || 'Failed to load')}</div>`;
        }
        return;
    }

    if (mode === 'view-tracking' && enquiryId) {
        bodyEl.className = 'action-modal-body action-modal-body-iframe';
        bodyEl.innerHTML = renderIframeSection(`/upload-track?enquiry_id=${enquiryId}&embedded=1`);
        return;
    }

    bodyEl.className = 'action-modal-body';
    bodyEl.innerHTML = '<div class="action-modal-loading">Loading…</div>';

    try {
        const enq = await fetchEnquiryById(enquiryId);
        if (loadId !== actionModalLoadId) return;

        actionModalState.enquiry = enq;

        if (mode === 'view-sale') {
            bodyEl.innerHTML = renderSaleModalBody(enq);
            return;
        }

        bodyEl.innerHTML = renderShipmentClientSection(enq);
    } catch (err) {
        if (loadId !== actionModalLoadId) return;
        bodyEl.innerHTML = `<div class="action-modal-loading" style="color:var(--error);">${escapeHtml(err.message || 'Failed to load')}</div>`;
    }
};

function closestFromEventTarget(target, selector) {
    const el = target instanceof Element ? target : target?.parentElement;
    return el?.closest?.(selector) ?? null;
}

function initActionsMenus() {
    if (document.body.dataset.actionsMenuBound) return;
    document.body.dataset.actionsMenuBound = '1';

    const closeAllActionsMenus = () => {
        closeActionDropdowns();
    };

    document.addEventListener('click', (e) => {
        const actionBtn = closestFromEventTarget(e.target, '.actions-dropdown .row-actions-btn, .actions-dropdown .actions-btn');
        if (actionBtn) {
            e.preventDefault();
            e.stopPropagation();
            const dropdown = actionBtn.closest('.actions-dropdown');
            const menu = dropdown?.querySelector('.actions-menu');
            if (!dropdown || !menu) return;

            const willOpen = !menu.classList.contains('open');
            closeAllActionsMenus();

            if (!willOpen) return;

            dropdown.classList.remove('actions-menu-dismissed');
            menu.classList.add('open');
            dropdown.classList.add('actions-menu-open');
            positionActionsMenu(menu, actionBtn);
            return;
        }

        if (!closestFromEventTarget(e.target, '.actions-dropdown') && !closestFromEventTarget(e.target, '.actions-menu.actions-menu-floating')) {
            closeAllActionsMenus();
        }
    });

    window.addEventListener('scroll', closeAllActionsMenus, true);
    window.addEventListener('resize', closeAllActionsMenus);
}

document.addEventListener('DOMContentLoaded', () => {
    ensureActionModalShell();
    initActionsMenus();
    if (new URLSearchParams(window.location.search).get('embedded') === '1') {
        document.body.classList.add('embedded-mode');
    }

    document.addEventListener('mouseenter', (e) => {
        const dropdown = closestFromEventTarget(e.target, '.actions-dropdown');
        if (dropdown) dropdown.classList.remove('actions-menu-dismissed');
    }, true);

    window.addEventListener('message', (event) => {
        if (!event.data) return;
        if (event.data.type === 'master-saved') {
            closeActionModal();
            if (typeof refreshMastersList === 'function') refreshMastersList();

            const entity = event.data.entity || 'record';
            const isUpdate = !!event.data.updated;
            const name = event.data.name ? `"${event.data.name}"` : 'record';
            let title = 'Saved';
            let message = event.data.message || '';

            if (entity === 'client') {
                title = isUpdate ? 'Client Master Updated' : 'Client Master Saved';
                message = message || (isUpdate
                    ? `Client master ${name} was updated successfully.`
                    : `Client master ${name} was created successfully.`);
            } else if (entity === 'shipping') {
                title = isUpdate ? 'Shipping Line Updated' : 'Shipping Line Saved';
                message = message || (isUpdate
                    ? `Shipping line ${name} was updated successfully.`
                    : `Shipping line ${name} was created successfully.`);
            } else if (!message) {
                message = isUpdate ? 'Changes were saved successfully.' : 'Saved successfully.';
            }

            showModal(title, message, 'success');
            return;
        }
        if (event.data.type === 'master-save-error') {
            const msg = event.data.message || 'Could not save. Check the form and try again.';
            showModal('Error', msg, 'error');
            return;
        }
        if (event.data.type === 'master-step-changed') {
            const btn = document.getElementById('actionModalPrimaryBtn');
            if (btn && event.data.label) btn.textContent = event.data.label;
            return;
        }
        if (event.data.type === 'sale-saved') {
            closeActionModal();
            if (typeof fetchAllEnquiries === 'function') fetchAllEnquiries();
            else if (typeof updateAllEnquiriesTable === 'function') updateAllEnquiriesTable(currentAllEnquiriesFilter);
            if (typeof updateDashboardTable === 'function') updateDashboardTable();
            if (typeof refreshBulkStatusCache === 'function') refreshBulkStatusCache();
            return;
        }
        if (event.data.type === 'finance-saved') {
            const refresh = async () => {
                if (typeof window.applyFinanceSavedRefresh === 'function') {
                    await window.applyFinanceSavedRefresh({
                        section: event.data.section,
                        moveToCompleted: event.data.moveToCompleted,
                    });
                }
            };
            refresh();
            if (event.data.close) closeActionModal();
            return;
        }
        if (event.data.type === 'tracking-saved') {
            const refresh = async () => {
                if (typeof window.applyTrackingSavedRefresh === 'function') {
                    await window.applyTrackingSavedRefresh({
                        moveToCompleted: event.data.moveToCompleted,
                    });
                }
            };
            refresh();
            return;
        }
        if (event.data.type === 'open-update-quote') {
            if (typeof window.openUpdateQuoteModalFromHost === 'function') {
                window.openUpdateQuoteModalFromHost(event.data);
            }
            return;
        }
        if (event.data.type === 'uq-modal-open') {
            /* Legacy — update quote modal is parent-hosted now. */
            return;
        }
    });
});
