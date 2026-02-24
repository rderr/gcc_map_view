// Bi-directional highlight bridge between tree, memory map, and source panel

// --- Tree → Map + Source ---

window.highlightSectionFromTree = function (sectionName, sourceLine) {
    if (typeof window._mapHighlightSection === 'function') {
        window._mapHighlightSection(sectionName);
    }
    if (sourceLine !== undefined && typeof window.scrollSourceToLine === 'function') {
        window.scrollSourceToLine(sourceLine);
    }
};

window.highlightSymbolFromTree = function (symbolName, sectionName, sourceLine) {
    if (typeof window._mapHighlightSymbol === 'function') {
        window._mapHighlightSymbol(symbolName, sectionName);
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
            selectSectionInTree(msg.section, msg.sourceLine);
        } else if (msg.type === 'selectSymbol') {
            selectSymbolInTree(msg.symbol, msg.section, msg.sourceLine);
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

    function selectSectionInTree(sectionName, directSourceLine) {
        highlightTreeNode(sectionName, null);
        var line = directSourceLine;
        if (line === undefined) {
            var sec = findSection(sectionName);
            if (sec) { line = sec.sourceLine; }
        }
        if (line !== undefined && typeof window.scrollSourceToLine === 'function') {
            window.scrollSourceToLine(line);
        }
    }

    function selectSymbolInTree(symbolName, sectionName, directSourceLine) {
        highlightTreeNode(symbolName, sectionName);
        var line = directSourceLine;
        if (line === undefined) {
            var sym = findSymbol(symbolName, sectionName);
            if (sym) { line = sym.sourceLine; }
        }
        if (line !== undefined && typeof window.scrollSourceToLine === 'function') {
            window.scrollSourceToLine(line);
        }
    }

    var activeTreeRow = null;

    function highlightTreeNode(name, parentSectionName) {
        var treeContainer = document.getElementById('tree');
        if (!treeContainer) { return; }

        // Clear previous tree highlight (O(1) instead of querySelectorAll)
        if (activeTreeRow) {
            activeTreeRow.classList.remove('tree-active');
            activeTreeRow = null;
        }

        // Search tree labels for a match
        var labels = treeContainer.getElementsByClassName('tree-label');
        for (var i = 0; i < labels.length; i++) {
            if (labels[i].textContent !== name) { continue; }

            // If we have a parent section name, verify this node is under it
            if (parentSectionName) {
                var parentNode = labels[i].closest('.tree-section');
                if (!parentNode) {
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
                activeTreeRow = row;

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
