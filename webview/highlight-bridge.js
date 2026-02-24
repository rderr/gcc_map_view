// Bridge: tree click → memory map highlight + source panel scroll
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
