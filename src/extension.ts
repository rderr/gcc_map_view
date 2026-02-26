import * as vscode from 'vscode';
import * as path from 'path';
import { parseLd } from './parsers/ldParser';
import { parseMap, isGccMapFile } from './parsers/mapParser';
import { MemoryMapPanel } from './providers/memoryMapPanel';
import { MemoryLayout } from './models/types';

// Current parsed layout
let currentLayout: MemoryLayout | undefined;

// 12-color colorblind-safe palette (Paul Tol qualitative scheme)
const PALETTE = [
    '#4477AA', '#66CCEE', '#228833', '#CCBB44', '#EE6677', '#AA3377',
    '#BBBBBB', '#EE8866', '#44BB99', '#99DDFF', '#EEDD88', '#FFAABB',
];

// Cache decoration types so we can dispose and recreate them
let activeDecorations: vscode.TextEditorDecorationType[] = [];

// Cache to avoid redundant re-parsing when the document hasn't changed
let lastParsedUri: string | undefined;
let lastParsedVersion: number | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('GCC Map View: activating');

    // Command: Show Memory Map webview
    context.subscriptions.push(
        vscode.commands.registerCommand('gccMapView.showMemoryMap', () => {
            if (!currentLayout) {
                vscode.window.showWarningMessage('No memory layout data. Open a .ld or .map file first.');
                return;
            }

            showMemoryMap(context, currentLayout);
        })
    );

    // Command: Refresh
    context.subscriptions.push(
        vscode.commands.registerCommand('gccMapView.refresh', () => {
            // Clear cache to force re-parse
            lastParsedUri = undefined;
            lastParsedVersion = undefined;
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                parseDocument(context, editor.document);
            }
        })
    );

    // Parse on active editor change — auto-open map panel for GCC map files
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                parseDocument(context, editor.document);
            }
        })
    );

    // Parse on file save
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument((doc) => {
            parseDocument(context, doc);
        })
    );

    // Parse the currently active document on startup
    if (vscode.window.activeTextEditor) {
        parseDocument(context, vscode.window.activeTextEditor.document);
    }
}

function showMemoryMap(context: vscode.ExtensionContext, layout: MemoryLayout, fileName?: string): void {
    const panel = MemoryMapPanel.createOrShow(context.extensionUri.fsPath);
    panel.updateLayout(layout);
    if (fileName) {
        panel.setTitle('Memory Map \u2014 ' + fileName);
    }

    // Webview click → navigate in editor
    panel.setOnSectionSelected((_sectionName, sourceLine) => {
        const section = findSection(_sectionName);
        const address = section?.address;
        if (address !== undefined) {
            goToAddress(address, _sectionName);
        } else {
            goToLine(sourceLine ?? section?.sourceLine);
        }
    });

    panel.setOnSymbolSelected((symbolName, _sectionName, address, sourceLine) => {
        if (address !== undefined) {
            goToAddress(address, symbolName);
        } else {
            goToLine(sourceLine);
        }
    });
}

function findSection(sectionName: string) {
    if (!currentLayout) { return undefined; }
    for (const region of currentLayout.regions) {
        for (const section of region.sections) {
            if (section.name === sectionName) { return section; }
        }
    }
    return undefined;
}

function parseDocument(context: vscode.ExtensionContext, document: vscode.TextDocument): void {
    const filePath = document.fileName;
    const ext = path.extname(filePath).toLowerCase();

    // Skip re-parsing if the document hasn't changed since last parse
    const docUri = document.uri.toString();
    if (docUri === lastParsedUri && document.version === lastParsedVersion) {
        return;
    }

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

    lastParsedUri = docUri;
    lastParsedVersion = document.version;

    currentLayout = layout;

    // Apply editor decorations for .map files
    if (ext === '.map' && layout) {
        const editor = vscode.window.visibleTextEditors.find(e => e.document === document);
        if (editor) {
            applyDecorations(editor, layout);
        }
    }

    // Auto-open or update the Memory Map panel
    var baseName = path.basename(filePath);
    if (layout) {
        if (MemoryMapPanel.getCurrent()) {
            // Panel already open — just update it
            MemoryMapPanel.getCurrent()!.updateLayout(layout);
            MemoryMapPanel.getCurrent()!.setTitle('Memory Map \u2014 ' + baseName);
        } else {
            // Auto-open panel for map/ld files
            showMemoryMap(context, layout, baseName);
        }
    }
}

function applyDecorations(editor: vscode.TextEditor, layout: MemoryLayout): void {
    // Dispose old decorations
    for (const d of activeDecorations) {
        d.dispose();
    }
    activeDecorations = [];

    // Pre-create one decoration type per palette color for symbols and sections.
    // This avoids creating thousands of individual decoration types.
    const symDecoTypes: vscode.TextEditorDecorationType[] = [];
    const symDecoRanges: vscode.Range[][] = [];
    const secDecoTypes: vscode.TextEditorDecorationType[] = [];
    const secDecoRanges: vscode.Range[][] = [];
    for (let c = 0; c < PALETTE.length; c++) {
        const color = PALETTE[c];
        symDecoTypes.push(vscode.window.createTextEditorDecorationType({
            backgroundColor: color + '55',
            isWholeLine: true,
            overviewRulerColor: color,
            overviewRulerLane: vscode.OverviewRulerLane.Left,
        }));
        symDecoRanges.push([]);
        secDecoTypes.push(vscode.window.createTextEditorDecorationType({
            backgroundColor: color + '55',
            isWholeLine: true,
            overviewRulerColor: color,
            overviewRulerLane: vscode.OverviewRulerLane.Left,
        }));
        secDecoRanges.push([]);
    }
    activeDecorations.push(...symDecoTypes, ...secDecoTypes);

    // Collect ranges grouped by color index
    let sectionIndex = 0;
    for (const region of layout.regions) {
        if (region.length === 0) { continue; }
        const sections = region.sections.slice().sort((a, b) => a.address - b.address);
        for (let i = 0; i < sections.length; i++) {
            const section = sections[i];
            const sectionColorIdx = sectionIndex % PALETTE.length;
            sectionIndex++;
            if (section.sourceLine === undefined || section.sourceLineEnd === undefined) { continue; }

            // Collect symbol lines with their colors (only symbols with size > 0, matching map view)
            const symbolLineSet = new Set<number>();
            const symbols = section.symbols || [];
            let visibleIndex = 0;
            for (const sym of symbols) {
                if (sym.size === 0) { continue; }
                if (sym.sourceLine !== undefined) {
                    const symColorIdx = visibleIndex % PALETTE.length;
                    symbolLineSet.add(sym.sourceLine);
                    symDecoRanges[symColorIdx].push(new vscode.Range(sym.sourceLine, 0, sym.sourceLine, 0));
                }
                visibleIndex++;
            }

            // Section band — build ranges that skip symbol lines
            let runStart = section.sourceLine;
            for (let line = section.sourceLine; line <= section.sourceLineEnd; line++) {
                if (symbolLineSet.has(line)) {
                    if (line > runStart) {
                        secDecoRanges[sectionColorIdx].push(new vscode.Range(runStart, 0, line - 1, 0));
                    }
                    runStart = line + 1;
                }
            }
            if (runStart <= section.sourceLineEnd) {
                secDecoRanges[sectionColorIdx].push(new vscode.Range(runStart, 0, section.sourceLineEnd, 0));
            }
        }
    }

    // Apply all decorations in batch (24 calls max instead of thousands)
    for (let c = 0; c < PALETTE.length; c++) {
        if (symDecoRanges[c].length > 0) {
            editor.setDecorations(symDecoTypes[c], symDecoRanges[c]);
        }
        if (secDecoRanges[c].length > 0) {
            editor.setDecorations(secDecoTypes[c], secDecoRanges[c]);
        }
    }
}

async function goToLine(sourceLine: number | undefined): Promise<void> {
    if (sourceLine === undefined || !currentLayout?.sourceFile) {
        return;
    }

    const uri = vscode.Uri.file(currentLayout.sourceFile);
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
 * Navigate to a symbol in the map file by searching for its hex address.
 */
async function goToAddress(address: number, symbolName?: string): Promise<void> {
    if (!currentLayout?.sourceFile) { return; }

    const uri = vscode.Uri.file(currentLayout.sourceFile);
    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc, {
        viewColumn: vscode.ViewColumn.One,
        preserveFocus: false,
    });

    const hexRaw = address.toString(16);
    const hexPadded = '0x' + hexRaw.padStart(8, '0');
    const hexMinimal = '0x' + hexRaw;
    const text = doc.getText();
    const lines = text.split('\n');

    let bestLine = -1;
    for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        if (ln.indexOf(hexPadded) === -1 && ln.indexOf(hexMinimal) === -1) { continue; }
        if (symbolName && ln.indexOf(symbolName) !== -1) {
            bestLine = i;
            break;
        }
        if (bestLine === -1) {
            bestLine = i;
        }
    }

    if (bestLine >= 0) {
        const range = new vscode.Range(bestLine, 0, bestLine, 0);
        editor.selection = new vscode.Selection(bestLine, 0, bestLine, 0);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }
}

export function deactivate() {}
