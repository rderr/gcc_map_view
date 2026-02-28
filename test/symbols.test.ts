import * as assert from 'assert';
import { extractSourceName, extractSymbolName, hexVariants } from '../src/util/symbols';

describe('extractSourceName', () => {
    it('should extract from archive with .c.obj', () => {
        assert.strictEqual(extractSourceName('libmain.a(main.c.obj)'), 'main.c');
    });

    it('should extract from archive with .cpp.obj', () => {
        assert.strictEqual(extractSourceName('libfoo.a(bar.cpp.obj)'), 'bar.cpp');
    });

    it('should extract from plain .o file', () => {
        assert.strictEqual(extractSourceName('build/main.o'), 'main');
    });

    it('should extract from nested path .o file', () => {
        assert.strictEqual(extractSourceName('build/src/utils/helper.o'), 'helper');
    });

    it('should extract from ESP-IDF style path', () => {
        assert.strictEqual(extractSourceName('esp-idf/main/libmain.a(main.c.obj)'), 'main.c');
    });

    it('should extract from CMake style path', () => {
        assert.strictEqual(extractSourceName('CMakeFiles/app.dir/src/main.c.obj'), 'main.c');
    });

    it('should handle backslash paths', () => {
        assert.strictEqual(extractSourceName('build\\src\\main.o'), 'main');
    });

    it('should return undefined for empty string', () => {
        assert.strictEqual(extractSourceName(''), undefined);
    });

    it('should handle plain filename without path', () => {
        assert.strictEqual(extractSourceName('main.o'), 'main');
    });

    it('should handle .OBJ uppercase', () => {
        assert.strictEqual(extractSourceName('lib.a(file.c.OBJ)'), 'file.c');
    });
});

describe('extractSymbolName', () => {
    it('should strip .text. prefix', () => {
        assert.strictEqual(extractSymbolName('.text.app_main'), 'app_main');
    });

    it('should strip .rodata. prefix', () => {
        assert.strictEqual(extractSymbolName('.rodata.str1.1'), 'str1.1');
    });

    it('should strip .data. prefix', () => {
        assert.strictEqual(extractSymbolName('.data.huart2'), 'huart2');
    });

    it('should strip .bss. prefix', () => {
        assert.strictEqual(extractSymbolName('.bss.rxBuffer'), 'rxBuffer');
    });

    it('should strip .literal. prefix', () => {
        assert.strictEqual(extractSymbolName('.literal.foo'), 'foo');
    });

    it('should not strip unknown prefixes', () => {
        assert.strictEqual(extractSymbolName('.isr_vector'), '.isr_vector');
    });

    it('should return plain names unchanged', () => {
        assert.strictEqual(extractSymbolName('main'), 'main');
    });

    it('should return Reset_Handler unchanged', () => {
        assert.strictEqual(extractSymbolName('Reset_Handler'), 'Reset_Handler');
    });
});

describe('hexVariants', () => {
    it('should generate correct variants for a typical ARM address', () => {
        const v = hexVariants(0x080001c4);
        assert.strictEqual(v.hex8, '0x080001c4');
        assert.strictEqual(v.hex16, '0x00000000080001c4');
        assert.strictEqual(v.hexMin, '0x80001c4');
    });

    it('should handle address 0', () => {
        const v = hexVariants(0);
        assert.strictEqual(v.hex8, '0x00000000');
        assert.strictEqual(v.hex16, '0x0000000000000000');
        assert.strictEqual(v.hexMin, '0x0');
    });

    it('should handle large 32-bit address', () => {
        const v = hexVariants(0x20000000);
        assert.strictEqual(v.hex8, '0x20000000');
        assert.strictEqual(v.hex16, '0x0000000020000000');
        assert.strictEqual(v.hexMin, '0x20000000');
    });

    it('should match STM32 map file format (16-digit)', () => {
        // The bug: STM32 maps use 0x00000000080002e4 but we only searched for 0x080002e4
        const v = hexVariants(0x080002e4);
        // The 16-digit variant should match what STM32 map files contain
        assert.strictEqual(v.hex16, '0x00000000080002e4');
        assert.strictEqual(v.hex8, '0x080002e4');
    });

    it('should produce lowercase hex', () => {
        const v = hexVariants(0xABCDEF);
        assert.ok(v.hex8.includes('abcdef'), 'hex8 should be lowercase');
        assert.ok(v.hex16.includes('abcdef'), 'hex16 should be lowercase');
    });
});
