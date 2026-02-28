import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { parseMap, isGccMapFile } from '../src/parsers/mapParser';

const SAMPLES_DIR = path.join(__dirname, '..', '..', 'samples');

function loadSample(name: string): string {
    return fs.readFileSync(path.join(SAMPLES_DIR, name), 'utf-8');
}

describe('isGccMapFile', () => {
    it('should detect a GCC map file', () => {
        const text = loadSample('stm32f4.map');
        assert.strictEqual(isGccMapFile(text), true);
    });

    it('should reject a non-map file', () => {
        assert.strictEqual(isGccMapFile('hello world\nfoo bar\n'), false);
    });
});

describe('parseMap — STM32F4', () => {
    let result: ReturnType<typeof parseMap>;

    before(() => {
        result = parseMap(loadSample('stm32f4.map'));
    });

    // ── Memory regions ──
    it('should parse 3 memory regions (FLASH, RAM, CCMRAM)', () => {
        const names = result.regions.map(r => r.name);
        assert.deepStrictEqual(names, ['FLASH', 'RAM', 'CCMRAM']);
    });

    it('should parse FLASH origin as 0x08000000', () => {
        const flash = result.regions.find(r => r.name === 'FLASH')!;
        assert.strictEqual(flash.origin, 0x08000000);
    });

    it('should parse FLASH length as 512K (0x80000)', () => {
        const flash = result.regions.find(r => r.name === 'FLASH')!;
        assert.strictEqual(flash.length, 0x80000);
    });

    it('should parse RAM origin as 0x20000000', () => {
        const ram = result.regions.find(r => r.name === 'RAM')!;
        assert.strictEqual(ram.origin, 0x20000000);
    });

    it('should parse RAM length as 128K (0x20000)', () => {
        const ram = result.regions.find(r => r.name === 'RAM')!;
        assert.strictEqual(ram.length, 0x20000);
    });

    it('should parse CCMRAM origin as 0x10000000', () => {
        const ccmram = result.regions.find(r => r.name === 'CCMRAM')!;
        assert.strictEqual(ccmram.origin, 0x10000000);
    });

    it('should parse region attributes', () => {
        const flash = result.regions.find(r => r.name === 'FLASH')!;
        assert.strictEqual(flash.attributes, 'xr');
        const ram = result.regions.find(r => r.name === 'RAM')!;
        assert.strictEqual(ram.attributes, 'xrw');
    });

    // ── Sections ──
    it('should parse output sections', () => {
        const sectionNames = result.sections.map(s => s.name);
        assert.ok(sectionNames.includes('.isr_vector'), 'missing .isr_vector');
        assert.ok(sectionNames.includes('.text'), 'missing .text');
        assert.ok(sectionNames.includes('.rodata'), 'missing .rodata');
        assert.ok(sectionNames.includes('.data'), 'missing .data');
        assert.ok(sectionNames.includes('.bss'), 'missing .bss');
    });

    it('should parse .isr_vector at 0x08000000 with correct size', () => {
        const isr = result.sections.find(s => s.name === '.isr_vector')!;
        assert.strictEqual(isr.address, 0x08000000);
        assert.strictEqual(isr.size, 0x188);
    });

    it('should parse .text section address and size', () => {
        const text = result.sections.find(s => s.name === '.text')!;
        assert.strictEqual(text.address, 0x08000188);
        assert.strictEqual(text.size, 0x2e64);
    });

    it('should assign FLASH sections to the FLASH region', () => {
        const text = result.sections.find(s => s.name === '.text')!;
        assert.strictEqual(text.region, 'FLASH');
    });

    it('should assign RAM sections to the RAM region', () => {
        const data = result.sections.find(s => s.name === '.data')!;
        assert.strictEqual(data.region, 'RAM');
        const bss = result.sections.find(s => s.name === '.bss')!;
        assert.strictEqual(bss.region, 'RAM');
    });

    it('should compute used bytes for FLASH region', () => {
        const flash = result.regions.find(r => r.name === 'FLASH')!;
        assert.ok(flash.used > 0, 'FLASH used should be > 0');
        // .isr_vector (0x188) + .text (0x2e64) + .rodata (0x124) = 0x3110
        assert.strictEqual(flash.used, 0x188 + 0x2e64 + 0x124);
    });

    it('should compute used bytes for RAM region', () => {
        const ram = result.regions.find(r => r.name === 'RAM')!;
        // .data (0x1c) + .bss (0x120) = 0x13c
        assert.strictEqual(ram.used, 0x1c + 0x120);
    });

    // ── Symbols (16-digit hex addresses) ──
    it('should parse symbols with 16-digit hex addresses', () => {
        const text = result.sections.find(s => s.name === '.text')!;
        const main = text.symbols.find(s => s.name === '.text.main' || s.name === 'main');
        assert.ok(main, 'should find main symbol in .text');
        assert.strictEqual(main!.address, 0x080001c4);
    });

    it('should parse Reset_Handler symbol', () => {
        const isr = result.sections.find(s => s.name === '.isr_vector');
        const text = result.sections.find(s => s.name === '.text')!;
        // Reset_Handler is a standalone symbol in .text section
        const resetHandler = text.symbols.find(s => s.name === 'Reset_Handler');
        assert.ok(resetHandler, 'should find Reset_Handler');
        assert.strictEqual(resetHandler!.address, 0x08000188);
    });

    it('should parse wrapped symbol names (name on separate line)', () => {
        const text = result.sections.find(s => s.name === '.text')!;
        // .text.SystemInit wraps to next line in the map file
        const systemInit = text.symbols.find(s =>
            s.name === '.text.SystemInit' || s.name === 'SystemInit'
        );
        assert.ok(systemInit, 'should find SystemInit');
        assert.strictEqual(systemInit!.address, 0x080002e4);
        assert.strictEqual(systemInit!.size, 0x48);
    });

    it('should include source file references for symbols', () => {
        const text = result.sections.find(s => s.name === '.text')!;
        const mainSym = text.symbols.find(s => s.name === '.text.main');
        assert.ok(mainSym, 'should find .text.main');
        assert.ok(mainSym!.sourceFile?.includes('build/main.o'), `sourceFile should contain build/main.o, got: ${mainSym!.sourceFile}`);
    });

    it('should parse symbols in .data section', () => {
        const data = result.sections.find(s => s.name === '.data')!;
        assert.ok(data.symbols.length > 0, '.data should have symbols');
        const sysClock = data.symbols.find(s => s.name === 'SystemCoreClock');
        assert.ok(sysClock, 'should find SystemCoreClock in .data');
        assert.strictEqual(sysClock!.address, 0x20000000);
    });

    it('should parse symbols in .bss section', () => {
        const bss = result.sections.find(s => s.name === '.bss')!;
        assert.ok(bss.symbols.length > 0, '.bss should have symbols');
        const rxBuf = bss.symbols.find(s => s.name === 'rxBuffer');
        assert.ok(rxBuf, 'should find rxBuffer in .bss');
        assert.strictEqual(rxBuf!.address, 0x20000020);
    });
});

describe('parseMap — STM32F103', () => {
    let result: ReturnType<typeof parseMap>;

    before(() => {
        result = parseMap(loadSample('stm32f103.map'));
    });

    it('should parse 2 memory regions (FLASH, RAM)', () => {
        const names = result.regions.map(r => r.name);
        assert.deepStrictEqual(names, ['FLASH', 'RAM']);
    });

    it('should parse FLASH as 64K', () => {
        const flash = result.regions.find(r => r.name === 'FLASH')!;
        assert.strictEqual(flash.origin, 0x08000000);
        assert.strictEqual(flash.length, 0x10000);
    });

    it('should parse RAM as 20K', () => {
        const ram = result.regions.find(r => r.name === 'RAM')!;
        assert.strictEqual(ram.origin, 0x20000000);
        assert.strictEqual(ram.length, 0x5000);
    });

    it('should parse .text section with multiple object files', () => {
        const text = result.sections.find(s => s.name === '.text')!;
        assert.ok(text.symbols.length >= 5, `.text should have many symbols, got ${text.symbols.length}`);
    });

    it('should parse symbols from multiple object files in a single .text input section', () => {
        const text = result.sections.find(s => s.name === '.text')!;
        // main.o contributes main, SystemClock_Config, GPIO_Init, Error_Handler
        const mainSym = text.symbols.find(s => s.name === 'main');
        assert.ok(mainSym, 'should find main');
        assert.strictEqual(mainSym!.address, 0x0800010c);

        const gpioInit = text.symbols.find(s => s.name === 'GPIO_Init');
        assert.ok(gpioInit, 'should find GPIO_Init');
        assert.strictEqual(gpioInit!.address, 0x08000220);
    });

    it('should parse ._user_heap_stack section', () => {
        const heap = result.sections.find(s => s.name === '._user_heap_stack');
        assert.ok(heap, 'should find ._user_heap_stack');
        assert.strictEqual(heap!.address, 0x20000220);
        assert.strictEqual(heap!.size, 0x600);
    });

    it('should assign ._user_heap_stack to RAM region', () => {
        const heap = result.sections.find(s => s.name === '._user_heap_stack')!;
        assert.strictEqual(heap.region, 'RAM');
    });

    it('should parse .rodata with named symbols', () => {
        const rodata = result.sections.find(s => s.name === '.rodata')!;
        const version = rodata.symbols.find(s => s.name === 'version_string');
        assert.ok(version, 'should find version_string');
        assert.strictEqual(version!.address, 0x08001b54);
    });

    it('should compute correct RAM usage', () => {
        const ram = result.regions.find(r => r.name === 'RAM')!;
        // .data (0x1c) + .bss (0x200) + ._user_heap_stack (0x600) = 0x81c
        assert.strictEqual(ram.used, 0x1c + 0x200 + 0x600);
    });
});
