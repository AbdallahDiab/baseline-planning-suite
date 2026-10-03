import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ModuleFederationPlugin } from '@module-federation/enhanced/rspack';
import { rspack } from '@rspack/core';
import { reactShared } from '../../tools/react-shared.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));

const typescriptRule = {
  test: /\.tsx?$/,
  loader: 'builtin:swc-loader',
  exclude: /node_modules/,
  options: {
    jsc: {
      parser: {
        syntax: 'typescript',
        tsx: true,
      },
      transform: {
        react: {
          runtime: 'automatic',
        },
      },
    },
  },
  type: 'javascript/auto',
};

export default {
  context: root,
  entry: './src/index.ts',
  mode: 'production',
  target: 'web',
  devtool: false,
  output: {
    path: path.resolve(root, 'dist'),
    publicPath: '/people/',
    filename: '[name].js',
    uniqueName: 'people',
    clean: true,
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
  },
  module: {
    rules: [typescriptRule],
  },
  plugins: [
    new rspack.HtmlRspackPlugin({
      template: './src/index.html',
    }),
    new ModuleFederationPlugin({
      name: 'people',
      filename: 'remoteEntry.js',
      exposes: {
        './App': './src/App.tsx',
      },
      shareStrategy: 'loaded-first',
      dts: false,
      manifest: {
        fileName: 'mf-manifest.json',
      },
      shared: reactShared({ eager: false }),
    }),
  ],
};
