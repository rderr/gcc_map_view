(function () {
    // @ts-ignore
    const vscode = acquireVsCodeApi();
    const MIN_SECTION_HEIGHT = 40;
    const REGION_BAR_HEIGHT = 700;
    const SYM_COLOR_COUNT = 12;

    let layoutData = null;

    function getSectionColorClass(name) {
        if (/^\.isr_vector/i.test(name) || /^\.vectors/i.test(name) || /^\.isr/i.test(name)) { return 'section-vectors'; }
        if (/^\.rodata/i.test(name)) { return 'section-rodata'; }
        if (/^\.text/i.test(name)) { return 'section-text'; }
        if (/^\.bss/i.test(name)) { return 'section-bss'; }
        if (/^\.data/i.test(name)) { return 'section-data'; }
        return 'section-default';
    }

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

    function render(layout) {
        var app = document.getElementById('app');
        if (!app) { return; }

        if (!layout || !layout.regions || layout.regions.length === 0) {
            app.innerHTML = '<div class="no-data">No memory layout data available.<br>Open a .ld or .map file to visualize memory.</div>';
            return;
        }

        // Clear and rebuild
        app.innerHTML = '';

        var heading = document.createElement('h1');
        heading.textContent = 'Memory Map';
        app.appendChild(heading);

        var container = document.createElement('div');
        container.className = 'memory-container';
        app.appendChild(container);

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
            var sections = region.sections.filter(function (s) { return s.size > 0; });
            sections.sort(function (a, b) { return a.address - b.address; });

            var totalForScaling = region.length;
            var totalSectionSize = sections.reduce(function (s, sec) { return s + sec.size; }, 0);
            var freeSize = region.length - totalSectionSize;

            // Render section blocks
            for (var i = 0; i < sections.length; i++) {
                var sec = sections[i];
                var heightPx = Math.max(MIN_SECTION_HEIGHT, (sec.size / totalForScaling) * REGION_BAR_HEIGHT);

                // Filter symbols with size > 0
                var symbols = (sec.symbols || []).filter(function (s) { return s.size > 0; });

                var block = document.createElement('div');
                block.className = 'section-block ' + getSectionColorClass(sec.name);
                if (symbols.length > 0) {
                    block.className += ' has-symbols';
                    // Use min-height so the grid can grow taller
                    block.style.minHeight = heightPx + 'px';
                } else {
                    block.style.height = heightPx + 'px';
                }
                block.setAttribute('data-section', sec.name);

                var label = document.createElement('span');
                label.className = 'section-label';
                label.textContent = sec.name + ' (' + formatSize(sec.size) + ')';
                block.appendChild(label);

                // Render symbol sub-blocks as a justified wrapping grid
                if (symbols.length > 0) {
                    var symGrid = document.createElement('div');
                    symGrid.className = 'symbol-grid';

                    // Each symbol gets a flex-basis proportional to its size.
                    // flex-grow stretches items to fill each row edge-to-edge.
                    var totalSymSize = symbols.reduce(function (s, sym) { return s + sym.size; }, 0);
                    // Target items per row based on count
                    var itemsPerRow = Math.min(symbols.length, Math.max(4, Math.ceil(Math.sqrt(symbols.length * 1.5))));
                    // Scale so one row of average-sized items sums to ~100%
                    var avgSize = totalSymSize / symbols.length;
                    var rowBudget = avgSize * itemsPerRow;

                    for (var si = 0; si < symbols.length; si++) {
                        var sym = symbols[si];
                        var basisPct = (sym.size / rowBudget) * 100;
                        // Clamp: min 3%, max 100%
                        basisPct = Math.max(3, Math.min(100, basisPct));

                        var symBlock = document.createElement('div');
                        symBlock.className = 'symbol-block sym-color-' + (si % SYM_COLOR_COUNT);
                        // flex-basis sets proportional size, flex-grow fills the row
                        symBlock.style.flexBasis = basisPct + '%';
                        symBlock.style.flexGrow = String(sym.size);
                        symBlock.setAttribute('data-symbol', sym.name);
                        symBlock.setAttribute('data-section', sec.name);

                        // Click: select symbol
                        symBlock.addEventListener('click', (function (symbolName, sectionName) {
                            return function (e) {
                                e.stopPropagation();
                                vscode.postMessage({ type: 'selectSymbol', symbol: symbolName, section: sectionName });
                            };
                        })(sym.name, sec.name));

                        // Tooltip on hover
                        symBlock.addEventListener('mouseenter', (function (symbol) {
                            return function (e) { showSymbolTooltip(e, symbol); };
                        })(sym));
                        symBlock.addEventListener('mouseleave', function () { hideTooltip(); });
                        symBlock.addEventListener('mousemove', function (e) { moveTooltip(e); });

                        symGrid.appendChild(symBlock);
                    }

                    block.appendChild(symGrid);
                }

                // Section-level click (only fires if not caught by a symbol)
                block.addEventListener('click', (function (sectionName) {
                    return function () {
                        vscode.postMessage({ type: 'selectSection', section: sectionName });
                    };
                })(sec.name));

                block.addEventListener('mouseenter', (function (section) {
                    return function (e) { showTooltip(e, section); };
                })(sec));
                block.addEventListener('mouseleave', function () { hideTooltip(); });
                block.addEventListener('mousemove', function (e) { moveTooltip(e); });

                bar.appendChild(block);
            }

            // Free space block
            if (freeSize > 0) {
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
        tooltip.style.left = (e.clientX + 12) + 'px';
        tooltip.style.top = (e.clientY + 12) + 'px';
    }

    function hideTooltip() {
        var tooltip = document.getElementById('tooltip');
        if (tooltip) { tooltip.classList.remove('visible'); }
    }

    function clearHighlights() {
        document.querySelectorAll('.highlighted').forEach(function (el) {
            el.classList.remove('highlighted');
        });
    }

    function highlightSection(sectionName) {
        clearHighlights();
        if (sectionName) {
            var selector = '.section-block[data-section="' + CSS.escape(sectionName) + '"]';
            document.querySelectorAll(selector).forEach(function (el) {
                el.classList.add('highlighted');
                el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });
        }
    }

    function highlightSymbol(symbolName, sectionName) {
        clearHighlights();
        if (symbolName) {
            // Match by both symbol name and section to handle duplicate names across sections
            var blocks = document.querySelectorAll('.symbol-block');
            for (var i = 0; i < blocks.length; i++) {
                var b = blocks[i];
                if (b.getAttribute('data-symbol') === symbolName &&
                    (!sectionName || b.getAttribute('data-section') === sectionName)) {
                    b.classList.add('highlighted');
                    b.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    break;
                }
            }
        }
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Message handling from extension
    window.addEventListener('message', function (event) {
        var msg = event.data;
        switch (msg.type) {
            case 'updateLayout':
                layoutData = msg.layout;
                render(layoutData);
                break;
            case 'highlightSection':
                highlightSection(msg.section);
                break;
            case 'highlightSymbol':
                highlightSymbol(msg.symbol, msg.section);
                break;
        }
    });
})();
