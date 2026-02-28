# Changelog

All notable changes to the GCC Map View extension will be documented in this file.

## [0.3.0] - 2026-02-28

### Added
- Redesigned memory map with stacked section blocks and a click-to-expand detail panel
- Detail panel shows every symbol as a proportional row with name, address, and size
- Sort symbols by address or size in the detail panel
- SVG connector lines linking sections to their detail view
- Collapsible statistics panel with per-region usage bars and Top 10 largest symbols
- Clickable Top 10 symbols list that triggers search
- Symbol search bar with instant results dropdown
- Go-to-source button on symbol rows — navigates to the actual source file, not the map file
- "Find in Memory Map" right-click context menu for source files (C, C++, Rust, Zig, assembly, D)
- Auto-open memory map webview when a `.map` file is opened
- Sticky top bar keeps stats and search visible while scrolling
- Support for 16-digit hex addresses (STM32 and other Cortex-M map files)
- Discarded input section tracking with byte count and symbol count
- Unit tests for map parser and symbol utilities using sample STM32 map files

### Changed
- Removed tree view sidebar — the graphical memory map is now the primary interface
- Removed standalone Electron app
- Simplified to section-level editor decorations (no per-symbol coloring)
- All scroll animations changed to instant for snappier navigation

### Fixed
- Navigation to symbols in STM32 map files that use 16-digit hex addresses
- Case-insensitive hex address matching in map file navigation

## [0.2.1] - 2026-02-24

### Fixed
- Major performance improvement: cache parsed layout to skip redundant re-parsing on every editor focus
- Batch editor decorations by color (24 types max instead of one per symbol)
- Use event delegation in webview instead of thousands of per-element listeners
- Fix symbol navigation for ESP-IDF maps with duplicate names (e.g. .iram1.0.literal) by using address-based lookup
- Fix broken tooltip in memory map caused by data map key mismatch and incorrect mouse event handling

## [0.2.0] - 2026-02-24

### Added
- Color-coded source panel backgrounds matching the memory map section and symbol colors
- Per-symbol line highlighting using the same palette as the map view
- Standalone Electron app with tree view, memory map, and source panel
- Drag-and-drop file opening in the Electron app
- Virtual-scrolling source panel for efficient viewing of large map files

### Fixed
- Map click navigation now goes to the correct line for symbols with duplicate names
- Section colors are now unique across all memory regions using a global palette index

## [0.1.1] - 2026-02-22

### Fixed
- Webview memory map not loading due to incorrect resource paths in packaged extension
- Excluded large sample files from published package

## [0.1.0] - 2026-02-22

### Added
- Tree view for GCC linker script (`.ld`) memory regions and sections
- Tree view for GCC map file (`.map`) symbols with size information
- Graphical memory map webview with color-coded regions
- Symbol search and filtering
- Click-to-navigate from symbols to source files
- Automatic detection of `.ld` and `.map` files in workspace
- Linker script language support with syntax highlighting
