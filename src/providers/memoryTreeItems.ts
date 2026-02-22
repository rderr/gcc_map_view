import * as vscode from 'vscode';
import { MemoryRegion, Section, Symbol } from '../models/types';
import { formatHex, formatSize, formatSizeReadable, usagePercent } from '../util/format';

export type MemoryTreeItem = RegionTreeItem | SectionTreeItem | SymbolTreeItem;

export class RegionTreeItem extends vscode.TreeItem {
    constructor(public readonly region: MemoryRegion) {
        super(region.name, vscode.TreeItemCollapsibleState.Expanded);

        const used = region.used || region.sections.reduce((sum, s) => sum + s.size, 0);
        const pct = usagePercent(used, region.length);
        this.description = `${formatHex(region.origin)} | ${formatSize(region.length)} (${pct} used)`;
        this.tooltip = new vscode.MarkdownString(
            `**${region.name}**\n\n` +
            `- Origin: \`${formatHex(region.origin)}\`\n` +
            `- Length: \`${formatSizeReadable(region.length)}\`\n` +
            `- Used: \`${formatSizeReadable(used)}\` (${pct})\n` +
            `- Attributes: \`${region.attributes || 'none'}\``
        );
        this.iconPath = new vscode.ThemeIcon('chip');
        this.contextValue = 'region';
    }
}

export class SectionTreeItem extends vscode.TreeItem {
    constructor(public readonly section: Section) {
        super(
            section.name,
            section.symbols.length > 0
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None
        );

        this.description = `${formatHex(section.address)} | ${formatSizeReadable(section.size)}`;
        this.tooltip = new vscode.MarkdownString(
            `**${section.name}**\n\n` +
            `- Address: \`${formatHex(section.address)}\`\n` +
            `- Size: \`${formatSizeReadable(section.size)}\`\n` +
            (section.region ? `- Region: \`${section.region}\`\n` : '') +
            `- Symbols: ${section.symbols.length}`
        );
        this.iconPath = new vscode.ThemeIcon('symbol-namespace');
        this.contextValue = 'section';
    }
}

export class SymbolTreeItem extends vscode.TreeItem {
    constructor(public readonly symbol: Symbol) {
        super(symbol.name, vscode.TreeItemCollapsibleState.None);

        this.description = `${formatHex(symbol.address)}${symbol.size > 0 ? ' | ' + formatSizeReadable(symbol.size) : ''}`;
        this.tooltip = new vscode.MarkdownString(
            `**${symbol.name}**\n\n` +
            `- Address: \`${formatHex(symbol.address)}\`\n` +
            `- Size: \`${formatSizeReadable(symbol.size)}\`\n` +
            (symbol.sourceFile ? `- Source: \`${symbol.sourceFile}\`\n` : '')
        );
        this.iconPath = new vscode.ThemeIcon('symbol-variable');
        this.contextValue = 'symbol';
    }
}
