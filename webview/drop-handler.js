// Drag-and-drop file handler
(function () {
    var overlay = document.getElementById('drop-overlay');
    var dragCounter = 0;

    document.addEventListener('dragenter', function (e) {
        e.preventDefault();
        dragCounter++;
        if (overlay) { overlay.classList.add('visible'); }
    });

    document.addEventListener('dragleave', function (e) {
        e.preventDefault();
        dragCounter--;
        if (dragCounter <= 0) {
            dragCounter = 0;
            if (overlay) { overlay.classList.remove('visible'); }
        }
    });

    document.addEventListener('dragover', function (e) {
        e.preventDefault();
    });

    document.addEventListener('drop', function (e) {
        e.preventDefault();
        dragCounter = 0;
        if (overlay) { overlay.classList.remove('visible'); }

        var files = e.dataTransfer && e.dataTransfer.files;
        if (files && files.length > 0) {
            var filePath = files[0].path;
            if (filePath) {
                window.electronAPI.send('drop-file', filePath);
            }
        }
    });
})();
