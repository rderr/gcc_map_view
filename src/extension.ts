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

// 12-color colorblind-safe palette (Paul Tol qualitative scheme)
const PALETTE = [
    '#4477AA', '#66CCEE', '#228833', '#CCBB44', '#EE6677', '#AA3377',
    '#BBBBBB', '#EE8866', '#44BB99', '#99DDFF', '#EEDD88', '#FFAABB',
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

    // Command: selectItem — handles single-clicks on section/symbol tree items
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

    // Command: openSymbolSource — handles double-clicks on symbol tree items
    context.subscriptions.push(
        vscode.commands.registerCommand('gccMapView.openSymbolSource', async (item: SymbolTreeItem) => {
            if (!(item instanceof SymbolTreeItem)) { return; }
            await goToSymbolSource(item.symbol.name, item.symbol.sourceFile);
        })
    );

    // Command: Search/filter symbols
    context.subscriptions.push(
        vscode.commands.registerCommand('gccMapView.search', async () => {
            const value = await vscode.window.showInputBox({
                prompt: 'Filter symbols by name',
                placeHolder: 'Symbol name...',
                value: treeProvider.getFilter() ?? '',
            });
            if (value !== undefined) {
                treeProvider.setFilter(value || undefined);
                vscode.commands.executeCommand('setContext', 'gccMapView.filterActive', !!value);
            }
        })
    );

    // Command: Clear search filter
    context.subscriptions.push(
        vscode.commands.registerCommand('gccMapView.clearSearch', () => {
            treeProvider.setFilter(undefined);
            vscode.commands.executeCommand('setContext', 'gccMapView.filterActive', false);
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

    // Assign each section a color from the 12-hue palette (cycling), matching the webview map.
    // Uses a global running index across all regions so every section gets a distinct color.
    let sectionIndex = 0;
    for (const region of layout.regions) {
        if (region.length === 0) { continue; }
        const sections = region.sections.slice().sort((a, b) => a.address - b.address);
        for (let i = 0; i < sections.length; i++) {
            const section = sections[i];
            const baseColor = PALETTE[sectionIndex % PALETTE.length];
            sectionIndex++;
            if (section.sourceLine === undefined || section.sourceLineEnd === undefined) { continue; }

            const sectionDeco = vscode.window.createTextEditorDecorationType({
                backgroundColor: baseColor + '55', // ~33% opacity
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

/**
 * Extract a bare symbol name from a map-file symbol like ".text.myFunc" → "myFunc".
 */
function extractBareName(symName: string): string {
    // Strip leading section prefixes: .text., .bss., .data., .rodata., .literal., etc.
    const m = symName.match(/^\.[a-zA-Z_]+\.(.+)$/);
    return m ? m[1] : symName;
}

/**
 * Extract a source filename from the map-file object reference.
 * Examples:
 *   "esp-idf/LED_test/libtest.a(test_led.c.obj)" → "test_led.c"
 *   "CMakeFiles/hub.elf.dir/main.c.obj"           → "main.c"
 *   "C:/path/to/libpp.a(pp.o)"                    → "pp.c" (guess .c from .o)
 */
function extractSourceName(objRef: string): string | undefined {
    if (!objRef) { return undefined; }

    // Archive member: lib.a(file.c.obj) or lib.a(file.o)
    const archiveMatch = objRef.match(/\(([^)]+)\)/);
    if (archiveMatch) {
        let name = archiveMatch[1];
        name = name.replace(/\.obj$/, '').replace(/\.o$/, '');
        // If it doesn't have an extension, guess .c
        if (!/\.\w+$/.test(name)) { name += '.c'; }
        return name;
    }

    // Direct object file: path/to/file.c.obj
    const base = objRef.split(/[/\\]/).pop() || objRef;
    let name = base.replace(/\.obj$/, '').replace(/\.o$/, '');
    if (!/\.\w+$/.test(name)) { name += '.c'; }
    return name;
}

async function goToSymbolSource(symName: string, sourceFile?: string): Promise<void> {
    const sourceName = sourceFile ? extractSourceName(sourceFile) : undefined;
    if (!sourceName) {
        vscode.window.showInformationMessage('No source file information for this symbol.');
        return;
    }

    // Search for the source file in the workspace
    const pattern = `**/${sourceName}`;
    const uris = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 10);

    if (uris.length === 0) {
        vscode.window.showInformationMessage(`Could not find "${sourceName}" in the workspace.`);
        return;
    }

    // If multiple matches, pick the first (could improve with a picker)
    const targetUri = uris.length === 1 ? uris[0] : uris[0];

    const doc = await vscode.workspace.openTextDocument(targetUri);
    const editor = await vscode.window.showTextDocument(doc, {
        viewColumn: vscode.ViewColumn.One,
        preserveFocus: false,
    });

    // Search for the bare symbol name in the file
    const bareName = extractBareName(symName);
    const text = doc.getText();
    const lines = text.split('\n');

    // Look for a definition-like line: function definition or variable declaration
    let bestLine = -1;
    const nameRegex = new RegExp('\\b' + escapeRegex(bareName) + '\\b');
    for (let i = 0; i < lines.length; i++) {
        if (nameRegex.test(lines[i])) {
            bestLine = i;
            break;
        }
    }

    if (bestLine >= 0) {
        const range = new vscode.Range(bestLine, 0, bestLine, 0);
        editor.selection = new vscode.Selection(bestLine, 0, bestLine, 0);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function deactivate() {}
