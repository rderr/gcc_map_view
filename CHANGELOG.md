# Changelog

All notable changes to the GCC Map View extension will be documented in this file.

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
