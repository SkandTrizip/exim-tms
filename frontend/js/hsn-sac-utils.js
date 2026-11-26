/**
 * HSN/SAC helpers for charge lines (matches invoice PDF defaults on the backend).
 */
(function (global) {
    function suggestHsnSacFromDescription(description) {
        const d = String(description || '').toLowerCase();
        if (d.includes('air freight')) return '996531';
        if (d.includes('ocean freight') || d.includes('freight')) return '996521';
        if (d.includes('bl fee') || d.includes('bl charge')) return '996799';
        if (d.includes('origin thc') || d.includes('origin terminal')) return '996711';
        if (d.includes('seal charge') || d.includes('seal fee')) return '996799';
        if (d.includes('facilitation')) return '996711';
        return '996511';
    }

    function hsnSacFromConfigDefaults(description) {
        const needle = String(description || '').trim().toLowerCase();
        if (!needle) return null;
        const lists = [
            ...(global.CONFIG?.defaultCharges || []),
            ...(global.CONFIG?.airDefaultCharges || []),
        ];
        const match = lists.find(
            (row) => String(row.desc || '').trim().toLowerCase() === needle
        );
        return match?.hsn_sac ? String(match.hsn_sac).trim() : null;
    }

    function resolveHsnSac(description, existing) {
        const stored = existing != null ? String(existing).trim() : '';
        if (stored) return stored;
        return hsnSacFromConfigDefaults(description) || suggestHsnSacFromDescription(description);
    }

    global.suggestHsnSacFromDescription = suggestHsnSacFromDescription;
    global.resolveHsnSac = resolveHsnSac;
})(typeof window !== 'undefined' ? window : globalThis);
