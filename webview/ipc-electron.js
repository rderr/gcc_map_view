// IPC adapter for Electron renderer
(function () {
    var localListeners = [];
    window.mapViewIPC = {
        postMessage: function (msg) {
            window.electronAPI.send('renderer-message', msg);
            // Also dispatch locally so map clicks can be handled in-renderer
            for (var i = 0; i < localListeners.length; i++) {
                try { localListeners[i](msg); } catch (e) { /* ignore */ }
            }
        },
        onMessage: function (cb) {
            window.electronAPI.onMessage(cb);
            localListeners.push(cb);
        }
    };
})();
