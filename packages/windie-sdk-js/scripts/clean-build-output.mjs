/**
 * Removes generated SDK package output before TypeScript emits fresh files.
 */

import { rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

await Promise.all(
  ['dist', 'cjs'].map((outputDirectory) =>
    rm(resolve(packageRoot, outputDirectory), { recursive: true, force: true }),
  ),
);
