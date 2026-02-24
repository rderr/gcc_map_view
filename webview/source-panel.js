// Source text panel — virtual-scrolling, fetches visible lines on demand from main process
(function () {
    var sourcePanel = document.getElementById('source-panel');
    var sourceContent = document.getElementById('source-content');
    var sourceFilename = document.getElementById('source-filename');
    var contentWrapper = document.getElementById('source-content-wrapper');
    var resizeHandle = document.getElementById('source-resize-handle');
    var highlightEl = document.getElementById('source-highlight');

    var LINE_HEIGHT = 16.8; // 12px font * 1.4 line-height
    var OVERSCAN = 30;
    var totalLines = 0;
    var gutterWidth = 0;
    var highlightedLine = -1;
    var lastFirst = -1;
    var lastLast = -1;
    var fetchPending = false;

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

            if (highlightEl) { highlightEl.style.display = 'none'; }
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
