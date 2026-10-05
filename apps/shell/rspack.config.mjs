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
  entry: './src/index.tsx',
  mode: 'production',
  target: 'web',
  devtool: false,
  output: {
    path: path.resolve(root, 'dist'),
    publicPath: '/',
    filename: '[name].js',
    uniqueName: 'shell',
    clean: true,
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
  },
  module: {
    rules: [
      typescriptRule,
      {
        test: /\.css$/,
        type: 'css/auto',
      },
    ],
  },
  plugins: [
    new rspack.HtmlRspackPlugin({
      template: './src/index.html',
      chunks: ['main'],
    }),
    new ModuleFederationPlugin({
      name: 'shell',
      // Remote URLs are registered at runtime from /config.json.
      // Do not put People or Delivery locations here.
      shareStrategy: 'loaded-first',
      dts: false,
      manifest: {
        fileName: 'mf-manifest.json',
      },
      shared: reactShared({ eager: true }),
    }),
  ],
};
