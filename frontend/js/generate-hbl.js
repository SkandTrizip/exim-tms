document.addEventListener('DOMContentLoaded', async function () {
    await loadHblEntries();
});

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

            row.innerHTML = `
                <td><a class="job-link" href="/enquiry?enquiry_id=${e.id}">${escHtml(e.enquiry_number)}</a></td>
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
                        <i class="fas fa-file-contract"></i> Generate
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
