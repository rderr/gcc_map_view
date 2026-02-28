/**
 * Extract a source filename from a linker object reference.
 * Examples:
 *   "libmain.a(main.c.obj)"          → "main.c"
 *   "build/main.o"                    → "main"
 *   "lib/libfoo.a(bar.cpp.obj)"       → "bar.cpp"
 */
export function extractSourceName(objRef: string): string | undefined {
    if (!objRef) { return undefined; }

    // Pattern: lib.a(file.c.obj) or lib.a(file.cpp.obj)
    const archiveMatch = objRef.match(/\(([^)]+)\)\s*$/);
    const inner = archiveMatch ? archiveMatch[1] : objRef;

    // Strip trailing .obj or .o
    let name = inner.replace(/\.obj$/i, '').replace(/\.o$/i, '');

    // Get just the filename part (no directory)
    name = name.replace(/\\/g, '/');
    const lastSlash = name.lastIndexOf('/');
    if (lastSlash >= 0) {
        name = name.substring(lastSlash + 1);
    }

    return name || undefined;
}

/**
 * Extract a clean function/variable name from a linker symbol name.
 * Examples:
 *   ".text.app_main"       → "app_main"
 *   ".rodata.str1.1"       → "str1.1"
 *   "main"                 → "main"
 */
export function extractSymbolName(symName: string): string {
    // Strip known section prefixes like .text. .rodata. .bss. .data.
    const prefixMatch = symName.match(/^\.(text|rodata|data|bss|literal)\.(.*)/);
    if (prefixMatch) {
        return prefixMatch[2];
    }
    return symName;
}

/**
 * Generate all hex address search variants for a given numeric address.
 * Returns 8-digit, 16-digit, and minimal hex strings.
 */
export function hexVariants(address: number): { hex8: string; hex16: string; hexMin: string } {
    const hexRaw = address.toString(16);
    return {
        hex8: '0x' + hexRaw.padStart(8, '0'),
        hex16: '0x' + hexRaw.padStart(16, '0'),
        hexMin: '0x' + hexRaw,
    };
}
