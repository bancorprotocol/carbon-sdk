import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import { terser } from 'rollup-plugin-terser';

export default {
  input: {
    '.': 'src/index.ts',
    'chain-cache': 'src/chain-cache/index.ts',
    'contracts-api': 'src/contracts-api/index.ts',
    'strategy-management': 'src/strategy-management/index.ts',
    'trade-matcher': 'src/trade-matcher/index.ts',
    utils: 'src/utils/index.ts',
  },
  output: [
    {
      dir: 'dist',
      format: 'cjs',
      entryFileNames: '[name]/index.cjs',
      chunkFileNames: '[name]-[hash].cjs',
    },
    {
      dir: 'dist',
      format: 'esm',
      entryFileNames: '[name]/index.js',
      chunkFileNames: '[name]-[hash].js',
      preserveModules: true,
      preserveModulesRoot: 'src',
    },
  ],
  plugins: [
    resolve(),
    commonjs(),
    typescript(),
    terser(), // Minifies the bundle
  ],
  external: [], // Add any external dependencies here
};
