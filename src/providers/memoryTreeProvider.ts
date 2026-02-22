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

    setLayout(layout: MemoryLayout | undefined): void {
        this.layout = layout;
        this._onDidChangeTreeData.fire(undefined);
    }

    getLayout(): MemoryLayout | undefined {
        return this.layout;
    }

    getTreeItem(element: MemoryTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: MemoryTreeItem): MemoryTreeItem[] {
        if (!this.layout) { return []; }

        // Root level: show regions
        if (!element) {
            return this.layout.regions
                .filter(r => r.sections.length > 0 || r.length > 0)
                .map(r => new RegionTreeItem(r));
        }

        // Region -> Sections
        if (element instanceof RegionTreeItem) {
            return element.region.sections.map(s => new SectionTreeItem(s));
        }

        // Section -> Symbols
        if (element instanceof SectionTreeItem) {
            return element.section.symbols.map(s => new SymbolTreeItem(s));
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
}
