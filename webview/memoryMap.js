(function () {
    const MIN_SECTION_HEIGHT = 44;
    const REGION_BAR_HEIGHT = 700;
    const SECTION_COLORS = [
        '#4477AA', '#66CCEE', '#228833', '#CCBB44', '#EE6677', '#AA3377',
        '#BBBBBB', '#EE8866', '#44BB99', '#99DDFF', '#EEDD88', '#FFAABB',
    ];

    let layoutData = null;
    var sectionIndex = {};
    var currentHighlight = null;
    var currentSelectedSection = null;
    var currentSelectedColorIdx = 0;
    var detailSymbolIndex = {};
    var sectionDataMap = {};

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

    function shadeColor(hex, amount) {
        var num = parseInt(hex.replace('#', ''), 16);
        var r = Math.min(255, Math.max(0, (num >> 16) + amount));
        var g = Math.min(255, Math.max(0, ((num >> 8) & 0xFF) + amount));
        var b = Math.min(255, Math.max(0, (num & 0xFF) + amount));
        return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    function colorWithAlpha(hex, alpha) {
        var num = parseInt(hex.replace('#', ''), 16);
        var r = (num >> 16) & 0xFF;
        var g = (num >> 8) & 0xFF;
        var b = num & 0xFF;
        return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }

    // ── Render ──

    function render(layout) {
        var app = document.getElementById('app');
        if (!app) { return; }

        sectionIndex = {};
        sectionDataMap = {};
        currentHighlight = null;
        currentSelectedSection = null;
        detailSymbolIndex = {};
        hideDetail();

        if (!layout || !layout.regions || layout.regions.length === 0) {
            app.innerHTML = '<div class="no-data">No memory layout data available.<br>Open a .ld or .map file to visualize memory.</div>';
            return;
        }

        var fragment = document.createDocumentFragment();

        var container = document.createElement('div');
        container.className = 'memory-container';

        var globalSectionIdx = 0;
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
            info.textContent = formatHex(region.origin) + ' \u2502 ' + formatSize(region.length) + ' (' + pct.toFixed(1) + '% used)' +
                (region.attributes ? '  [' + region.attributes + ']' : '');
            col.appendChild(info);

            var bar = document.createElement('div');
            bar.className = 'region-bar';
            bar.style.minHeight = REGION_BAR_HEIGHT + 'px';

            var sections = region.sections.slice();
            sections.sort(function (a, b) { return a.address - b.address; });

            var totalForScaling = region.length;
            var totalSectionSize = sections.reduce(function (s, sec) { return s + sec.size; }, 0);
            var freeSize = region.length - totalSectionSize;
            var allZeroSize = totalSectionSize === 0 && sections.length > 0;

            for (var i = 0; i < sections.length; i++) {
                var sec = sections[i];
                var heightPx = allZeroSize
                    ? Math.max(MIN_SECTION_HEIGHT, REGION_BAR_HEIGHT / sections.length)
                    : Math.max(MIN_SECTION_HEIGHT, (sec.size / totalForScaling) * REGION_BAR_HEIGHT);

                var block = document.createElement('div');
                block.className = 'section-block';
                var colorIdx = globalSectionIdx % SECTION_COLORS.length;
                var sectionColor = SECTION_COLORS[colorIdx];
                globalSectionIdx++;
                block.style.background = sectionColor;
                block.style.height = heightPx + 'px';
                block.setAttribute('data-section', sec.name);
                block.setAttribute('data-color-index', String(colorIdx));
                block.setAttribute('data-source-line', sec.sourceLine !== undefined ? String(sec.sourceLine) : '');

                sectionDataMap[sec.name] = sec;
                if (!sectionIndex[sec.name]) { sectionIndex[sec.name] = []; }
                sectionIndex[sec.name].push(block);

                var label = document.createElement('span');
                label.className = 'section-label';
                label.textContent = sec.name;
                block.appendChild(label);

                var infoLine = document.createElement('span');
                infoLine.className = 'section-info';
                infoLine.textContent = formatHex(sec.address) + '  ' + formatSize(sec.size) +
                    (sec.symbols ? '  (' + sec.symbols.length + ' sym)' : '');
                block.appendChild(infoLine);

                bar.appendChild(block);
            }

            if (freeSize > 0 && !allZeroSize) {
                var freeHeight = Math.max(MIN_SECTION_HEIGHT, (freeSize / totalForScaling) * REGION_BAR_HEIGHT);
                var freeBlock = document.createElement('div');
                freeBlock.className = 'section-block free-space';
                freeBlock.style.height = freeHeight + 'px';
                var freeLabel = document.createElement('span');
                freeLabel.className = 'section-label';
                freeLabel.textContent = 'Free \u2014 ' + formatSize(freeSize);
                freeBlock.appendChild(freeLabel);
                bar.appendChild(freeBlock);
            }

            var usageBarContainer = document.createElement('div');
            usageBarContainer.className = 'usage-bar-container';
            var usageBarFill = document.createElement('div');
            var usageClass = pct < 50 ? 'usage-low' : pct < 80 ? 'usage-medium' : 'usage-high';
            usageBarFill.className = 'usage-bar-fill ' + usageClass;
            usageBarFill.style.width = pct + '%';
            usageBarContainer.appendChild(usageBarFill);
            col.appendChild(usageBarContainer);

            col.appendChild(bar);

            container.appendChild(col);
        }

        fragment.appendChild(container);
        app.innerHTML = '';
        app.appendChild(fragment);

        // ── Event delegation ──
        container.addEventListener('click', function (e) {
            var secBlock = e.target.closest('.section-block');
            if (secBlock && !secBlock.classList.contains('free-space')) {
                var secName = secBlock.getAttribute('data-section');
                var cIdx = Number(secBlock.getAttribute('data-color-index'));
                var secData = sectionDataMap[secName];

                window.mapViewIPC.postMessage({
                    type: 'selectSection',
                    section: secName,
                    sourceLine: secBlock.getAttribute('data-source-line') ? Number(secBlock.getAttribute('data-source-line')) : undefined,
                });

                if (secData) {
                    showDetail(secData, cIdx, secBlock);
                }
            }
        });
    }

    // ── Detail panel ──

    // Current sort state
    var currentSort = 'address'; // 'address' | 'size' | 'name'
    var currentSortAsc = true;   // true = ascending, false = descending
    // Stashed data for re-sorting without re-clicking
    var currentDetailSection = null;

    function showDetail(section, colorIndex, sectionBlock) {
        var panel = document.getElementById('detail-panel');
        if (!panel) { return; }

        if (currentSelectedSection) {
            currentSelectedSection.classList.remove('selected');
        }
        currentSelectedSection = sectionBlock;
        currentSelectedColorIdx = colorIndex;
        if (sectionBlock) {
            sectionBlock.classList.add('selected');
        }

        currentDetailSection = section;
        renderDetailPanel(section, colorIndex);

        panel.classList.add('visible');

        var svg = document.getElementById('connector-svg');
        if (svg) { svg.classList.add('visible'); }
    }

    function sortSymbols(symbols, mode, asc) {
        var sorted = symbols.slice();
        var dir = asc ? 1 : -1;
        if (mode === 'size') {
            sorted.sort(function (a, b) { return (a.size - b.size) * dir; });
        } else if (mode === 'name') {
            sorted.sort(function (a, b) { return a.name.localeCompare(b.name) * dir; });
        } else {
            sorted.sort(function (a, b) { return ((a.address || 0) - (b.address || 0)) * dir; });
        }
        return sorted;
    }

    function renderDetailPanel(section, colorIndex) {
        var panel = document.getElementById('detail-panel');
        if (!panel) { return; }

        detailSymbolIndex = {};

        var symbols = (section.symbols || []).filter(function (s) { return s.size > 0; });
        symbols = sortSymbols(symbols, currentSort, currentSortAsc);

        var baseColor = SECTION_COLORS[colorIndex % SECTION_COLORS.length];

        // Header
        var headerDiv = document.createElement('div');
        headerDiv.className = 'detail-header';

        var title = document.createElement('div');
        title.className = 'detail-header-title';
        title.style.color = baseColor;
        title.textContent = section.name + '  \u2014  ' + formatSize(section.size);
        headerDiv.appendChild(title);

        var infoDiv = document.createElement('div');
        infoDiv.className = 'detail-header-info';
        infoDiv.textContent = formatHex(section.address) + ' \u2502 ' + symbols.length + ' symbols';
        headerDiv.appendChild(infoDiv);

        // Sort buttons
        var sortBar = document.createElement('div');
        sortBar.className = 'detail-sort-bar';

        var sortLabel = document.createElement('span');
        sortLabel.className = 'detail-sort-label';
        sortLabel.textContent = 'Sort:';
        sortBar.appendChild(sortLabel);

        var sorts = [
            { key: 'address', label: 'Address' },
            { key: 'size', label: 'Size' },
            { key: 'name', label: 'Name' },
        ];
        for (var si = 0; si < sorts.length; si++) {
            var isActive = currentSort === sorts[si].key;
            var arrow = isActive ? (currentSortAsc ? ' \u25B2' : ' \u25BC') : '';
            var btn = document.createElement('span');
            btn.className = 'detail-sort-btn' + (isActive ? ' active' : '');
            btn.textContent = sorts[si].label + arrow;
            btn.setAttribute('data-sort', sorts[si].key);
            sortBar.appendChild(btn);
        }

        sortBar.addEventListener('click', function (e) {
            var sortBtn = e.target.closest('.detail-sort-btn');
            if (sortBtn) {
                var newSort = sortBtn.getAttribute('data-sort');
                if (newSort === currentSort) {
                    currentSortAsc = !currentSortAsc;
                } else {
                    currentSort = newSort;
                    currentSortAsc = true;
                }
                renderDetailPanel(currentDetailSection, currentSelectedColorIdx);
                requestAnimationFrame(function () {
                    requestAnimationFrame(function () {
                        positionDetailPanel();
                        drawConnector();
                    });
                });
            }
        });

        headerDiv.appendChild(sortBar);

        // Symbol bar
        var detailBar = document.createElement('div');
        detailBar.className = 'detail-bar';

        var totalSymSize = symbols.reduce(function (s, sym) { return s + sym.size; }, 0);
        var MIN_ROW = 40;
        var totalHeight = Math.max(symbols.length * MIN_ROW, 600);

        for (var i = 0; i < symbols.length; i++) {
            var sym = symbols[i];
            var rowHeight = totalSymSize > 0
                ? Math.max(MIN_ROW, (sym.size / totalSymSize) * totalHeight)
                : MIN_ROW;

            var row = document.createElement('div');
            row.className = 'detail-row';
            row.style.height = rowHeight + 'px';
            row.style.background = shadeColor(baseColor, (i % 2 === 0) ? -30 : -50);
            row.setAttribute('data-symbol', sym.name);
            row.setAttribute('data-section', section.name);
            row.setAttribute('data-address', sym.address !== undefined ? String(sym.address) : '');
            row.setAttribute('data-source-line', sym.sourceLine !== undefined ? String(sym.sourceLine) : '');

            var symKey = sym.address !== undefined
                ? section.name + '\0' + String(sym.address)
                : section.name + '\0' + sym.name;
            detailSymbolIndex[symKey] = row;

            var topLine = document.createElement('div');
            topLine.className = 'detail-row-top';

            var nameSpan = document.createElement('span');
            nameSpan.className = 'detail-row-name';
            nameSpan.textContent = sym.name;
            topLine.appendChild(nameSpan);

            var srcBtn = document.createElement('span');
            srcBtn.className = 'detail-row-src-btn';
            srcBtn.textContent = '\u21b1';
            srcBtn.title = 'Go to source';
            srcBtn.setAttribute('data-symbol', sym.name);
            srcBtn.setAttribute('data-section', section.name);
            srcBtn.setAttribute('data-address', sym.address !== undefined ? String(sym.address) : '');
            srcBtn.setAttribute('data-source-line', sym.sourceLine !== undefined ? String(sym.sourceLine) : '');
            topLine.appendChild(srcBtn);

            row.appendChild(topLine);

            var infoSpan = document.createElement('span');
            infoSpan.className = 'detail-row-info';
            infoSpan.textContent = (sym.address !== undefined ? formatHex(sym.address) : '') + '  ' + formatSize(sym.size) + ' (' + sym.size + ' B / 0x' + sym.size.toString(16).toUpperCase() + ')';
            row.appendChild(infoSpan);

            detailBar.appendChild(row);
        }

        if (symbols.length === 0) {
            var emptyMsg = document.createElement('div');
            emptyMsg.style.padding = '24px 14px';
            emptyMsg.style.color = 'var(--vscode-descriptionForeground, #666)';
            emptyMsg.style.fontStyle = 'italic';
            emptyMsg.textContent = 'No symbols in this section.';
            detailBar.appendChild(emptyMsg);
        }

        detailBar.addEventListener('click', function (e) {
            var srcBtn = e.target.closest('.detail-row-src-btn');
            if (srcBtn) {
                e.stopPropagation();
                window.mapViewIPC.postMessage({
                    type: 'selectSymbol',
                    symbol: srcBtn.getAttribute('data-symbol'),
                    section: srcBtn.getAttribute('data-section'),
                    address: srcBtn.getAttribute('data-address') ? Number(srcBtn.getAttribute('data-address')) : undefined,
                    sourceLine: srcBtn.getAttribute('data-source-line') ? Number(srcBtn.getAttribute('data-source-line')) : undefined,
                });
                return;
            }
            var row = e.target.closest('.detail-row');
            if (row) {
                window.mapViewIPC.postMessage({
                    type: 'selectSymbol',
                    symbol: row.getAttribute('data-symbol'),
                    section: row.getAttribute('data-section'),
                    address: row.getAttribute('data-address') ? Number(row.getAttribute('data-address')) : undefined,
                    sourceLine: row.getAttribute('data-source-line') ? Number(row.getAttribute('data-source-line')) : undefined,
                });
            }
        });

        panel.innerHTML = '';
        panel.appendChild(headerDiv);
        panel.appendChild(detailBar);

        // Position the detail panel and draw connector after layout settles
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                positionDetailPanel();
                drawConnector();
            });
        });
    }

    function hideDetail() {
        var panel = document.getElementById('detail-panel');
        if (panel) {
            panel.classList.remove('visible');
            panel.innerHTML = '';
            panel.style.marginTop = '0';
        }
        var svg = document.getElementById('connector-svg');
        if (svg) {
            svg.classList.remove('visible');
            svg.innerHTML = '';
        }
        if (currentSelectedSection) {
            currentSelectedSection.classList.remove('selected');
            currentSelectedSection = null;
        }
    }

    function positionDetailPanel() {
        var panel = document.getElementById('detail-panel');
        if (!panel || !currentSelectedSection) { return; }

        // Reset margin so measurements are clean
        panel.style.marginTop = '0px';

        // Force layout so getBoundingClientRect reflects the reset
        panel.offsetHeight;

        var layout = document.querySelector('.app-layout');
        if (!layout) { return; }
        var layoutRect = layout.getBoundingClientRect();

        // Where the section block is
        var srcRect = currentSelectedSection.getBoundingClientRect();
        var sectionTop = srcRect.top - layoutRect.top;

        // Where the detail-bar currently is (with margin=0)
        var detailBar = panel.querySelector('.detail-bar');
        var barRect = detailBar ? detailBar.getBoundingClientRect() : panel.getBoundingClientRect();
        var barTop = barRect.top - layoutRect.top;

        // Shift the panel so the bar top aligns with the section top
        var desiredMargin = sectionTop - barTop;
        desiredMargin = Math.max(0, desiredMargin);

        panel.style.marginTop = desiredMargin + 'px';
    }

    function drawConnector() {
        var svg = document.getElementById('connector-svg');
        var panel = document.getElementById('detail-panel');
        if (!svg || !panel || !currentSelectedSection) { return; }

        var svgRect = svg.getBoundingClientRect();
        var svgW = svgRect.width;
        var svgH = svgRect.height;
        if (svgW === 0 || svgH === 0) { return; }

        svg.setAttribute('width', String(svgW));
        svg.setAttribute('height', String(svgH));
        svg.setAttribute('viewBox', '0 0 ' + svgW + ' ' + svgH);
        svg.innerHTML = '';

        // Draw a horizontal line from the section across the gap and the full width of the symbol list
        var detailBar = panel.querySelector('.detail-bar');
        var dstRect = detailBar ? detailBar.getBoundingClientRect() : panel.getBoundingClientRect();
        var y = dstRect.top - svgRect.top + 1;

        // Extend the line past the SVG into the detail bar (full width of it)
        var lineEndX = svgW + dstRect.width;

        var baseColor = SECTION_COLORS[currentSelectedColorIdx % SECTION_COLORS.length];

        var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', '0');
        line.setAttribute('y1', String(y));
        line.setAttribute('x2', String(lineEndX));
        line.setAttribute('y2', String(y));
        line.setAttribute('stroke', colorWithAlpha(baseColor, 0.7));
        line.setAttribute('stroke-width', '2');
        svg.appendChild(line);
    }

    window.addEventListener('resize', function () {
        if (currentSelectedSection) {
            requestAnimationFrame(function () {
                positionDetailPanel();
                drawConnector();
            });
        }
    });

    // ── Highlights ──

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

        if (sectionName) {
            highlightSection(sectionName);
        }

        var el;
        if (address !== undefined && sectionName) {
            el = detailSymbolIndex[sectionName + '\0' + String(address)];
        }
        if (!el && sectionName) {
            el = detailSymbolIndex[sectionName + '\0' + symbolName];
        }
        if (el) {
            el.classList.add('highlighted');
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    window._mapHighlightSection = highlightSection;
    window._mapHighlightSymbol = highlightSymbol;

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
