import * as vscode from 'vscode';
import * as path from 'path';
import { parseLd } from './parsers/ldParser';
import { parseMap, isGccMapFile } from './parsers/mapParser';
import { MemoryTreeProvider } from './providers/memoryTreeProvider';
import { MemoryMapPanel } from './providers/memoryMapPanel';
import { SectionTreeItem } from './providers/memoryTreeItems';
import { MemoryLayout } from './models/types';

let treeProvider: MemoryTreeProvider;
let treeView: vscode.TreeView<any>;

export function activate(context: vscode.ExtensionContext) {
    console.log('GCC Map View: activating');
    treeProvider = new MemoryTreeProvider();

    treeView = vscode.window.createTreeView('memoryMapTree', {
        treeDataProvider: treeProvider,
        showCollapseAll: true,
    });

    // Command: Show Memory Map webview
    context.subscriptions.push(
        vscode.commands.registerCommand('gccMapView.showMemoryMap', () => {
            const layout = treeProvider.getLayout();
            if (!layout) {
                vscode.window.showWarningMessage('No memory layout data. Open a .ld or .map file first.');
                return;
            }

            const panel = MemoryMapPanel.createOrShow(context.extensionUri.fsPath);
            panel.updateLayout(layout);

            // Webview -> tree: click section in webview reveals in tree
            panel.setOnSectionSelected((sectionName) => {
                const item = treeProvider.findSectionItem(sectionName);
                if (item) {
                    treeView.reveal(item, { select: true, focus: true });
                }
            });
        })
    );

    // Command: Refresh
    context.subscriptions.push(
        vscode.commands.registerCommand('gccMapView.refresh', () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                parseDocument(editor.document);
            }
        })
    );

    // Command: Open file
    context.subscriptions.push(
        vscode.commands.registerCommand('gccMapView.openFile', async () => {
            const uris = await vscode.window.showOpenDialog({
                canSelectMany: false,
                filters: {
                    'Linker Files': ['ld', 'lds', 'map'],
                },
            });
            if (uris && uris.length > 0) {
                const doc = await vscode.workspace.openTextDocument(uris[0]);
                await vscode.window.showTextDocument(doc);
            }
        })
    );

    // Tree -> webview: click section in tree highlights in webview
    context.subscriptions.push(
        treeView.onDidChangeSelection((e) => {
            const selected = e.selection[0];
            if (selected instanceof SectionTreeItem) {
                const panel = MemoryMapPanel.getCurrent();
                if (panel) {
                    panel.highlightSection(selected.section.name);
                }
            }
        })
    );

    // Parse on active editor change
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                parseDocument(editor.document);
            }
        })
    );

    // Parse on file save
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument((doc) => {
            parseDocument(doc);
        })
    );

    // Parse the currently active document on startup
    if (vscode.window.activeTextEditor) {
        parseDocument(vscode.window.activeTextEditor.document);
    }

    context.subscriptions.push(treeView);
}

function parseDocument(document: vscode.TextDocument): void {
    const filePath = document.fileName;
    const ext = path.extname(filePath).toLowerCase();
    const text = document.getText();

    let layout: MemoryLayout | undefined;

    if (ext === '.ld' || ext === '.lds') {
        layout = parseLd(text);
        layout.sourceFile = filePath;
    } else if (ext === '.map') {
        // Verify it's a GCC linker map, not a JS source map
        if (!isGccMapFile(text)) {
            return;
        }
        layout = parseMap(text);
        layout.sourceFile = filePath;
    } else {
        return;
    }

    treeProvider.setLayout(layout);

    // Update webview if open
    const panel = MemoryMapPanel.getCurrent();
    if (panel && layout) {
        panel.updateLayout(layout);
    }
}

export function deactivate() {}
