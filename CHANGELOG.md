# Changelog

All notable changes to the GCC Map View extension will be documented in this file.

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
