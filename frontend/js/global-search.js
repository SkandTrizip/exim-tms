(function () {
    const MIN_CHARS = 3;
    const DEBOUNCE_MS = 350;
    const FILTERS = [
        { id: 'all', label: 'All' },
        { id: 'enquiry', label: 'Enquiry' },
        { id: 'client', label: 'Client' },
        { id: 'shipping_line', label: 'Shipping line' },
        { id: 'mbl', label: 'mBL / SI' },
        { id: 'invoice', label: 'Invoice' },
        { id: 'document', label: 'Documents' }
    ];

    let debounceTimer = null;
    let activeScope = 'all';
    let lastQuery = '';
    let requestSeq = 0;

    function escapeHtml(value) {
        if (value == null || value === '') return '';
        const el = document.createElement('div');
        el.textContent = String(value);
        return el.innerHTML;
    }

    function isIndexApp() {
        return !!document.querySelector('.app-shell');
    }

    function shouldShowGlobalSearch() {
        const hash = (window.location.hash || '').toLowerCase();
        return !!hash && hash !== '#dashboard' && hash !== '#globe';
    }

    function updateGlobalSearchVisibility() {
        const topbar = document.querySelector('.global-topbar');
        if (!topbar) return;
        topbar.classList.toggle('is-hidden', !shouldShowGlobalSearch());
    }

    function buildSearchMarkup() {
        const filters = FILTERS.map((filter) => (
            `<button type="button" class="global-search-filter${filter.id === 'all' ? ' active' : ''}" data-scope="${filter.id}">${filter.label}</button>`
        )).join('');

        return `
            <div class="global-search-wrap" id="globalSearchWrap">
                <div class="global-search-input-wrap">
                    <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
                    <input id="globalSearchInput" type="search" placeholder="Search enquiry, client, shipping line, mBL, invoice…" autocomplete="off" aria-label="Global shipment search" />
                </div>
                <div class="global-search-filters" id="globalSearchFilters" role="group" aria-label="Search filters" hidden>
                    ${filters}
                </div>
                <div class="global-search-results" id="globalSearchResults" role="listbox" aria-label="Search results"></div>
            </div>`;
    }

    function ensureSearchShell() {
        if (document.getElementById('globalSearchWrap')) return;

        if (isIndexApp()) {
            const appMain = document.querySelector('.app-main');
            if (!appMain) return;
            const topbar = document.createElement('header');
            topbar.className = 'global-topbar is-hidden';
            topbar.setAttribute('aria-label', 'Global search');
            topbar.innerHTML = buildSearchMarkup();
            const mainPanel = appMain.querySelector('.main-panel');
            if (mainPanel) appMain.insertBefore(topbar, mainPanel);
            else appMain.prepend(topbar);
            return;
        }

        const floating = document.createElement('div');
        floating.className = 'global-search-floating';
        floating.innerHTML = buildSearchMarkup();
        document.body.appendChild(floating);
    }

    function getWrap() {
        return document.getElementById('globalSearchWrap');
    }

    function getResultsEl() {
        return document.getElementById('globalSearchResults');
    }

    function setFiltersVisible(visible) {
        const filters = document.getElementById('globalSearchFilters');
        if (!filters) return;
        if (visible) {
            filters.removeAttribute('hidden');
            getWrap()?.classList.add('is-active');
        } else {
            filters.setAttribute('hidden', '');
            getWrap()?.classList.remove('is-active');
        }
    }

    function closeResults() {
        const results = getResultsEl();
        if (results) {
            results.classList.remove('open');
            results.innerHTML = '';
        }
    }

    function openResults() {
        const results = getResultsEl();
        if (results) results.classList.add('open');
    }

    function navigateToShipment(enquiryId) {
        if (!enquiryId) return;
        closeResults();
        const input = document.getElementById('globalSearchInput');
        if (input) {
            input.blur();
            input.value = '';
        }
        setFiltersVisible(false);

        if (isIndexApp()) {
            window.location.hash = `#shipment/${enquiryId}`;
            if (typeof window.showShipmentDetailView === 'function') {
                window.showShipmentDetailView(enquiryId);
            }
            return;
        }

        window.location.href = `/#shipment/${enquiryId}`;
    }

    function renderResults(payload, query) {
        const results = getResultsEl();
        if (!results) return;

        if (!payload || !payload.results || payload.results.length === 0) {
            results.innerHTML = `<div class="global-search-empty">No shipments found for “${escapeHtml(query)}”.</div>`;
            openResults();
            return;
        }

        results.innerHTML = payload.results.map((item) => {
            const route = [item.origin, item.destination].filter(Boolean).join(' → ') || '—';
            const shipping = item.shipping_line ? ` · ${item.shipping_line}` : '';
            const mbl = item.master_number ? ` · mBL ${item.master_number}` : '';
            const matches = (item.match_labels || []).join(', ');
            return `
                <button type="button" class="global-search-result" data-enquiry-id="${item.enquiry_id}" role="option">
                    <div class="global-search-result-title">${escapeHtml(item.enquiry_number)}</div>
                    <div class="global-search-result-sub">${escapeHtml(item.client_name || '—')}${escapeHtml(shipping)}</div>
                    <div class="global-search-result-meta">${escapeHtml(route)}${escapeHtml(mbl)}${matches ? ` · ${escapeHtml(matches)}` : ''}</div>
                </button>`;
        }).join('');
        openResults();
    }

    async function runSearch(query) {
        const trimmed = (query || '').trim();
        lastQuery = trimmed;
        const results = getResultsEl();
        if (!results) return;

        if (trimmed.length < MIN_CHARS) {
            closeResults();
            return;
        }

        const seq = ++requestSeq;
        results.innerHTML = '<div class="global-search-loading"><i class="fas fa-spinner fa-spin"></i> Searching…</div>';
        openResults();

        const params = new URLSearchParams({ q: trimmed, limit: '25' });
        if (activeScope && activeScope !== 'all') {
            params.append('scope', activeScope);
        }

        try {
            const apiBase = (window.CONFIG && CONFIG.API_URL) ? CONFIG.API_URL : '';
            const response = await fetch(`${apiBase}/api/search?${params.toString()}`);
            if (seq !== requestSeq) return;
            if (!response.ok) {
                results.innerHTML = '<div class="global-search-empty">Search failed. Try again.</div>';
                return;
            }
            const payload = await response.json();
            renderResults(payload, trimmed);
        } catch (err) {
            if (seq !== requestSeq) return;
            console.error('Global search failed:', err);
            results.innerHTML = '<div class="global-search-empty">Could not reach the server.</div>';
        }
    }

    function scheduleSearch(query) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => runSearch(query), DEBOUNCE_MS);
    }

    function bindEvents() {
        const input = document.getElementById('globalSearchInput');
        const filters = document.getElementById('globalSearchFilters');
        const results = getResultsEl();

        if (input && !input.dataset.bound) {
            input.dataset.bound = '1';
            input.addEventListener('input', () => {
                const value = input.value || '';
                setFiltersVisible(document.activeElement === input || value.trim().length > 0);
                scheduleSearch(value);
            });
            input.addEventListener('focus', () => {
                setFiltersVisible(true);
                if ((input.value || '').trim().length >= MIN_CHARS) runSearch(input.value);
            });
            input.addEventListener('blur', () => {
                window.setTimeout(() => {
                    if (document.activeElement?.closest('#globalSearchWrap')) return;
                    if (!(input.value || '').trim()) setFiltersVisible(false);
                }, 120);
            });
            input.addEventListener('keydown', (ev) => {
                if (ev.key === 'Escape') {
                    closeResults();
                    input.blur();
                    input.value = '';
                    setFiltersVisible(false);
                }
            });
        }

        if (filters && !filters.dataset.bound) {
            filters.dataset.bound = '1';
            filters.addEventListener('click', (ev) => {
                const btn = ev.target.closest('.global-search-filter');
                if (!btn) return;
                activeScope = btn.dataset.scope || 'all';
                filters.querySelectorAll('.global-search-filter').forEach((el) => {
                    el.classList.toggle('active', el === btn);
                });
                if (lastQuery.length >= MIN_CHARS) runSearch(lastQuery);
            });
        }

        if (results && !results.dataset.bound) {
            results.dataset.bound = '1';
            results.addEventListener('mousedown', (ev) => {
                ev.preventDefault();
            });
            results.addEventListener('click', (ev) => {
                const row = ev.target.closest('.global-search-result');
                if (!row) return;
                navigateToShipment(parseInt(row.dataset.enquiryId, 10));
            });
        }

        if (!document.body.dataset.globalSearchDismissBound) {
            document.body.dataset.globalSearchDismissBound = '1';
            document.addEventListener('mousedown', (ev) => {
                const wrap = getWrap();
                if (!wrap || wrap.contains(ev.target)) return;
                closeResults();
            });
        }

        if (!window.__globalSearchHashBound) {
            window.__globalSearchHashBound = true;
            window.addEventListener('hashchange', updateGlobalSearchVisibility);
        }
    }

    function isEmbeddedDrawerPage() {
        return (
            new URLSearchParams(window.location.search).get('embedded') === '1' ||
            document.documentElement.classList.contains('embedded-mode') ||
            document.body.classList.contains('embedded-mode')
        );
    }

    function initGlobalSearch() {
        if (window.location.pathname.includes('/login')) return;
        if (isEmbeddedDrawerPage()) {
            document.querySelector('.global-search-floating')?.remove();
            return;
        }
        ensureSearchShell();
        bindEvents();
        updateGlobalSearchVisibility();
    }

    window.initGlobalSearch = initGlobalSearch;
    window.updateGlobalSearchVisibility = updateGlobalSearchVisibility;
    window.navigateToShipmentDetail = navigateToShipment;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initGlobalSearch);
    } else {
        initGlobalSearch();
    }
})();
