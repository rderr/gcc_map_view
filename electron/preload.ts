import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    send: (channel: string, data: unknown) => {
        ipcRenderer.send(channel, data);
    },
    onMessage: (callback: (data: unknown) => void) => {
        ipcRenderer.on('main-message', (_event: IpcRendererEvent, data: unknown) => {
            callback(data);
        });
    },
    invoke: (channel: string, ...args: unknown[]) => {
        return ipcRenderer.invoke(channel, ...args);
    },
});
