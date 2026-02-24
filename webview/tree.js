// Plain DOM collapsible tree component for memory layout
(function () {
    var treeContainer = document.getElementById('tree');
    var searchInput = document.getElementById('tree-search');
    var currentLayout = null;

    function formatHex(value) {
        return '0x' + value.toString(16).toUpperCase().padStart(8, '0');
    }

    function formatSize(bytes) {
        if (bytes >= 1024 * 1024) { return (bytes / (1024 * 1024)).toFixed(1) + ' MB'; }
        if (bytes >= 1024) { return (bytes / 1024).toFixed(1) + ' KB'; }
        return bytes + ' B';
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function createTreeNode(label, detail, className, children, onClick) {
        var node = document.createElement('div');
        node.className = 'tree-node ' + (className || '');

        var row = document.createElement('div');
        row.className = 'tree-row';

        if (children && children.length > 0) {
            var toggle = document.createElement('span');
            toggle.className = 'tree-toggle';
            toggle.textContent = '\u25B6'; // ▶
            row.appendChild(toggle);
        } else {
            var spacer = document.createElement('span');
            spacer.className = 'tree-toggle tree-leaf';
            spacer.textContent = ' ';
            row.appendChild(spacer);
        }

        var labelSpan = document.createElement('span');
        labelSpan.className = 'tree-label';
        labelSpan.textContent = label;
        row.appendChild(labelSpan);

        if (detail) {
            var detailSpan = document.createElement('span');
            detailSpan.className = 'tree-detail';
            detailSpan.textContent = detail;
            row.appendChild(detailSpan);
        }

        node.appendChild(row);

        if (children && children.length > 0) {
            var childContainer = document.createElement('div');
            childContainer.className = 'tree-children collapsed';
            for (var i = 0; i < children.length; i++) {
                childContainer.appendChild(children[i]);
            }
            node.appendChild(childContainer);

            row.addEventListener('click', function (e) {
                e.stopPropagation();
                var isCollapsed = childContainer.classList.contains('collapsed');
                childContainer.classList.toggle('collapsed');
                var tog = row.querySelector('.tree-toggle');
                if (tog) {
                    tog.textContent = isCollapsed ? '\u25BC' : '\u25B6'; // ▼ or ▶
                }
            });
        }

        if (onClick) {
            row.addEventListener('click', function (e) {
                e.stopPropagation();
                onClick();
            });
            row.classList.add('clickable');
        }

        return node;
    }

    function buildTree(layout) {
        if (!treeContainer) { return; }
        treeContainer.innerHTML = '';

        if (!layout || !layout.regions || layout.regions.length === 0) {
            treeContainer.innerHTML = '<div class="tree-empty">No data. Open a .ld or .map file.</div>';
            return;
        }

        for (var r = 0; r < layout.regions.length; r++) {
            var region = layout.regions[r];
            var sectionNodes = [];

            for (var s = 0; s < region.sections.length; s++) {
                var sec = region.sections[s];

                var symbolNodes = [];
                var symbols = sec.symbols || [];
                for (var si = 0; si < symbols.length; si++) {
                    var sym = symbols[si];
                    if (sym.size === 0) { continue; }
                    symbolNodes.push(createTreeNode(
                        sym.name,
                        formatHex(sym.address) + '  ' + formatSize(sym.size),
                        'tree-symbol',
                        null,
                        (function (symName, secName, symSourceLine) {
                            return function () {
                                window.mapViewIPC.postMessage({ type: 'selectSymbol', symbol: symName, section: secName });
                                highlightSymbolInMap(symName, secName, symSourceLine);
                            };
                        })(sym.name, sec.name, sym.sourceLine)
                    ));
                }

                var secDetail = sec.size > 0
                    ? formatHex(sec.address) + '  ' + formatSize(sec.size)
                    : (sec.address ? formatHex(sec.address) : '');

                sectionNodes.push(createTreeNode(
                    sec.name,
                    secDetail,
                    'tree-section',
                    symbolNodes,
                    (function (secName, secSourceLine) {
                        return function () {
                            window.mapViewIPC.postMessage({ type: 'selectSection', section: secName });
                            highlightSectionInMap(secName, secSourceLine);
                        };
                    })(sec.name, sec.sourceLine)
                ));
            }

            var used = region.used || region.sections.reduce(function (s, sec) { return s + sec.size; }, 0);
            var pct = region.length > 0 ? ((used / region.length) * 100).toFixed(1) : '0.0';

            var regionNode = createTreeNode(
                region.name,
                formatHex(region.origin) + '  ' + formatSize(region.length) + '  (' + pct + '% used)',
                'tree-region',
                sectionNodes,
                null
            );

            // Auto-expand regions
            var childContainer = regionNode.querySelector('.tree-children');
            if (childContainer) {
                childContainer.classList.remove('collapsed');
                var tog = regionNode.querySelector('.tree-toggle');
                if (tog) { tog.textContent = '\u25BC'; }
            }

            treeContainer.appendChild(regionNode);
        }
    }

    function highlightSectionInMap(sectionName, sourceLine) {
        // Send highlight to memory map (same window)
        if (typeof window.highlightSectionFromTree === 'function') {
            window.highlightSectionFromTree(sectionName, sourceLine);
        }
    }

    function highlightSymbolInMap(symbolName, sectionName, sourceLine) {
        if (typeof window.highlightSymbolFromTree === 'function') {
            window.highlightSymbolFromTree(symbolName, sectionName, sourceLine);
        }
    }

    // Filter tree nodes by search text
    function filterTree(query) {
        if (!treeContainer) { return; }
        var nodes = treeContainer.querySelectorAll('.tree-node');
        query = query.toLowerCase().trim();

        if (!query) {
            // Show all, collapse sections back
            for (var i = 0; i < nodes.length; i++) {
                nodes[i].style.display = '';
            }
            return;
        }

        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            var label = node.querySelector('.tree-label');
            var text = label ? label.textContent.toLowerCase() : '';
            var matches = text.indexOf(query) !== -1;

            if (matches) {
                node.style.display = '';
                // Expand parents
                var parent = node.parentElement;
                while (parent) {
                    if (parent.classList && parent.classList.contains('tree-children')) {
                        parent.classList.remove('collapsed');
                        var prevRow = parent.previousElementSibling;
                        if (prevRow) {
                            var tog = prevRow.querySelector('.tree-toggle');
                            if (tog) { tog.textContent = '\u25BC'; }
                        }
                    }
                    if (parent.classList && parent.classList.contains('tree-node')) {
                        parent.style.display = '';
                    }
                    parent = parent.parentElement;
                }
            } else {
                // Hide only leaf nodes that don't match; parents are shown if any child matches
                var hasVisibleChild = node.querySelector('.tree-node');
                if (!hasVisibleChild) {
                    node.style.display = 'none';
                }
            }
        }
    }

    if (searchInput) {
        searchInput.addEventListener('input', function () {
            filterTree(searchInput.value);
        });
    }

    // Listen for layout updates
    window.mapViewIPC.onMessage(function (msg) {
        if (msg.type === 'updateLayout') {
            currentLayout = msg.layout;
            buildTree(currentLayout);
        }
    });

    // Expose for cross-component communication in electron.html
    window.buildTree = buildTree;
})();
