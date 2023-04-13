import typescript from 'rollup-plugin-typescript2';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: {
    '.': 'src/index.ts',
    'chain-cache': 'src/chain-cache/index.ts',
    'contracts-api': 'src/contracts-api/index.ts',
    'strategy-management': 'src/strategy-management/index.ts',
    'trade-matcher': 'src/trade-matcher/index.ts',
    utils: 'src/utils/index.ts',
  },
  output: {
    dir: 'dist',
    format: 'esm',
    entryFileNames: '[name]/index.js',
    chunkFileNames: 'shared/[name].js',
    exports: 'named',
  },
  plugins: [
    typescript({
      tsconfig: './tsconfig.json',
      declaration: true,
      declarationDir: 'dist',
      declarationMap: true,
      clean: true,
    }),
    resolve({
      preferBuiltins: true,
    }),
    commonjs(),
  ],
};
