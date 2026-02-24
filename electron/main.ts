import { app, BrowserWindow, Menu, dialog, ipcMain, MenuItemConstructorOptions, IpcMainEvent } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { parseLd } from '../src/parsers/ldParser';
import { parseMap, isGccMapFile } from '../src/parsers/mapParser';
import { MemoryLayout } from '../src/models/types';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: 'GCC Map View',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    // out-electron/electron/main.js → ../../webview/electron.html
    mainWindow.loadFile(path.join(__dirname, '..', '..', 'webview', 'electron.html'));

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function buildMenu(): void {
    const template: MenuItemConstructorOptions[] = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'Open...',
                    accelerator: 'CmdOrCtrl+O',
                    click: () => openFileDialog(),
                },
                { type: 'separator' },
                { role: 'quit' },
            ],
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { role: 'resetZoom' },
            ],
        },
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function openFileDialog(): Promise<void> {
    if (!mainWindow) { return; }

    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
            { name: 'Linker Files', extensions: ['map', 'ld', 'lds'] },
            { name: 'All Files', extensions: ['*'] },
        ],
    });

    if (!result.canceled && result.filePaths.length > 0) {
        loadFile(result.filePaths[0]);
    }
}

function loadFile(filePath: string): void {
    if (!mainWindow) { return; }

    const text = fs.readFileSync(filePath, 'utf8');
    const ext = path.extname(filePath).toLowerCase();
    let layout: MemoryLayout;

    if (ext === '.map' || isGccMapFile(text)) {
        layout = parseMap(text);
    } else {
        layout = parseLd(text);
    }

    layout.sourceFile = filePath;
    mainWindow.setTitle(`GCC Map View — ${path.basename(filePath)}`);
    mainWindow.webContents.send('main-message', { type: 'updateLayout', layout, sourceText: text, fileName: path.basename(filePath) });
}

// IPC: renderer → main
ipcMain.on('renderer-message', (_event: IpcMainEvent, msg: { type: string }) => {
    // Handle messages from renderer (e.g., selectSection, selectSymbol)
    if (msg.type === 'selectSection' || msg.type === 'selectSymbol') {
        // In standalone app, highlight is handled in renderer; nothing to do here
    }
});

// Handle file opened via drag-and-drop or command line
ipcMain.on('drop-file', (_event: IpcMainEvent, filePath: string) => {
    loadFile(filePath);
});

app.whenReady().then(() => {
    buildMenu();
    createWindow();

    // Handle files passed as command-line arguments
    const args = process.argv.slice(app.isPackaged ? 1 : 2);
    for (const arg of args) {
        if (fs.existsSync(arg)) {
            // Delay to ensure window is loaded
            mainWindow?.webContents.once('did-finish-load', () => {
                loadFile(arg);
            });
            break;
        }
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
