import * as vscode from 'vscode';
import * as path from 'path';
import { parseLd } from './parsers/ldParser';
import { parseMap, isGccMapFile } from './parsers/mapParser';
import { MemoryTreeProvider } from './providers/memoryTreeProvider';
import { MemoryMapPanel } from './providers/memoryMapPanel';
import { SectionTreeItem, SymbolTreeItem } from './providers/memoryTreeItems';
import { MemoryLayout } from './models/types';

let treeProvider: MemoryTreeProvider;
let treeView: vscode.TreeView<any>;

// 12-hue palette — same as webview SECTION_COLORS
const PALETTE = [
    '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4',
    '#42d4f4', '#f032e6', '#bfef45', '#fabed4', '#469990', '#dcbeff',
];

// Cache decoration types so we can dispose and recreate them
let activeDecorations: vscode.TextEditorDecorationType[] = [];

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

            // Webview -> tree + navigate: click section in webview reveals in tree and jumps in editor
            panel.setOnSectionSelected((sectionName) => {
                const item = treeProvider.findSectionItem(sectionName);
                if (item) {
                    treeView.reveal(item, { select: true, focus: false });
                    goToLine(item.section.sourceLine);
                }
            });

            // Webview -> tree: click symbol in webview reveals in tree and jumps in editor
            panel.setOnSymbolSelected((symbolName, sectionName) => {
                const item = treeProvider.findSymbolItem(symbolName, sectionName);
                if (item) {
                    treeView.reveal(item, { select: true, focus: false, expand: true });
                    goToLine(item.symbol.sourceLine);
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

    // Command: selectItem — handles clicks on section/symbol tree items
    context.subscriptions.push(
        vscode.commands.registerCommand('gccMapView.selectItem', (item: SectionTreeItem | SymbolTreeItem) => {
            const panel = MemoryMapPanel.getCurrent();
            if (item instanceof SectionTreeItem) {
                if (panel) {
                    panel.highlightSection(item.section.name);
                }
                goToLine(item.section.sourceLine);
            } else if (item instanceof SymbolTreeItem) {
                if (panel && item.symbol.section) {
                    panel.highlightSymbol(item.symbol.name, item.symbol.section);
                }
                goToLine(item.symbol.sourceLine);
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

    // Apply editor decorations for .map files
    if (ext === '.map' && layout) {
        const editor = vscode.window.visibleTextEditors.find(e => e.document === document);
        if (editor) {
            applyDecorations(editor, layout);
        }
    }

    // Update webview if open
    const panel = MemoryMapPanel.getCurrent();
    if (panel && layout) {
        panel.updateLayout(layout);
    }
}

function applyDecorations(editor: vscode.TextEditor, layout: MemoryLayout): void {
    // Dispose old decorations
    for (const d of activeDecorations) {
        d.dispose();
    }
    activeDecorations = [];

    // Assign each section a color from the 12-hue palette (cycling), matching the webview
    let sectionIndex = 0;
    for (const region of layout.regions) {
        for (const section of region.sections) {
            if (section.sourceLine === undefined || section.sourceLineEnd === undefined) { continue; }

            const baseColor = PALETTE[sectionIndex % PALETTE.length];
            sectionIndex++;

            const sectionDeco = vscode.window.createTextEditorDecorationType({
                backgroundColor: baseColor + '30', // ~19% opacity
                isWholeLine: true,
                overviewRulerColor: baseColor,
                overviewRulerLane: vscode.OverviewRulerLane.Left,
            });
            activeDecorations.push(sectionDeco);

            const sectionRange = new vscode.Range(section.sourceLine, 0, section.sourceLineEnd, 0);
            editor.setDecorations(sectionDeco, [sectionRange]);
        }
    }
}

async function goToLine(sourceLine: number | undefined): Promise<void> {
    const layout = treeProvider.getLayout();
    if (sourceLine === undefined || !layout?.sourceFile) {
        return;
    }

    const uri = vscode.Uri.file(layout.sourceFile);
    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc, {
        viewColumn: vscode.ViewColumn.One,
        preserveFocus: false,
    });

    const range = new vscode.Range(sourceLine, 0, sourceLine, 0);
    editor.selection = new vscode.Selection(sourceLine, 0, sourceLine, 0);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

export function deactivate() {}
