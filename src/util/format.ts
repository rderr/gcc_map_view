export function formatHex(value: number, width: number = 8): string {
    return '0x' + value.toString(16).toUpperCase().padStart(width, '0');
}

export function formatSize(bytes: number): string {
    if (bytes === 0) { return '0'; }
    if (bytes >= 1024 * 1024 && bytes % (1024 * 1024) === 0) {
        return `${bytes / (1024 * 1024)}M`;
    }
    if (bytes >= 1024 && bytes % 1024 === 0) {
        return `${bytes / 1024}K`;
    }
    return `${bytes}`;
}

export function formatSizeReadable(bytes: number): string {
    if (bytes >= 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    if (bytes >= 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${bytes} B`;
}

export function parseSize(value: string): number {
    const trimmed = value.trim();

    // Hex number
    if (/^0x[0-9a-fA-F]+$/i.test(trimmed)) {
        return parseInt(trimmed, 16);
    }

    // Number with K/M suffix
    const match = trimmed.match(/^(\d+)\s*([KkMm])$/);
    if (match) {
        const num = parseInt(match[1], 10);
        const suffix = match[2].toUpperCase();
        if (suffix === 'K') { return num * 1024; }
        if (suffix === 'M') { return num * 1024 * 1024; }
    }

    // Plain decimal number
    const num = parseInt(trimmed, 10);
    return isNaN(num) ? 0 : num;
}

export function usagePercent(used: number, total: number): string {
    if (total === 0) { return '0%'; }
    return `${((used / total) * 100).toFixed(1)}%`;
}
