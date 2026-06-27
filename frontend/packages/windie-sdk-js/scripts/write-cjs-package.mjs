/**
 * Provides the write package module for the TypeScript SDK runtime.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cjsRoot = resolve(packageRoot, 'cjs');

await mkdir(cjsRoot, { recursive: true });
await writeFile(
  resolve(cjsRoot, 'package.json'),
  `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`,
);
