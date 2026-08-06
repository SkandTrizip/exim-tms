/**
 * Trade Globe page — interactive origins / destinations / routes.
 */
(function () {
    const GLOBE_SCRIPT = 'https://unpkg.com/globe.gl@2.41.4/dist/globe.gl.min.js';
    const EARTH_IMG = 'https://unpkg.com/three-globe@2.31.1/example/img/earth-blue-marble.jpg';
    const BUMP_IMG = 'https://unpkg.com/three-globe@2.31.1/example/img/earth-topology.png';

    const state = {
        data: null,
        loading: false,
        scriptReady: false,
        fullGlobe: null,
        mounted: false,
        resizeObserver: null,
        layers: { origin: true, destination: true, routes: true },
    };

    function apiBase() {
        return (typeof CONFIG !== 'undefined' && CONFIG.API_URL) ? CONFIG.API_URL : '';
    }

    function loadGlobeScript() {
        if (state.scriptReady || typeof Globe === 'function') {
            state.scriptReady = true;
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[src="${GLOBE_SCRIPT}"]`);
            if (existing) {
                existing.addEventListener('load', () => {
                    state.scriptReady = true;
                    resolve();
                });
                existing.addEventListener('error', reject);
                if (typeof Globe === 'function') {
                    state.scriptReady = true;
                    resolve();
                }
                return;
            }
            const script = document.createElement('script');
            script.src = GLOBE_SCRIPT;
            script.async = true;
            script.onload = () => {
                state.scriptReady = true;
                resolve();
            };
            script.onerror = () => reject(new Error('Failed to load globe.gl'));
            document.head.appendChild(script);
        });
    }

    function setSummaryText(summary) {
        const el = document.getElementById('tradeGlobeSummary');
        if (!el || !summary) return;
        el.textContent =
            `${summary.resolved_trips || 0} mapped trips · ` +
            `${summary.origin_ports || 0} origins · ` +
            `${summary.destination_ports || 0} destinations · ` +
            `${summary.routes || 0} routes`;
    }

    function escape(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function renderAsideList(ulId, items, formatter) {
        const ul = document.getElementById(ulId);
        if (!ul) return;
        const list = (items || []).slice(0, 10);
        if (!list.length) {
            ul.innerHTML = '<li class="is-empty">No data</li>';
            return;
        }
        ul.innerHTML = list.map((item) => `<li>${formatter(item)}</li>`).join('');
    }

    function fillAside(data) {
        renderAsideList('tradeGlobeTopOrigins', data.origins, (p) =>
            `<strong>${escape(p.name)}</strong><span>${p.count} trip${p.count === 1 ? '' : 's'}</span>`
        );
        renderAsideList('tradeGlobeTopDests', data.destinations, (p) =>
            `<strong>${escape(p.name)}</strong><span>${p.count} trip${p.count === 1 ? '' : 's'}</span>`
        );
        renderAsideList('tradeGlobeTopRoutes', data.routes, (r) =>
            `<strong>${escape(r.origin_name)} → ${escape(r.destination_name)}</strong>` +
            `<span>${r.count} trip${r.count === 1 ? '' : 's'}</span>`
        );
    }

    function activePoints(data) {
        const points = [];
        if (state.layers.origin) {
            (data.origins || []).forEach((p) => points.push({ ...p, color: '#38bdf8', altitude: 0.012 }));
        }
        if (state.layers.destination) {
            (data.destinations || []).forEach((p) => points.push({ ...p, color: '#f59e0b', altitude: 0.012 }));
        }
        return points;
    }

    function activeArcs(data) {
        if (!state.layers.routes) return [];
        return (data.routes || []).map((r) => ({
            ...r,
            startLat: r.origin_lat,
            startLng: r.origin_lng,
            endLat: r.destination_lat,
            endLng: r.destination_lng,
        }));
    }

    function destroyGlobe() {
        const full = document.getElementById('tradeGlobeFull');
        if (state.fullGlobe) {
            try {
                state.fullGlobe._destructor && state.fullGlobe._destructor();
            } catch (_) { /* ignore */ }
            state.fullGlobe = null;
        }
        if (full) full.innerHTML = '';
        state.mounted = false;
    }

    function createGlobe(container, data, width, height) {
        if (!container || typeof Globe !== 'function') return null;
        container.innerHTML = '';

        const w = Math.max(320, Math.floor(width || container.clientWidth || 800));
        const h = Math.max(320, Math.floor(height || container.clientHeight || 560));
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        const globe = Globe()(container)
            .width(w)
            .height(h)
            .backgroundColor('rgba(0,0,0,0)')
            .globeImageUrl(EARTH_IMG)
            .bumpImageUrl(BUMP_IMG)
            .showAtmosphere(true)
            .atmosphereColor('#7dd3fc')
            .atmosphereAltitude(0.18)
            .pointsData(activePoints(data))
            .pointLat('lat')
            .pointLng('lng')
            .pointAltitude('altitude')
            .pointRadius((d) => Math.min(1.8, 0.35 + Math.sqrt(d.count || 1) * 0.25))
            .pointColor('color')
            .pointsMerge(false)
            .pointLabel((d) =>
                `<div class="globe-tip"><strong>${escape(d.name)}</strong><br>${d.kind === 'origin' ? 'Origin' : 'Destination'} · ${d.count} trip${d.count === 1 ? '' : 's'}</div>`
            )
            .arcsData(activeArcs(data))
            .arcStartLat('startLat')
            .arcStartLng('startLng')
            .arcEndLat('endLat')
            .arcEndLng('endLng')
            .arcAltitude((d) => Math.min(0.45, 0.08 + (d.count || 1) * 0.01))
            .arcStroke((d) => Math.min(1.6, 0.4 + Math.sqrt(d.count || 1) * 0.2))
            .arcColor(() => ['rgba(14,165,233,0.75)', 'rgba(245,158,11,0.55)'])
            .arcDashLength(0.35)
            .arcDashGap(0.2)
            .arcDashAnimateTime(reduceMotion ? 0 : 2800)
            .arcLabel((d) =>
                `<div class="globe-tip"><strong>${escape(d.origin_name)} → ${escape(d.destination_name)}</strong><br>${d.count} trip${d.count === 1 ? '' : 's'}</div>`
            );

        globe.controls().autoRotate = !reduceMotion;
        globe.controls().autoRotateSpeed = 0.35;
        globe.controls().enableZoom = true;
        globe.controls().enablePan = false;
        globe.pointOfView({ lat: 22, lng: 55, altitude: 2.05 }, 0);
        return globe;
    }

    function measureCanvas() {
        const full = document.getElementById('tradeGlobeFull');
        if (!full) return { width: 800, height: 560 };
        const rect = full.getBoundingClientRect();
        return {
            width: Math.max(320, Math.floor(rect.width)),
            height: Math.max(320, Math.floor(rect.height)),
        };
    }

    function sizeGlobe() {
        if (!state.fullGlobe || !state.mounted) return;
        const { width, height } = measureCanvas();
        state.fullGlobe.width(width);
        state.fullGlobe.height(height);
    }

    function waitForLayout() {
        return new Promise((resolve) => {
            requestAnimationFrame(() => {
                requestAnimationFrame(resolve);
            });
        });
    }

    function refreshGlobeLayers() {
        if (!state.data || !state.fullGlobe) return;
        state.fullGlobe.pointsData(activePoints(state.data));
        state.fullGlobe.arcsData(activeArcs(state.data));
    }

    async function ensureData() {
        if (state.data) return state.data;
        if (state.loading) {
            await new Promise((r) => setTimeout(r, 200));
            return ensureData();
        }
        state.loading = true;
        try {
            const res = await fetch(`${apiBase()}/api/dashboard/shipment-globe`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            state.data = await res.json();
            setSummaryText(state.data.summary || {});
            fillAside(state.data);
            return state.data;
        } finally {
            state.loading = false;
        }
    }

    function bindLayers() {
        const map = [
            ['tradeGlobeLayerOrigin', 'origin'],
            ['tradeGlobeLayerDest', 'destination'],
            ['tradeGlobeLayerRoutes', 'routes'],
        ];
        map.forEach(([id, key]) => {
            const el = document.getElementById(id);
            if (!el || el.dataset.bound) return;
            el.dataset.bound = '1';
            el.checked = !!state.layers[key];
            el.addEventListener('change', () => {
                state.layers[key] = !!el.checked;
                refreshGlobeLayers();
            });
        });
    }

    function onResize() {
        sizeGlobe();
    }

    window.mountTradeGlobeView = async function mountTradeGlobeView() {
        bindLayers();
        const full = document.getElementById('tradeGlobeFull');
        if (!full) return;
        try {
            await loadGlobeScript();
            const data = await ensureData();
            destroyGlobe();
            await waitForLayout();
            const { width, height } = measureCanvas();
            state.fullGlobe = createGlobe(full, data, width, height);
            state.mounted = true;
            fillAside(data);
            setSummaryText(data.summary || {});
            await waitForLayout();
            sizeGlobe();

            if (!state.resizeObserver && typeof ResizeObserver === 'function') {
                state.resizeObserver = new ResizeObserver(() => sizeGlobe());
                state.resizeObserver.observe(full);
            }
        } catch (err) {
            console.error('Trade globe failed:', err);
            const summary = document.getElementById('tradeGlobeSummary');
            if (summary) summary.textContent = 'Could not load trade globe.';
        }
    };

    window.unmountTradeGlobeView = function unmountTradeGlobeView() {
        if (state.resizeObserver) {
            try {
                state.resizeObserver.disconnect();
            } catch (_) { /* ignore */ }
            state.resizeObserver = null;
        }
        destroyGlobe();
    };

    window.addEventListener('resize', onResize);
})();
