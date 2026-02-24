// Bi-directional highlight bridge between tree, memory map, and source panel

// --- Tree → Map + Source ---

window.highlightSectionFromTree = function (sectionName, sourceLine) {
    window.mapViewIPC.onMessage._highlightSection && window.mapViewIPC.onMessage._highlightSection(sectionName);
    var blocks = document.querySelectorAll('.section-block');
    blocks.forEach(function (el) { el.classList.remove('highlighted'); });
    var selector = '.section-block[data-section="' + CSS.escape(sectionName) + '"]';
    document.querySelectorAll(selector).forEach(function (el) {
        el.classList.add('highlighted');
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    if (sourceLine !== undefined && typeof window.scrollSourceToLine === 'function') {
        window.scrollSourceToLine(sourceLine);
    }
};

window.highlightSymbolFromTree = function (symbolName, sectionName, sourceLine) {
    document.querySelectorAll('.highlighted').forEach(function (el) { el.classList.remove('highlighted'); });
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
    if (sourceLine !== undefined && typeof window.scrollSourceToLine === 'function') {
        window.scrollSourceToLine(sourceLine);
    }
};

// --- Map → Tree + Source ---

(function () {
    var currentLayout = null;

    // Store layout for sourceLine lookups
    window.mapViewIPC.onMessage(function (msg) {
        if (msg.type === 'updateLayout' && msg.layout) {
            currentLayout = msg.layout;
        }

        // Handle map cell clicks
        if (msg.type === 'selectSection') {
            selectSectionInTree(msg.section);
        } else if (msg.type === 'selectSymbol') {
            selectSymbolInTree(msg.symbol, msg.section);
        }
    });

    function findSection(sectionName) {
        if (!currentLayout || !currentLayout.regions) { return null; }
        for (var r = 0; r < currentLayout.regions.length; r++) {
            var sections = currentLayout.regions[r].sections;
            for (var s = 0; s < sections.length; s++) {
                if (sections[s].name === sectionName) { return sections[s]; }
            }
        }
        return null;
    }

    function findSymbol(symbolName, sectionName) {
        if (!currentLayout || !currentLayout.regions) { return null; }
        for (var r = 0; r < currentLayout.regions.length; r++) {
            var sections = currentLayout.regions[r].sections;
            for (var s = 0; s < sections.length; s++) {
                var sec = sections[s];
                if (sectionName && sec.name !== sectionName) { continue; }
                var symbols = sec.symbols || [];
                for (var si = 0; si < symbols.length; si++) {
                    if (symbols[si].name === symbolName) { return symbols[si]; }
                }
            }
        }
        return null;
    }

    function selectSectionInTree(sectionName) {
        highlightTreeNode(sectionName, null);
        var sec = findSection(sectionName);
        if (sec && sec.sourceLine !== undefined && typeof window.scrollSourceToLine === 'function') {
            window.scrollSourceToLine(sec.sourceLine);
        }
    }

    function selectSymbolInTree(symbolName, sectionName) {
        highlightTreeNode(symbolName, sectionName);
        var sym = findSymbol(symbolName, sectionName);
        if (sym && sym.sourceLine !== undefined && typeof window.scrollSourceToLine === 'function') {
            window.scrollSourceToLine(sym.sourceLine);
        }
    }

    function highlightTreeNode(name, parentSectionName) {
        var treeContainer = document.getElementById('tree');
        if (!treeContainer) { return; }

        // Clear previous tree highlights
        var prev = treeContainer.querySelectorAll('.tree-row.tree-active');
        for (var i = 0; i < prev.length; i++) {
            prev[i].classList.remove('tree-active');
        }

        // Search tree labels for a match
        var labels = treeContainer.querySelectorAll('.tree-label');
        for (var i = 0; i < labels.length; i++) {
            if (labels[i].textContent !== name) { continue; }

            // If we have a parent section name, verify this node is under it
            if (parentSectionName) {
                var parentNode = labels[i].closest('.tree-section');
                if (!parentNode) {
                    // This label is on a section node; check if the symbol is inside
                    // a section with matching name
                    var ancestor = labels[i].closest('.tree-children');
                    if (ancestor) {
                        var parentLabel = ancestor.previousElementSibling;
                        if (parentLabel) {
                            var pLabel = parentLabel.querySelector('.tree-label');
                            if (pLabel && pLabel.textContent !== parentSectionName) { continue; }
                        }
                    }
                }
            }

            var row = labels[i].closest('.tree-row');
            if (row) {
                row.classList.add('tree-active');

                // Expand all parent containers so the node is visible
                var parent = row.parentElement;
                while (parent) {
                    if (parent.classList && parent.classList.contains('tree-children') &&
                        parent.classList.contains('collapsed')) {
                        parent.classList.remove('collapsed');
                        var prevRow = parent.previousElementSibling;
                        if (prevRow) {
                            var tog = prevRow.querySelector('.tree-toggle');
                            if (tog) { tog.textContent = '\u25BC'; }
                        }
                    }
                    parent = parent.parentElement;
                }

                row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
            break;
        }
    }
})();
