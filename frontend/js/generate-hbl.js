let focusedEnquiryId = null;

document.addEventListener('DOMContentLoaded', async function () {
    focusedEnquiryId = new URLSearchParams(window.location.search).get('enquiry_id');
    await loadHblEntries();
    await maybeFocusEnquiry(focusedEnquiryId);
});

function openHblDocument(enquiryId, viewDraft = false) {
    if (!enquiryId) return;
    const params = new URLSearchParams({ enquiry_id: String(enquiryId) });
    if (viewDraft) params.set('view_draft', '1');
    window.location.href = `/hbl-document?${params.toString()}`;
}

async function openHblByReference() {
    const input = document.getElementById('hblRefSearch');
    const ref = (input?.value || '').trim();
    if (!ref) {
        showModal('Input Required', 'Enter a shipment reference number (Job No.).', 'warning');
        return;
    }

    try {
        const res = await fetch(`${CONFIG.API_URL}/api/enquiry/lookup-hbl/${encodeURIComponent(ref)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            showModal('Not Found', data.detail || 'Could not find that shipment.', 'warning');
            return;
        }
        openHblDocument(data.id);
    } catch (err) {
        console.error('HBL lookup failed:', err);
        showModal('Error', 'Could not look up shipment. Please try again.', 'error');
    }
}

function renderHblActionButtons(enquiryId, hasSaved) {
    const generateLabel = hasSaved ? 'Re-open HBL' : 'Generate HBL';
    return `
        <div class="hbl-action-stack">
            <button class="btn btn-primary" style="padding: 6px 14px; font-size: 12px; white-space: nowrap;"
                onclick="openHblDocument(${enquiryId})">
                <i class="fas fa-file-contract"></i> ${generateLabel}
            </button>
            <button class="btn btn-secondary" style="padding: 6px 14px; font-size: 12px; white-space: nowrap;"
                onclick="openHblDocument(${enquiryId}, true)">
                <i class="fas fa-eye"></i> View Draft
            </button>
        </div>`;
}

async function maybeFocusEnquiry(enquiryId) {
    const banner = document.getElementById('hblFocusBanner');
    if (!banner || !enquiryId) return;

    const row = document.querySelector(`tr[data-enquiry-id="${enquiryId}"]`);
    if (row) {
        row.classList.add('hbl-row-focused');
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    let title = `Shipment #${enquiryId}`;
    let hasSaved = false;
    try {
        const [enqRes, snapRes] = await Promise.all([
            fetch(`${CONFIG.API_URL}/api/enquiry/${enquiryId}`),
            fetch(`${CONFIG.API_URL}/api/enquiry/hbl-document/${enquiryId}/snapshot`),
        ]);
        if (enqRes.ok) {
            const enq = await enqRes.json();
            title = enq.enquiry_number || title;
        }
        if (snapRes.ok) {
            const snap = await snapRes.json();
            hasSaved = !!snap.snapshot;
        }
    } catch (err) {
        console.warn('Could not load focused enquiry:', err);
    }

    const titleEl = document.getElementById('hblFocusTitle');
    if (titleEl) titleEl.textContent = title;

    const generateBtn = document.getElementById('hblFocusGenerateBtn');
    const viewDraftBtn = document.getElementById('hblFocusViewDraftBtn');
    if (generateBtn) {
        generateBtn.innerHTML = hasSaved
            ? '<i class="fas fa-file-contract"></i> Re-open HBL'
            : '<i class="fas fa-file-contract"></i> Generate HBL';
        generateBtn.onclick = () => openHblDocument(enquiryId);
    }
    if (viewDraftBtn) {
        viewDraftBtn.onclick = () => openHblDocument(enquiryId, true);
    }

    banner.classList.add('visible');
}

async function loadHblEntries() {
    const tbody = document.getElementById('hblTableBody');
    const countEl = document.getElementById('hblCount');

    try {
        const res = await fetch(`${CONFIG.API_URL}/api/enquiry/hbl-pending`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const entries = await res.json();

        countEl.textContent = entries.length;

        if (!entries.length) {
            tbody.innerHTML = `
                <tr><td colspan="9" class="empty-state">
                    <i class="fas fa-check-circle"></i>
                    <h3>No pending HBLs</h3>
                    <p>All HBL-required enquiries either have no SI submitted yet, or no enquiries require HBL.</p>
                    <p style="font-size: 13px; margin-top: 12px;">Use the search box above to open a saved HBL by shipment reference.</p>
                </td></tr>`;
            return;
        }

        tbody.innerHTML = '';
        entries.forEach(e => {
            const row = document.createElement('tr');
            row.dataset.enquiryId = String(e.id);
            if (focusedEnquiryId && String(e.id) === String(focusedEnquiryId)) {
                row.classList.add('hbl-row-focused');
            }

            const siDate = e.si_submitted
                ? new Date(e.si_submitted).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                : '—';

            const vesselVoyage = [e.vessel, e.voyage_no].filter(Boolean).join(' / ') || '—';
            const hasSaved = !!e.hbl_saved_at;
            const savedLabel = hasSaved
                ? `<span class="si-badge" style="background:#eff6ff;color:#2563eb;margin-top:4px;"><i class="fas fa-save"></i> Saved ${new Date(e.hbl_saved_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>`
                : '';

            row.innerHTML = `
                <td>
                    <a class="job-link" href="/enquiry?enquiry_id=${e.id}">${escHtml(e.enquiry_number)}</a>
                    ${savedLabel}
                </td>
                <td style="font-weight: 600;">${escHtml(e.client_name)}</td>
                <td>${escHtml(e.origin || '')} → ${escHtml(e.destination || '')}</td>
                <td><div class="detail-block">${escHtml(e.delivery_agent || '—')}</div></td>
                <td><div class="detail-block">${escHtml(e.notify_party_address || '—')}</div></td>
                <td><div class="detail-block">${escHtml(e.notify_party_2_address || '—')}</div></td>
                <td style="font-weight: 600;">${escHtml(vesselVoyage)}</td>
                <td><span class="si-badge"><i class="fas fa-check"></i> ${siDate}</span></td>
                <td>${renderHblActionButtons(e.id, hasSaved)}</td>
            `;
            tbody.appendChild(row);
        });
    } catch (err) {
        console.error('Error loading HBL entries:', err);
        tbody.innerHTML = `
            <tr><td colspan="9" class="empty-state">
                <i class="fas fa-exclamation-triangle" style="color: var(--danger);"></i>
                <h3>Failed to load</h3>
                <p>Could not fetch HBL entries. Please refresh the page.</p>
            </td></tr>`;
    }
}

function escHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}
