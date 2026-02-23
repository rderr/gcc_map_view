// IPC adapter for VS Code webview
(function () {
    var api = acquireVsCodeApi();
    window.mapViewIPC = {
        postMessage: function (msg) { api.postMessage(msg); },
        onMessage: function (cb) { window.addEventListener('message', function (e) { cb(e.data); }); }
    };
})();
