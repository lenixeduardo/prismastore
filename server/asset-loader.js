import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function ensureBase64Asset({ base64Path, outputPath }) {
  const encoded = readFileSync(base64Path, 'utf8').trim();
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, Buffer.from(encoded, 'base64'));
  return outputPath;
}
