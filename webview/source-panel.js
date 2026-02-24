// Source text panel — shows raw file content with line numbers
(function () {
    var sourcePanel = document.getElementById('source-panel');
    var sourceContent = document.getElementById('source-content');
    var sourceFilename = document.getElementById('source-filename');
    var resizeHandle = document.getElementById('source-resize-handle');

    // Populate source panel when layout is received
    window.mapViewIPC.onMessage(function (msg) {
        if (msg.type === 'updateLayout' && msg.sourceText) {
            var lines = msg.sourceText.split('\n');
            sourceContent.innerHTML = '';
            for (var i = 0; i < lines.length; i++) {
                var lineEl = document.createElement('div');
                lineEl.className = 'source-line';
                lineEl.setAttribute('data-line', i);

                var numSpan = document.createElement('span');
                numSpan.className = 'line-number';
                numSpan.textContent = (i + 1).toString();

                var textSpan = document.createElement('span');
                textSpan.className = 'line-text';
                textSpan.textContent = lines[i];

                lineEl.appendChild(numSpan);
                lineEl.appendChild(textSpan);
                sourceContent.appendChild(lineEl);
            }

            if (msg.fileName) {
                sourceFilename.textContent = msg.fileName;
            }
            sourcePanel.classList.add('visible');
        }
    });

    // Scroll to a specific 0-based line number and highlight it
    window.scrollSourceToLine = function (line) {
        if (line === undefined || line === null) { return; }
        // Clear previous highlights
        var prev = sourceContent.querySelectorAll('.source-line.highlighted');
        for (var i = 0; i < prev.length; i++) {
            prev[i].classList.remove('highlighted');
        }
        var lineEl = sourceContent.querySelector('.source-line[data-line="' + line + '"]');
        if (lineEl) {
            lineEl.classList.add('highlighted');
            lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
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
        }
        function onMouseUp() {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }
    }
})();
