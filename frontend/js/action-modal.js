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
        primary: null
    },
    'edit-client': {
        title: 'Client Master',
        subtitle: 'View or update client master details',
        primary: null
    },
    'add-shipping-line': {
        title: 'Add Shipping Line',
        subtitle: 'Register a new shipping line partner',
        primary: null
    },
    'edit-shipping-line': {
        title: 'Edit Shipping Line',
        subtitle: 'Update shipping line partner details',
        primary: null
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
        primary: null
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
                <button type="button" class="btn btn-secondary" onclick="closeActionModal()">Cancel</button>
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
            </div>
        </section>`;
}

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

    const payload = {
        ...enquiry,
        stuffing_date: document.getElementById('actionStuffingDate')?.value || null,
        client_target_rate: parseFloat(document.getElementById('actionTargetRate')?.value) || 0,
        remarks: document.getElementById('actionRemarks')?.value || ''
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

function bindPrimaryAction(mode) {
    const btn = document.getElementById('actionModalPrimaryBtn');
    if (!btn) return;

    const copy = ACTION_MODAL_COPY[mode];
    if (!copy || !copy.primary) {
        btn.style.display = 'none';
        btn.onclick = null;
        return;
    }

    btn.style.display = 'inline-flex';
    btn.textContent = copy.primary;
    btn.onclick = () => {
        if (mode === 'view-sale') saveSaleFromModal();
    };
}

window.openActionModal = async function openActionModal(mode, enquiryId, quoteStatus = null) {
    ensureActionModalShell();
    closeActionDropdowns();

    const overlay = document.getElementById('actionModalOverlay');
    const titleEl = document.getElementById('actionModalTitle');
    const subtitleEl = document.getElementById('actionModalSubtitle');
    const bodyEl = document.getElementById('actionModalBody');
    const copy = ACTION_MODAL_COPY[mode] || { title: 'Details', subtitle: '', primary: null };

    const loadId = ++actionModalLoadId;
    actionModalState = { mode, enquiryId, enquiry: null };
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
        bodyEl.innerHTML = renderIframeSection(`/create-invoice?enquiry_id=${enquiryId}&embedded=1`);
        return;
    }

    if (mode === 'finance-received' && enquiryId) {
        bodyEl.className = 'action-modal-body action-modal-body-iframe';
        bodyEl.innerHTML = renderIframeSection(`/record-payment?invoice_id=${enquiryId}&embedded=1`);
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

        if (mode === 'edit-quotes' || mode === 'confirm-quote' || mode === 'view-quotes') {
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
            bodyEl.innerHTML = `${renderShipmentClientSection(enq)}${renderQuoteSummarySection(quotes)}${renderIframeSection(iframeSrc)}`;
            return;
        }

        if (mode === 'view-tracking') {
            const iframeSrc = `/upload-track?enquiry_id=${enquiryId}&embedded=1`;
            bodyEl.innerHTML = `${renderShipmentClientSection(enq)}${renderIframeSection(iframeSrc)}`;
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
