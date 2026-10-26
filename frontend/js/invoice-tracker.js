/**
 * Finance → Invoice Tracker dashboard
 */
(function () {
    const state = {
        data: null,
        clientFilter: '',
        loading: false,
    };

    function formatDate(val) {
        if (typeof formatEnquiryDateTime === 'function') {
            const s = formatEnquiryDateTime(val);
            return s && s.includes(' ') ? s.split(' ')[0] : s;
        }
        if (!val) return '—';
        const d = new Date(val);
        if (Number.isNaN(d.getTime())) return '—';
        const pad = (n) => String(n).padStart(2, '0');
        return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
    }

    function escape(s) {
        return typeof escapeHtml === 'function' ? escapeHtml(s) : String(s ?? '');
    }

    function daysPill(inv, soonDays) {
        const soon = soonDays != null ? soonDays : 3;
        if (invoicePaymentReceived(inv)) {
            return '<span class="inv-days-pill inv-days-pill--ok"><i class="fas fa-check"></i> Paid</span>';
        }
        const d = inv.days_remaining;
        if (d == null) return '<span class="cell-muted">—</span>';
        if (d < 0) {
            const n = inv.days_overdue || Math.abs(d);
            return `<span class="inv-days-pill inv-days-pill--overdue">${n}d overdue</span>`;
        }
        if (d === 0) {
            return '<span class="inv-days-pill inv-days-pill--soon">Due today</span>';
        }
        if (d <= soon) {
            return `<span class="inv-days-pill inv-days-pill--soon">${d}d left</span>`;
        }
        return `<span class="inv-days-pill inv-days-pill--ok">${d}d left</span>`;
    }

    function invoiceMeta(inv) {
        const parts = [];
        const it = String(inv.item_type || 'all').toLowerCase();
        if (it === 'additional') parts.push('Additional');
        if (inv.currency_mode === 'usd') parts.push('USD');
        if (inv.currency_mode === 'inr') parts.push('INR');
        return parts.length ? parts.join(' · ') : '';
    }

    function invoicePaymentReceived(inv) {
        return typeof isInvoicePaymentReceived === 'function'
            ? isInvoicePaymentReceived(inv)
            : !!(inv && (inv.payment_date || inv.is_paid));
    }

    function renderRow(inv, soonDays) {
        const meta = invoiceMeta(inv);
        const received = invoicePaymentReceived(inv);
        const amount = received && inv.received_amount != null
            ? `₹${Number(inv.received_amount).toLocaleString()}`
            : '—';
        const recordBtn = typeof renderFinanceDrawerActionBtn === 'function' && !received
            ? renderFinanceDrawerActionBtn('finance-received', inv.id, {
                icon: 'money-bill-wave',
                label: 'Record',
                title: 'Record client payment',
            })
            : (received && typeof renderFinanceDrawerActionBtn === 'function'
                ? renderFinanceDrawerActionBtn('finance-received', inv.id, {
                    primary: false,
                    icon: 'check-circle',
                    label: 'View',
                    title: 'View payment',
                })
                : '');

        return `
            <tr>
                <td>
                    <a class="cell-enquiry-id" href="#" onclick="openActionModal('view-sale', ${inv.enquiry_id || 0}); return false;">${escape(inv.enquiry_number || '—')}</a>
                    <div class="cell-enquiry-meta">${escape(inv.invoice_number || '')}${meta ? ` · ${escape(meta)}` : ''}</div>
                </td>
                <td class="cell-upper">${escape(inv.client_name || '—')}</td>
                <td class="cell-muted">${formatDate(inv.payment_due_date)}</td>
                <td>${daysPill(inv, soonDays)}</td>
                <td class="cell-muted">${amount}</td>
                <td>${recordBtn}</td>
            </tr>`;
    }

    function renderTableRows(items, emptyMsg, soonDays) {
        if (!items || !items.length) {
            return `<tr><td colspan="6"><div class="inv-tracker-empty">${emptyMsg}</div></td></tr>`;
        }
        return items.map((inv) => renderRow(inv, soonDays)).join('');
    }

    function renderDonut(collection, onTimePct) {
        const onTime = collection.on_time || 0;
        const late = collection.late || 0;
        const total = onTime + late;
        if (total <= 0) {
            return '<div class="inv-tracker-empty">No paid invoices with due dates yet.</div>';
        }
        const onAngle = (onTime / total) * 360;
        const size = 120;
        const cx = 60;
        const cy = 60;
        const r = 48;
        const pathOn = typeof buildAnalyticsPiePath === 'function'
            ? buildAnalyticsPiePath(cx, cy, r, 0, onAngle)
            : '';
        const pathLate = typeof buildAnalyticsPiePath === 'function'
            ? buildAnalyticsPiePath(cx, cy, r, onAngle, 360)
            : '';

        return `
            <div class="inv-collection-donut-wrap">
                <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="On-time vs late payments">
                    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#f1f5f9"/>
                    ${pathOn ? `<path d="${pathOn}" fill="#059669"/>` : ''}
                    ${pathLate && late > 0 ? `<path d="${pathLate}" fill="#f97316"/>` : ''}
                    <circle cx="${cx}" cy="${cy}" r="28" fill="#fff"/>
                    <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="14" font-weight="700" fill="#0f172a">${onTimePct != null ? onTimePct + '%' : '—'}</text>
                    <text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="9" fill="#64748b">on time</text>
                </svg>
                <div class="inv-collection-legend">
                    <div class="inv-collection-legend-item">
                        <span class="inv-collection-legend-dot" style="background:#059669"></span>
                        On time (${onTime})
                    </div>
                    <div class="inv-collection-legend-item">
                        <span class="inv-collection-legend-dot" style="background:#f97316"></span>
                        Late (${late})
                    </div>
                    <div class="inv-collection-legend-item">
                        <span class="inv-collection-legend-dot" style="background:#ef4444"></span>
                        Open overdue (${collection.overdue_unpaid || 0})
                    </div>
                    <div class="inv-collection-legend-item">
                        <span class="inv-collection-legend-dot" style="background:#94a3b8"></span>
                        Open not yet due (${collection.pending_not_due || 0})
                    </div>
                </div>
            </div>`;
    }

    function renderMonthBars(series) {
        const rows = (series || []).filter((m) => (m.on_time + m.late + m.unknown) > 0);
        if (!rows.length) {
            return '<div class="inv-tracker-empty">No paid invoices in the selected period.</div>';
        }
        const recent = rows.slice(-8);
        return `
            <div class="inv-month-bars">
                ${recent.map((m) => {
                    const total = m.on_time + m.late + m.unknown;
                    const onPct = total ? (m.on_time / total) * 100 : 0;
                    const latePct = total ? (m.late / total) * 100 : 0;
                    return `
                        <div class="inv-month-bar-row">
                            <span>${escape(m.label || m.month)}</span>
                            <div class="inv-month-bar-track" title="${m.on_time} on time, ${m.late} late">
                                <div class="inv-month-bar-on" style="width:${onPct}%"></div>
                                <div class="inv-month-bar-late" style="width:${latePct}%"></div>
                            </div>
                            <span class="cell-muted">${total}</span>
                        </div>`;
                }).join('')}
            </div>`;
    }

    function renderClientTable(clients) {
        const rows = clients || [];
        if (!rows.length) {
            return '<div class="inv-tracker-empty">No client breakdown yet.</div>';
        }
        return `
            <table class="inv-tracker-table inv-tracker-client-table">
                <thead>
                    <tr>
                        <th>Client</th>
                        <th class="num">On time</th>
                        <th class="num">Late</th>
                        <th class="num">Overdue</th>
                        <th class="num">Due ≤3d</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.slice(0, 15).map((c) => `
                        <tr>
                            <td class="cell-upper">${escape(c.client_name)}</td>
                            <td class="num">${c.on_time || 0}</td>
                            <td class="num">${c.late || 0}</td>
                            <td class="num">${c.overdue_open || 0}</td>
                            <td class="num">${c.due_soon_open || 0}</td>
                        </tr>`).join('')}
                </tbody>
            </table>`;
    }

    function renderDashboard(data) {
        const panel = document.getElementById('invoiceTrackerPanel');
        if (!panel || !data) return;

        const s = data.summary || {};
        const soonDays = data.due_soon_days || 3;
        window._invoiceTrackerSummary = {
            past_due_count: s.past_due_count || 0,
            due_within_3_days_count: s.due_within_days_count || 0,
            on_time_rate_pct: s.on_time_rate_pct,
        };
        updateDashboardTrackerTeasers(s);

        panel.innerHTML = `
            <div class="invoice-tracker-toolbar">
                <div class="invoice-tracker-filters">
                    <label for="invTrackerClientFilter">Client</label>
                    <select id="invTrackerClientFilter" aria-label="Filter by client">
                        <option value="">All clients</option>
                        ${(data.clients || []).map((c) =>
                            `<option value="${escape(c)}" ${state.clientFilter === c ? 'selected' : ''}>${escape(c)}</option>`
                        ).join('')}
                    </select>
                </div>
                <button type="button" class="btn btn-secondary" id="invTrackerRefreshBtn">
                    <i class="fas fa-rotate-right"></i> Refresh
                </button>
            </div>

            <div class="invoice-tracker-kpis">
                <div class="inv-tracker-kpi inv-tracker-kpi--danger">
                    <div class="inv-tracker-kpi-label">Past due</div>
                    <div class="inv-tracker-kpi-value">${s.past_due_count || 0}</div>
                    <div class="inv-tracker-kpi-sub">Unpaid after due date</div>
                </div>
                <div class="inv-tracker-kpi inv-tracker-kpi--warn">
                    <div class="inv-tracker-kpi-label">Due within ${soonDays} days</div>
                    <div class="inv-tracker-kpi-value">${s.due_within_days_count || 0}</div>
                    <div class="inv-tracker-kpi-sub">Includes due today</div>
                </div>
                <div class="inv-tracker-kpi">
                    <div class="inv-tracker-kpi-label">Open invoices</div>
                    <div class="inv-tracker-kpi-value">${s.open_count || 0}</div>
                    <div class="inv-tracker-kpi-sub">${s.pending_not_due_count || 0} not yet due</div>
                </div>
                <div class="inv-tracker-kpi">
                    <div class="inv-tracker-kpi-label">On-time rate</div>
                    <div class="inv-tracker-kpi-value">${s.on_time_rate_pct != null ? s.on_time_rate_pct + '%' : '—'}</div>
                    <div class="inv-tracker-kpi-sub">${s.on_time_paid_count || 0} of ${(s.on_time_paid_count || 0) + (s.late_paid_count || 0)} paid</div>
                </div>
            </div>

            <div class="invoice-tracker-grid">
                <div class="inv-tracker-card">
                    <div class="inv-tracker-card-head">
                        <h3><i class="fas fa-circle-exclamation" style="color:#dc2626"></i> Past due</h3>
                        <span class="count-badge">${(data.past_due || []).length}</span>
                    </div>
                    <div class="inv-tracker-card-body">
                        <table class="inv-tracker-table">
                            <thead>
                                <tr>
                                    <th>Job / Invoice</th>
                                    <th>Client</th>
                                    <th>Due</th>
                                    <th>Days</th>
                                    <th>Amount</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>${renderTableRows(data.past_due, 'No past-due invoices.', soonDays)}</tbody>
                        </table>
                    </div>
                </div>
                <div class="inv-tracker-card">
                    <div class="inv-tracker-card-head">
                        <h3><i class="fas fa-hourglass-half" style="color:#d97706"></i> Due within ${soonDays} days</h3>
                        <span class="count-badge">${(data.due_soon || []).length}</span>
                    </div>
                    <div class="inv-tracker-card-body">
                        <table class="inv-tracker-table">
                            <thead>
                                <tr>
                                    <th>Job / Invoice</th>
                                    <th>Client</th>
                                    <th>Due</th>
                                    <th>Days</th>
                                    <th>Amount</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>${renderTableRows(data.due_soon, `Nothing due in the next ${soonDays} days.`, soonDays)}</tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div class="inv-tracker-analytics">
                <div class="inv-tracker-card">
                    <div class="inv-tracker-card-head">
                        <h3>Collection performance</h3>
                    </div>
                    ${renderDonut(data.analytics?.collection || {}, s.on_time_rate_pct)}
                </div>
                <div class="inv-tracker-card">
                    <div class="inv-tracker-card-head">
                        <h3>On time vs late — by invoice month</h3>
                    </div>
                    ${renderMonthBars(data.analytics?.by_month)}
                </div>
            </div>

            <div class="inv-tracker-card">
                <div class="inv-tracker-card-head">
                    <h3>By client</h3>
                </div>
                <div class="inv-tracker-card-body">${renderClientTable(data.analytics?.by_client)}</div>
            </div>

            <p class="cell-muted" style="font-size:12px;margin:0;">As of ${escape(data.as_of || '')} (IST). On-time = payment received on or before due date.</p>
        `;

        document.getElementById('invTrackerRefreshBtn')?.addEventListener('click', () => loadInvoiceTracker(true));
        document.getElementById('invTrackerClientFilter')?.addEventListener('change', (e) => {
            state.clientFilter = e.target.value || '';
            loadInvoiceTracker(true);
        });
    }

    async function loadInvoiceTracker(force) {
        const panel = document.getElementById('invoiceTrackerPanel');
        if (!panel) return;
        if (state.loading && !force) return;

        state.loading = true;
        panel.style.display = 'block';
        panel.innerHTML = '<div class="inv-tracker-loading"><i class="fas fa-spinner fa-spin"></i> Loading invoice tracker…</div>';

        const params = new URLSearchParams({ due_soon_days: '3', months_back: '12' });
        if (state.clientFilter) params.set('client_name', state.clientFilter);

        try {
            const res = await fetch(`${CONFIG.API_URL}/api/invoice/tracker?${params}`);
            const text = await res.text();
            let data;
            try {
                data = text ? JSON.parse(text) : {};
            } catch (_) {
                throw new Error(res.ok ? 'Invalid response from server' : (text.slice(0, 120) || `HTTP ${res.status}`));
            }
            if (!res.ok) {
                throw new Error(data.detail || `HTTP ${res.status}`);
            }
            state.data = data;
            renderDashboard(data);
        } catch (err) {
            console.error('Invoice tracker:', err);
            panel.innerHTML = `<div class="inv-tracker-empty">Could not load tracker. ${escape(err.message || String(err))}</div>`;
        } finally {
            state.loading = false;
        }
    }

    function updateDashboardTrackerTeasers(summary) {
        const s = summary || {};
        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };
        set('dashTrackerPastDue', String(s.past_due_count ?? '—'));
        set('dashTrackerDueSoon', String(s.due_within_days_count ?? '—'));
        set(
            'dashTrackerOnTime',
            s.on_time_rate_pct != null ? `${s.on_time_rate_pct}%` : '—'
        );
    }

    async function prefetchInvoiceTrackerSummary() {
        try {
            const res = await fetch(`${CONFIG.API_URL}/api/invoice/tracker?due_soon_days=3&months_back=1`);
            const text = await res.text();
            if (!res.ok) return;
            const data = JSON.parse(text);
            window._invoiceTrackerSummary = {
                past_due_count: data.summary?.past_due_count || 0,
                due_within_3_days_count: data.summary?.due_within_days_count || 0,
                on_time_rate_pct: data.summary?.on_time_rate_pct,
            };
            updateDashboardTrackerTeasers(data.summary);
        } catch (_) { /* non-blocking */ }
    }

    window.loadInvoiceTracker = loadInvoiceTracker;
    window.prefetchInvoiceTrackerSummary = prefetchInvoiceTrackerSummary;
    window.updateDashboardTrackerTeasers = updateDashboardTrackerTeasers;
})();
