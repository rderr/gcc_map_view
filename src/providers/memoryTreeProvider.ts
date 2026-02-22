import * as vscode from 'vscode';
import { MemoryLayout } from '../models/types';
import {
    MemoryTreeItem,
    RegionTreeItem,
    SectionTreeItem,
    SymbolTreeItem,
} from './memoryTreeItems';

export class MemoryTreeProvider implements vscode.TreeDataProvider<MemoryTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<MemoryTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private layout: MemoryLayout | undefined;
    private filterText: string | undefined;

    setLayout(layout: MemoryLayout | undefined): void {
        this.layout = layout;
        this._onDidChangeTreeData.fire(undefined);
    }

    getLayout(): MemoryLayout | undefined {
        return this.layout;
    }

    setFilter(text: string | undefined): void {
        this.filterText = text;
        this._onDidChangeTreeData.fire(undefined);
    }

    getFilter(): string | undefined {
        return this.filterText;
    }

    getTreeItem(element: MemoryTreeItem): vscode.TreeItem {
        // When filtering, auto-expand regions and sections so matches are visible
        if (this.filterText && (element instanceof RegionTreeItem || element instanceof SectionTreeItem)) {
            element.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        }
        return element;
    }

    getChildren(element?: MemoryTreeItem): MemoryTreeItem[] {
        if (!this.layout) { return []; }

        const filter = this.filterText?.toLowerCase();

        // Root level: show regions
        if (!element) {
            let regions = this.layout.regions
                .filter(r => r.sections.length > 0 || r.length > 0);
            if (filter) {
                // Only show regions that contain matching symbols
                regions = regions.filter(r =>
                    r.sections.some(s =>
                        s.symbols.some(sym => sym.name.toLowerCase().includes(filter))
                    )
                );
            }
            return regions.map(r => new RegionTreeItem(r));
        }

        // Region -> Sections
        if (element instanceof RegionTreeItem) {
            let sections = element.region.sections;
            if (filter) {
                sections = sections.filter(s =>
                    s.symbols.some(sym => sym.name.toLowerCase().includes(filter))
                );
            }
            return sections.map(s => new SectionTreeItem(s));
        }

        // Section -> Symbols
        if (element instanceof SectionTreeItem) {
            let symbols = element.section.symbols;
            if (filter) {
                symbols = symbols.filter(sym => sym.name.toLowerCase().includes(filter));
            }
            return symbols.map(s => new SymbolTreeItem(s));
        }

        return [];
    }

    getParent(element: MemoryTreeItem): MemoryTreeItem | undefined {
        if (!this.layout) { return undefined; }

        if (element instanceof SymbolTreeItem) {
            const sym = element.symbol;
            for (const region of this.layout.regions) {
                for (const section of region.sections) {
                    if (section.symbols.includes(sym)) {
                        return new SectionTreeItem(section);
                    }
                }
            }
        }

        if (element instanceof SectionTreeItem) {
            const sec = element.section;
            for (const region of this.layout.regions) {
                if (region.sections.includes(sec)) {
                    return new RegionTreeItem(region);
                }
            }
        }

        return undefined;
    }

    findSectionItem(sectionName: string): SectionTreeItem | undefined {
        if (!this.layout) { return undefined; }
        for (const region of this.layout.regions) {
            const section = region.sections.find(s => s.name === sectionName);
            if (section) {
                return new SectionTreeItem(section);
            }
        }
        return undefined;
    }

    findSymbolItem(symbolName: string, sectionName: string): SymbolTreeItem | undefined {
        if (!this.layout) { return undefined; }
        for (const region of this.layout.regions) {
            for (const section of region.sections) {
                if (section.name !== sectionName) { continue; }
                const symbol = section.symbols.find(s => s.name === symbolName);
                if (symbol) {
                    return new SymbolTreeItem(symbol);
                }
            }
        }
        return undefined;
    }
}
