import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { brotliCompress, gzip, constants } from 'node:zlib';
import { promisify } from 'node:util';
const br = promisify(brotliCompress),
  gz = promisify(gzip);
for (const entry of await readdir('dist/assets', { withFileTypes: true })) {
  if (!entry.isFile() || !/\.(js|css|mjs|wasm)$/.test(entry.name)) continue;
  const file = path.join('dist/assets', entry.name),
    bytes = await readFile(file);
  await writeFile(
    file + '.br',
    await br(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 8 } }),
  );
  await writeFile(file + '.gz', await gz(bytes, { level: 9 }));
}
