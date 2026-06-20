document.addEventListener('DOMContentLoaded', async function () {
    await loadHblEntries();
});

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
        window.location.href = `/hbl-document?enquiry_id=${data.id}`;
    } catch (err) {
        console.error('HBL lookup failed:', err);
        showModal('Error', 'Could not look up shipment. Please try again.', 'error');
    }
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

            const siDate = e.si_submitted
                ? new Date(e.si_submitted).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                : '—';

            const vesselVoyage = [e.vessel, e.voyage_no].filter(Boolean).join(' / ') || '—';
            const hasSaved = !!e.hbl_saved_at;
            const savedLabel = hasSaved
                ? `<span class="si-badge" style="background:#eff6ff;color:#2563eb;margin-top:4px;"><i class="fas fa-save"></i> Saved ${new Date(e.hbl_saved_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>`
                : '';
            const actionLabel = hasSaved ? 'Re-open' : 'Generate';

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
                <td>
                    <button class="btn btn-primary" style="padding: 6px 14px; font-size: 12px; white-space: nowrap;"
                        onclick="window.location.href='/hbl-document?enquiry_id=${e.id}'">
                        <i class="fas fa-file-contract"></i> ${actionLabel}
                    </button>
                </td>
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
