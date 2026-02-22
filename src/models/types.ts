export interface MemoryRegion {
    name: string;
    origin: number;
    length: number;
    attributes: string;
    sections: Section[];
    used: number; // computed: sum of section sizes
}

export interface Section {
    name: string;
    address: number;
    size: number;
    region?: string;
    symbols: Symbol[];
    loadAddress?: number;
    sourceLine?: number;    // 0-based line number in the source file
    sourceLineEnd?: number;  // 0-based last line of this section
}

export interface Symbol {
    name: string;
    address: number;
    size: number;
    section?: string;
    sourceFile?: string;
    sourceLine?: number; // 0-based line number in the map file
}

export interface MemoryLayout {
    regions: MemoryRegion[];
    sections: Section[];        // all sections (including those not assigned to a region)
    sourceFile?: string;
}
