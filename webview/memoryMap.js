(function () {
    const MIN_SECTION_HEIGHT = 40;
    const REGION_BAR_HEIGHT = 700;
    const SYM_COLOR_COUNT = 12;

    // 12-color colorblind-safe palette (Paul Tol qualitative scheme)
    const SECTION_COLORS = [
        '#4477AA', '#66CCEE', '#228833', '#CCBB44', '#EE6677', '#AA3377',
        '#BBBBBB', '#EE8866', '#44BB99', '#99DDFF', '#EEDD88', '#FFAABB',
    ];

    let layoutData = null;

    // Index for O(1) highlight lookups: "section\0symbol" -> element
    var symbolIndex = {};
    // Index for section blocks: "sectionName" -> [elements]
    var sectionIndex = {};
    // Currently highlighted element
    var currentHighlight = null;

    function formatHex(value, width) {
        width = width || 8;
        return '0x' + value.toString(16).toUpperCase().padStart(width, '0');
    }

    function formatSize(bytes) {
        if (bytes >= 1024 * 1024) { return (bytes / (1024 * 1024)).toFixed(1) + ' MB'; }
        if (bytes >= 1024) { return (bytes / 1024).toFixed(1) + ' KB'; }
        return bytes + ' B';
    }

    function usagePct(used, total) {
        if (total === 0) { return 0; }
        return (used / total) * 100;
    }

    // Lookup table from symbol data-key to symbol data object (for tooltip on hover)
    var symbolDataMap = {};
    // Lookup table from section data-section to section data object (for tooltip on hover)
    var sectionDataMap = {};

    function render(layout) {
        var app = document.getElementById('app');
        if (!app) { return; }

        // Reset indexes
        symbolIndex = {};
        sectionIndex = {};
        symbolDataMap = {};
        sectionDataMap = {};
        currentHighlight = null;

        if (!layout || !layout.regions || layout.regions.length === 0) {
            app.innerHTML = '<div class="no-data">No memory layout data available.<br>Open a .ld or .map file to visualize memory.</div>';
            return;
        }

        // Build DOM in a document fragment to avoid repeated reflows
        var fragment = document.createDocumentFragment();

        var heading = document.createElement('h1');
        heading.textContent = 'Memory Map';
        fragment.appendChild(heading);

        var container = document.createElement('div');
        container.className = 'memory-container';

        var globalSectionIndex = 0;
        for (var r = 0; r < layout.regions.length; r++) {
            var region = layout.regions[r];
            if (region.length === 0) { continue; }

            var col = document.createElement('div');
            col.className = 'region-column';

            var used = region.used || region.sections.reduce(function (s, sec) { return s + sec.size; }, 0);
            var pct = usagePct(used, region.length);

            var header = document.createElement('div');
            header.className = 'region-header';
            header.textContent = region.name;
            col.appendChild(header);

            var info = document.createElement('div');
            info.className = 'region-info';
            info.textContent = formatHex(region.origin) + ' | ' + formatSize(region.length) + ' (' + pct.toFixed(1) + '% used)';
            col.appendChild(info);

            var bar = document.createElement('div');
            bar.className = 'region-bar';
            bar.style.minHeight = REGION_BAR_HEIGHT + 'px';

            // Sort sections by address
            var sections = region.sections.slice();
            sections.sort(function (a, b) { return a.address - b.address; });

            var totalForScaling = region.length;
            var totalSectionSize = sections.reduce(function (s, sec) { return s + sec.size; }, 0);
            var freeSize = region.length - totalSectionSize;

            // If all sections have size 0 (e.g. linker script), distribute evenly
            var allZeroSize = totalSectionSize === 0 && sections.length > 0;

            // Render section blocks
            for (var i = 0; i < sections.length; i++) {
                var sec = sections[i];
                var heightPx = allZeroSize
                    ? Math.max(MIN_SECTION_HEIGHT, REGION_BAR_HEIGHT / sections.length)
                    : Math.max(MIN_SECTION_HEIGHT, (sec.size / totalForScaling) * REGION_BAR_HEIGHT);

                // Filter symbols with size > 0
                var symbols = (sec.symbols || []).filter(function (s) { return s.size > 0; });

                var block = document.createElement('div');
                block.className = 'section-block';
                var sectionColor = SECTION_COLORS[globalSectionIndex % SECTION_COLORS.length];
                globalSectionIndex++;
                block.style.background = sectionColor;
                if (symbols.length > 0) {
                    block.className += ' has-symbols';
                    block.style.minHeight = heightPx + 'px';
                } else {
                    block.style.height = heightPx + 'px';
                }
                block.setAttribute('data-section', sec.name);
                block.setAttribute('data-source-line', sec.sourceLine !== undefined ? String(sec.sourceLine) : '');

                // Store section data for tooltip delegation
                sectionDataMap[sec.name] = sec;
                if (!sectionIndex[sec.name]) { sectionIndex[sec.name] = []; }
                sectionIndex[sec.name].push(block);

                var label = document.createElement('span');
                label.className = 'section-label';
                label.textContent = sec.size > 0
                    ? sec.name + ' (' + formatSize(sec.size) + ')'
                    : sec.name;
                block.appendChild(label);

                // Render symbol sub-blocks as a justified wrapping grid
                if (symbols.length > 0) {
                    var symGrid = document.createElement('div');
                    symGrid.className = 'symbol-grid';

                    var totalSymSize = symbols.reduce(function (s, sym) { return s + sym.size; }, 0);
                    var itemsPerRow = Math.min(symbols.length, Math.max(4, Math.ceil(Math.sqrt(symbols.length * 1.5))));
                    var avgSize = totalSymSize / symbols.length;
                    var rowBudget = avgSize * itemsPerRow;

                    for (var si = 0; si < symbols.length; si++) {
                        var sym = symbols[si];
                        var basisPct = (sym.size / rowBudget) * 100;
                        basisPct = Math.max(3, Math.min(100, basisPct));

                        var symBlock = document.createElement('div');
                        symBlock.className = 'symbol-block sym-color-' + (si % SYM_COLOR_COUNT);
                        symBlock.style.flexBasis = basisPct + '%';
                        symBlock.style.flexGrow = String(sym.size);
                        symBlock.setAttribute('data-symbol', sym.name);
                        symBlock.setAttribute('data-section', sec.name);
                        symBlock.setAttribute('data-address', sym.address !== undefined ? String(sym.address) : '');
                        symBlock.setAttribute('data-source-line', sym.sourceLine !== undefined ? String(sym.sourceLine) : '');

                        // Index for O(1) highlight lookup — use address as primary key (unique),
                        // fall back to section+name for symbols without addresses
                        var symKey = sym.address !== undefined
                            ? sec.name + '\0' + String(sym.address)
                            : sec.name + '\0' + sym.name;
                        symbolIndex[symKey] = symBlock;
                        // Store symbol data for tooltip delegation
                        symbolDataMap[symKey] = sym;

                        symGrid.appendChild(symBlock);
                    }

                    block.appendChild(symGrid);
                }

                bar.appendChild(block);
            }

            // Free space block
            if (freeSize > 0 && !allZeroSize) {
                var freeHeight = Math.max(MIN_SECTION_HEIGHT, (freeSize / totalForScaling) * REGION_BAR_HEIGHT);
                var freeBlock = document.createElement('div');
                freeBlock.className = 'section-block free-space';
                freeBlock.style.height = freeHeight + 'px';
                var freeLabel = document.createElement('span');
                freeLabel.className = 'section-label';
                freeLabel.textContent = 'Free (' + formatSize(freeSize) + ')';
                freeBlock.appendChild(freeLabel);
                bar.appendChild(freeBlock);
            }

            col.appendChild(bar);

            // Usage bar
            var usageBarContainer = document.createElement('div');
            usageBarContainer.className = 'usage-bar-container';
            var usageBarFill = document.createElement('div');
            var usageClass = pct < 50 ? 'usage-low' : pct < 80 ? 'usage-medium' : 'usage-high';
            usageBarFill.className = 'usage-bar-fill ' + usageClass;
            usageBarFill.style.width = pct + '%';
            usageBarContainer.appendChild(usageBarFill);
            col.appendChild(usageBarContainer);

            container.appendChild(col);
        }

        fragment.appendChild(container);

        // Single DOM write
        app.innerHTML = '';
        app.appendChild(fragment);

        // Attach delegated event listeners on the container (once, not per-element)
        container.addEventListener('click', function (e) {
            var symBlock = e.target.closest('.symbol-block');
            if (symBlock) {
                e.stopPropagation();
                window.mapViewIPC.postMessage({
                    type: 'selectSymbol',
                    symbol: symBlock.getAttribute('data-symbol'),
                    section: symBlock.getAttribute('data-section'),
                    address: symBlock.getAttribute('data-address') ? Number(symBlock.getAttribute('data-address')) : undefined,
                    sourceLine: symBlock.getAttribute('data-source-line') ? Number(symBlock.getAttribute('data-source-line')) : undefined,
                });
                return;
            }
            var secBlock = e.target.closest('.section-block');
            if (secBlock && !secBlock.classList.contains('free-space')) {
                window.mapViewIPC.postMessage({
                    type: 'selectSection',
                    section: secBlock.getAttribute('data-section'),
                    sourceLine: secBlock.getAttribute('data-source-line') ? Number(secBlock.getAttribute('data-source-line')) : undefined,
                });
            }
        });

        container.addEventListener('mouseover', function (e) {
            var symBlock = e.target.closest('.symbol-block');
            if (symBlock) {
                var addr = symBlock.getAttribute('data-address');
                var section = symBlock.getAttribute('data-section');
                var key = addr
                    ? section + '\0' + addr
                    : section + '\0' + symBlock.getAttribute('data-symbol');
                var sym = symbolDataMap[key];
                if (sym) { showSymbolTooltip(e, sym); }
                return;
            }
            var secBlock = e.target.closest('.section-block');
            if (secBlock && !secBlock.classList.contains('free-space')) {
                var sec = sectionDataMap[secBlock.getAttribute('data-section')];
                if (sec) { showTooltip(e, sec); }
            }
        });

        container.addEventListener('mouseout', function (e) {
            var from = e.target.closest('.symbol-block') || e.target.closest('.section-block');
            if (!from) { return; }
            var to = e.relatedTarget ? (e.relatedTarget.closest ? e.relatedTarget.closest('.symbol-block') || e.relatedTarget.closest('.section-block') : null) : null;
            if (from !== to) {
                hideTooltip();
            }
        });

        container.addEventListener('mousemove', function (e) {
            if (e.target.closest('.symbol-block') || e.target.closest('.section-block')) {
                moveTooltip(e);
            }
        });
    }

    function showTooltip(e, section) {
        var tooltip = document.getElementById('tooltip');
        if (!tooltip) { return; }
        tooltip.innerHTML =
            '<div class="tooltip-title">' + escapeHtml(section.name) + '</div>' +
            'Address: ' + formatHex(section.address) + '<br>' +
            'Size: ' + formatSize(section.size) + '<br>' +
            (section.region ? 'Region: ' + escapeHtml(section.region) + '<br>' : '') +
            'Symbols: ' + (section.symbols ? section.symbols.length : 0);
        tooltip.classList.add('visible');
        moveTooltip(e);
    }

    function showSymbolTooltip(e, symbol) {
        e.stopPropagation();
        var tooltip = document.getElementById('tooltip');
        if (!tooltip) { return; }
        tooltip.innerHTML =
            '<div class="tooltip-title">' + escapeHtml(symbol.name) + '</div>' +
            'Address: ' + formatHex(symbol.address) + '<br>' +
            'Size: ' + formatSize(symbol.size) +
            (symbol.sourceFile ? '<br>Source: ' + escapeHtml(symbol.sourceFile) : '');
        tooltip.classList.add('visible');
        moveTooltip(e);
    }

    function moveTooltip(e) {
        var tooltip = document.getElementById('tooltip');
        if (!tooltip) { return; }
        var gap = 12;
        var x = e.clientX + gap;
        var y = e.clientY + gap;
        var tw = tooltip.offsetWidth;
        var th = tooltip.offsetHeight;
        var vw = document.documentElement.clientWidth;
        var vh = document.documentElement.clientHeight;
        if (x + tw > vw) { x = e.clientX - tw - gap; }
        if (y + th > vh) { y = e.clientY - th - gap; }
        if (x < 0) { x = 0; }
        if (y < 0) { y = 0; }
        tooltip.style.left = x + 'px';
        tooltip.style.top = y + 'px';
    }

    function hideTooltip() {
        var tooltip = document.getElementById('tooltip');
        if (tooltip) { tooltip.classList.remove('visible'); }
    }

    function clearHighlights() {
        if (currentHighlight) {
            if (Array.isArray(currentHighlight)) {
                for (var i = 0; i < currentHighlight.length; i++) {
                    currentHighlight[i].classList.remove('highlighted');
                }
            } else {
                currentHighlight.classList.remove('highlighted');
            }
            currentHighlight = null;
        }
    }

    function highlightSection(sectionName) {
        clearHighlights();
        if (sectionName && sectionIndex[sectionName]) {
            var els = sectionIndex[sectionName];
            for (var i = 0; i < els.length; i++) {
                els[i].classList.add('highlighted');
                els[i].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
            currentHighlight = els;
        }
    }

    function highlightSymbol(symbolName, sectionName, address) {
        clearHighlights();
        if (!symbolName) { return; }
        // Try address-based key first (unique), fall back to name-based
        var el;
        if (address !== undefined && sectionName) {
            el = symbolIndex[sectionName + '\0' + String(address)];
        }
        if (!el && sectionName) {
            el = symbolIndex[sectionName + '\0' + symbolName];
        }
        if (el) {
            el.classList.add('highlighted');
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            currentHighlight = el;
        }
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Expose highlight functions for highlight-bridge.js
    window._mapHighlightSection = highlightSection;
    window._mapHighlightSymbol = highlightSymbol;

    // Message handling from extension / main process
    window.mapViewIPC.onMessage(function (msg) {
        switch (msg.type) {
            case 'updateLayout':
                layoutData = msg.layout;
                render(layoutData);
                break;
            case 'highlightSection':
                highlightSection(msg.section);
                break;
            case 'highlightSymbol':
                highlightSymbol(msg.symbol, msg.section, msg.address);
                break;
        }
    });
})();
