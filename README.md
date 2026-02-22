# GCC Map View

A Visual Studio Code extension that visualizes GCC map files (`.map`) with an interactive tree view and graphical memory map.

Works with any GCC-based toolchain — from embedded targets (STM32, ESP32) to x86/x64 Linux builds.

## Features

### Memory Layout Tree

Browse your memory layout as a hierarchical tree: **Regions > Sections > Symbols**. Each node shows its address, size, and usage. Click any section or symbol to jump to its definition in the editor.

### Graphical Memory Map

Open a color-coded visualization of your memory regions with proportional section blocks and symbol grids. Hover for details, click to navigate. The webview stays in sync with the tree view and editor.

### Search & Filter Symbols

Use the search icon in the tree title bar to filter symbols by name. Matching regions and sections auto-expand so results are immediately visible. Clear the filter to restore the full tree.

### Editor Decorations

`.map` files get color-coded background highlights on each section, with matching overview ruler markers for quick orientation.

### Go to Source

Double-click any symbol to jump to its definition in your workspace. The extension extracts source filenames from map file object references and searches your workspace automatically.

### Bidirectional Navigation

Click a section in the webview to reveal it in the tree and editor. Click a tree item to highlight it in the webview and jump to the source line. Everything stays connected.

## Supported Files

| Extension | Description |
|-----------|-------------|
| `.map` | GCC linker map files (auto-detected; JS source maps are ignored) |

## Commands

| Command | Description | Icon |
|---------|-------------|------|
| **Show Memory Map** | Open the graphical memory map webview | `$(graph)` |
| **Refresh Memory Map** | Re-parse the active file | `$(refresh)` |
| **Open Map File** | Browse and open a `.map` file | `$(file)` |
| **Search Symbols** | Filter the tree by symbol name | `$(search)` |
| **Clear Search** | Remove the active filter | `$(clear-all)` |
| **Open Source File** | Navigate to a symbol's source file (context menu) | `$(go-to-file)` |

## Getting Started

1. Install the extension
2. Open a `.map` file
3. The **GCC Memory Map** sidebar appears automatically with the parsed layout
4. Click the graph icon in the tree title bar to open the graphical memory map

## Development

### Prerequisites

- Node.js 20+
- VS Code 1.85+

### Build

```bash
npm install
npm run compile
```

### Watch

```bash
npm run watch
```

### Run

Press **F5** in VS Code to launch the Extension Development Host.

### Project Structure

```
src/
├── extension.ts              # Extension entry point
├── models/
│   └── types.ts              # Data models (MemoryRegion, Section, Symbol)
├── parsers/
│   ├── ldParser.ts           # Linker script parser
│   └── mapParser.ts          # Map file parser
├── providers/
│   ├── memoryTreeProvider.ts # Tree data provider with filtering
│   ├── memoryTreeItems.ts    # Tree item classes (Region, Section, Symbol)
│   └── memoryMapPanel.ts     # Webview panel (graphical map)
├── util/
│   └── format.ts             # Hex/size formatting utilities
└── webview/
    ├── memoryMap.html        # Webview template
    ├── memoryMap.css         # Webview styles
    └── memoryMap.js          # Webview rendering logic
```

## License

See [LICENSE](LICENSE) for details.
