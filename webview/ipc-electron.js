// IPC adapter for Electron renderer
(function () {
    window.mapViewIPC = {
        postMessage: function (msg) { window.electronAPI.send('renderer-message', msg); },
        onMessage: function (cb) { window.electronAPI.onMessage(cb); }
    };
})();
