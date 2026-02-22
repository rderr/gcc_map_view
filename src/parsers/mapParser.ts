import { MemoryRegion, Section, Symbol, MemoryLayout } from '../models/types';

const enum State {
    SCANNING,
    MEMORY_CONFIG_HEADER,
    MEMORY_CONFIG,
    LINKER_MAP_SECTIONS,
}

export function isGccMapFile(text: string): boolean {
    const lines = text.split('\n', 50);
    return lines.some(l => /^Memory Configuration/i.test(l.trim()));
}

export function parseMap(text: string): MemoryLayout {
    const regions: MemoryRegion[] = [];
    const sections: Section[] = [];

    let state: State = State.SCANNING;
    let currentSection: Section | undefined;
    let pendingSymbolName: string | undefined;
    let pendingSymbolLine: number = 0;

    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        switch (state) {
            case State.SCANNING: {
                if (/^Memory Configuration\s*$/.test(trimmed)) {
                    state = State.MEMORY_CONFIG_HEADER;
                } else if (/^Linker script and memory map\s*$/i.test(trimmed)) {
                    state = State.LINKER_MAP_SECTIONS;
                }
                break;
            }

            case State.MEMORY_CONFIG_HEADER: {
                // Skip the "Name  Origin  Length  Attributes" header line
                if (/^Name\s+Origin\s+Length/.test(trimmed)) {
                    state = State.MEMORY_CONFIG;
                }
                break;
            }

            case State.MEMORY_CONFIG: {
                if (!trimmed) {
                    // Empty line marks end of memory config
                    state = State.SCANNING;
                    break;
                }
                if (/^Linker script and memory map/i.test(trimmed)) {
                    state = State.LINKER_MAP_SECTIONS;
                    break;
                }

                // Parse: NAME  0xADDRESS  0xLENGTH  attrs
                const memMatch = trimmed.match(
                    /^(\S+)\s+(0x[0-9a-fA-F]+)\s+(0x[0-9a-fA-F]+)\s*(.*)?$/
                );
                if (memMatch) {
                    const name = memMatch[1];
                    if (name === '*default*') { break; }
                    regions.push({
                        name,
                        origin: parseInt(memMatch[2], 16),
                        length: parseInt(memMatch[3], 16),
                        attributes: memMatch[4]?.trim() ?? '',
                        sections: [],
                        used: 0,
                    });
                }
                break;
            }

            case State.LINKER_MAP_SECTIONS: {
                if (/^Cross Reference Table/i.test(trimmed)) {
                    // Close last section's line range
                    if (currentSection && currentSection.sourceLine !== undefined && currentSection.sourceLineEnd === undefined) {
                        currentSection.sourceLineEnd = i - 1;
                    }
                    state = State.SCANNING;
                    break;
                }

                // Output section header: starts at column 0 with .name
                // Format: ".text           0x00000000    0x1234"
                // Sometimes section name is on its own line, address+size on next
                const outputSectionMatch = line.match(
                    /^(\.[a-zA-Z_][\w.]*)\s+(0x[0-9a-fA-F]+)\s+(0x[0-9a-fA-F]+)/
                );
                if (outputSectionMatch) {
                    // Close previous section's line range
                    if (currentSection && currentSection.sourceLine !== undefined) {
                        currentSection.sourceLineEnd = i - 1;
                    }
                    currentSection = {
                        name: outputSectionMatch[1],
                        address: parseInt(outputSectionMatch[2], 16),
                        size: parseInt(outputSectionMatch[3], 16),
                        symbols: [],
                        sourceLine: i,
                    };
                    sections.push(currentSection);
                    pendingSymbolName = undefined;
                    break;
                }

                // Section name alone on a line (long name wraps)
                const sectionNameOnly = line.match(/^(\.[a-zA-Z_][\w.]*)\s*$/);
                if (sectionNameOnly) {
                    // Peek at next line for address+size
                    if (i + 1 < lines.length) {
                        const nextLine = lines[i + 1];
                        const addrSize = nextLine.match(
                            /^\s+(0x[0-9a-fA-F]+)\s+(0x[0-9a-fA-F]+)/
                        );
                        if (addrSize) {
                            // Close previous section's line range
                            if (currentSection && currentSection.sourceLine !== undefined) {
                                currentSection.sourceLineEnd = i - 1;
                            }
                            currentSection = {
                                name: sectionNameOnly[1],
                                address: parseInt(addrSize[1], 16),
                                size: parseInt(addrSize[2], 16),
                                symbols: [],
                                sourceLine: i,
                            };
                            sections.push(currentSection);
                            pendingSymbolName = undefined;
                            i++; // skip the next line
                        }
                    }
                    break;
                }

                // Input section or symbol line (indented)
                // Format: " .text.func    0x00000100    0x20  file.o"
                if (currentSection && /^\s/.test(line)) {
                    // Symbol with address + size + source
                    const symbolMatch = trimmed.match(
                        /^(\S+)\s+(0x[0-9a-fA-F]+)\s+(0x[0-9a-fA-F]+)\s+(.+)?$/
                    );
                    if (symbolMatch) {
                        const symName = symbolMatch[1];
                        const addr = parseInt(symbolMatch[2], 16);
                        const size = parseInt(symbolMatch[3], 16);
                        const sourceFile = symbolMatch[4]?.trim();

                        // Skip fill entries
                        if (/^\*fill\*$/.test(symName)) { break; }

                        currentSection.symbols.push({
                            name: symName,
                            address: addr,
                            size,
                            section: currentSection.name,
                            sourceFile,
                            sourceLine: i,
                        });
                        pendingSymbolName = undefined;
                        break;
                    }

                    // Symbol name on its own line (long name wraps)
                    const nameOnly = trimmed.match(/^(\S+)\s*$/);
                    if (nameOnly && !nameOnly[1].startsWith('0x')) {
                        pendingSymbolName = nameOnly[1];
                        pendingSymbolLine = i;
                        break;
                    }

                    // Address + size continuation of a wrapped symbol name
                    if (pendingSymbolName) {
                        const contMatch = trimmed.match(
                            /^(0x[0-9a-fA-F]+)\s+(0x[0-9a-fA-F]+)\s*(.*)?$/
                        );
                        if (contMatch) {
                            currentSection.symbols.push({
                                name: pendingSymbolName,
                                address: parseInt(contMatch[1], 16),
                                size: parseInt(contMatch[2], 16),
                                section: currentSection.name,
                                sourceFile: contMatch[3]?.trim() || undefined,
                                sourceLine: pendingSymbolLine,
                            });
                            pendingSymbolName = undefined;
                            break;
                        }
                    }

                    // Standalone symbol definition: " 0xADDRESS  symbolname"
                    const standaloneSym = trimmed.match(
                        /^(0x[0-9a-fA-F]+)\s+(\S+)\s*$/
                    );
                    if (standaloneSym) {
                        currentSection.symbols.push({
                            name: standaloneSym[2],
                            address: parseInt(standaloneSym[1], 16),
                            size: 0,
                            section: currentSection.name,
                            sourceLine: i,
                        });
                        pendingSymbolName = undefined;
                    }
                }
                break;
            }
        }
    }

    // Close last section if still open
    if (currentSection && currentSection.sourceLine !== undefined && currentSection.sourceLineEnd === undefined) {
        currentSection.sourceLineEnd = lines.length - 1;
    }

    // Assign sections to regions by address range
    for (const section of sections) {
        if (section.size === 0) { continue; }
        for (const region of regions) {
            const regionEnd = region.origin + region.length;
            if (section.address >= region.origin && section.address < regionEnd) {
                section.region = region.name;
                region.sections.push(section);
                region.used += section.size;
                break;
            }
        }
    }

    return { regions, sections };
}
