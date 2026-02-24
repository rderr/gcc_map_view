// Source text panel — virtual-scrolling, fetches visible lines on demand from main process
(function () {
    var sourcePanel = document.getElementById('source-panel');
    var sourceContent = document.getElementById('source-content');
    var sourceFilename = document.getElementById('source-filename');
    var contentWrapper = document.getElementById('source-content-wrapper');
    var resizeHandle = document.getElementById('source-resize-handle');
    var highlightEl = document.getElementById('source-highlight');
    var colorBandsEl = document.getElementById('source-color-bands');

    var LINE_HEIGHT = 16.8; // 12px font * 1.4 line-height
    var OVERSCAN = 30;
    var totalLines = 0;
    var gutterWidth = 0;
    var highlightedLine = -1;
    var lastFirst = -1;
    var lastLast = -1;
    var fetchPending = false;
    var sectionBands = []; // [{ startLine, endLine, color }]
    var symbolLines = []; // [{ line, color }]
    var symbolLineSet = {}; // line → true, for fast lookup

    var PALETTE = [
        '#4477AA', '#66CCEE', '#228833', '#CCBB44', '#EE6677', '#AA3377',
        '#BBBBBB', '#EE8866', '#44BB99', '#99DDFF', '#EEDD88', '#FFAABB',
    ];

    function buildColorBands(layout) {
        sectionBands = [];
        symbolLines = [];
        symbolLineSet = {};
        if (!layout || !layout.regions) { return; }
        // Section bands: global running index across all regions
        var sectionIndex = 0;
        for (var r = 0; r < layout.regions.length; r++) {
            var region = layout.regions[r];
            if (!region.sections || region.length === 0) { continue; }
            var sections = region.sections.slice();
            sections.sort(function (a, b) { return a.address - b.address; });
            for (var i = 0; i < sections.length; i++) {
                var sec = sections[i];
                var sectionColor = PALETTE[sectionIndex % PALETTE.length];
                sectionIndex++;
                if (sec.sourceLine === undefined || sec.sourceLineEnd === undefined) { continue; }
                sectionBands.push({
                    startLine: sec.sourceLine,
                    endLine: sec.sourceLineEnd,
                    color: sectionColor + '55'
                });
                // Symbol lines: index only counts symbols with size > 0 (matching map view)
                var symbols = sec.symbols || [];
                var visibleIndex = 0;
                for (var si = 0; si < symbols.length; si++) {
                    var sym = symbols[si];
                    if (sym.size === 0) { continue; }
                    if (sym.sourceLine !== undefined) {
                        symbolLines.push({
                            line: sym.sourceLine,
                            color: PALETTE[visibleIndex % PALETTE.length] + '55'
                        });
                        symbolLineSet[sym.sourceLine] = true;
                    }
                    visibleIndex++;
                }
            }
        }
    }

    function addBandDiv(top, height, color) {
        var div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.left = '0';
        div.style.right = '0';
        div.style.top = top + 'px';
        div.style.height = height + 'px';
        div.style.background = color;
        div.style.pointerEvents = 'none';
        colorBandsEl.appendChild(div);
    }

    function renderColorBands(first, last) {
        if (!colorBandsEl) { return; }
        colorBandsEl.innerHTML = '';
        // Section bands — skip lines that have a symbol color
        for (var b = 0; b < sectionBands.length; b++) {
            var band = sectionBands[b];
            if (band.endLine < first || band.startLine > last) { continue; }
            var runStart = band.startLine;
            for (var line = band.startLine; line <= band.endLine; line++) {
                if (symbolLineSet[line]) {
                    // Flush the current section run before this symbol line
                    if (line > runStart) {
                        addBandDiv(runStart * LINE_HEIGHT, (line - runStart) * LINE_HEIGHT, band.color);
                    }
                    runStart = line + 1;
                }
            }
            // Flush remaining run
            if (runStart <= band.endLine) {
                addBandDiv(runStart * LINE_HEIGHT, (band.endLine - runStart + 1) * LINE_HEIGHT, band.color);
            }
        }
        // Symbol lines
        for (var s = 0; s < symbolLines.length; s++) {
            var sym = symbolLines[s];
            if (sym.line < first || sym.line > last) { continue; }
            addBandDiv(sym.line * LINE_HEIGHT, LINE_HEIGHT, sym.color);
        }
    }

    function getVisibleRange() {
        if (!contentWrapper || totalLines === 0) { return null; }
        var scrollTop = contentWrapper.scrollTop;
        var viewHeight = contentWrapper.clientHeight;
        var first = Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - OVERSCAN);
        var last = Math.min(totalLines - 1, Math.ceil((scrollTop + viewHeight) / LINE_HEIGHT) + OVERSCAN);
        return { first: first, last: last };
    }

    function renderLines(lines, first) {
        var parts = new Array(lines.length);
        for (var i = 0; i < lines.length; i++) {
            var num = (first + i + 1).toString();
            while (num.length < gutterWidth) { num = ' ' + num; }
            parts[i] = num + '  ' + lines[i];
        }

        sourceContent.style.paddingTop = (first * LINE_HEIGHT) + 'px';
        sourceContent.style.paddingBottom = (Math.max(0, totalLines - first - lines.length) * LINE_HEIGHT) + 'px';
        sourceContent.textContent = parts.join('\n');

        renderColorBands(first, first + lines.length - 1);

        if (highlightEl && highlightedLine >= 0) {
            highlightEl.style.top = (highlightedLine * LINE_HEIGHT) + 'px';
            highlightEl.style.height = LINE_HEIGHT + 'px';
            highlightEl.style.display = 'block';
        }
    }

    function fetchVisible() {
        var range = getVisibleRange();
        if (!range || fetchPending) { return; }
        // Skip if range hasn't changed much
        if (range.first >= lastFirst && range.last <= lastLast) { return; }

        lastFirst = range.first;
        lastLast = range.last;
        fetchPending = true;

        window.electronAPI.invoke('get-source-lines', range.first, range.last).then(function (lines) {
            fetchPending = false;
            if (lines) {
                renderLines(lines, range.first);
            }
        });
    }

    // Listen for layout updates that include source info
    window.mapViewIPC.onMessage(function (msg) {
        if (msg.type === 'updateLayout' && msg.sourceInfo) {
            totalLines = msg.sourceInfo.totalLines;
            gutterWidth = totalLines.toString().length;
            highlightedLine = -1;
            lastFirst = -1;
            lastLast = -1;

            buildColorBands(msg.layout);

            if (highlightEl) { highlightEl.style.display = 'none'; }
            if (colorBandsEl) { colorBandsEl.innerHTML = ''; }
            sourceContent.textContent = '';

            if (msg.sourceInfo.fileName) {
                sourceFilename.textContent = msg.sourceInfo.fileName;
            }
            sourcePanel.classList.add('visible');

            requestAnimationFrame(fetchVisible);
        }
    });

    if (contentWrapper) {
        var scrollTimer;
        contentWrapper.addEventListener('scroll', function () {
            clearTimeout(scrollTimer);
            scrollTimer = setTimeout(fetchVisible, 16);
        });
    }

    var resizeTimer;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            lastFirst = -1;
            lastLast = -1;
            fetchVisible();
        }, 50);
    });

    // Scroll to a specific 0-based line number and highlight it
    window.scrollSourceToLine = function (line) {
        if (line === undefined || line === null || !contentWrapper || totalLines === 0) { return; }
        highlightedLine = line;
        var scrollTop = Math.max(0, (line * LINE_HEIGHT) - (contentWrapper.clientHeight / 2));
        contentWrapper.scrollTop = scrollTop;
        lastFirst = -1;
        lastLast = -1;
        fetchVisible();
    };

    // Resize handle drag
    if (resizeHandle && sourcePanel) {
        var startY, startHeight;
        resizeHandle.addEventListener('mousedown', function (e) {
            e.preventDefault();
            startY = e.clientY;
            startHeight = sourcePanel.offsetHeight;
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
        function onMouseMove(e) {
            var delta = startY - e.clientY;
            var newHeight = Math.max(80, Math.min(window.innerHeight - 200, startHeight + delta));
            sourcePanel.style.height = newHeight + 'px';
            lastFirst = -1;
            lastLast = -1;
            fetchVisible();
        }
        function onMouseUp() {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }
    }
})();
