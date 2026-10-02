import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const ROOT_FILES = ['index.html', 'delivery-confirmation.html', 'manifest.webmanifest', 'service-worker.js'];
const TYPES = {
  src: new Set(['.js', '.css']),
  assets: new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.txt', '.b64']),
  icons: new Set(['.png', '.svg', '.ico', '.b64']),
};

// Data, credentials and backups never enter the HTTP document root.
export function preparePublicDirectory(root) {
  const publicDir = join(root, 'public');
  rmSync(publicDir, { recursive: true, force: true });
  mkdirSync(publicDir, { recursive: true });
  for (const file of ROOT_FILES) {
    if (existsSync(join(root, file))) copyFileSync(join(root, file), join(publicDir, file));
  }
  function copyUi(source, target, types) {
    mkdirSync(target, { recursive: true });
    if (!existsSync(source)) return;
    for (const entry of readdirSync(source, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) copyUi(join(source, entry.name), join(target, entry.name), types);
      else if (entry.isFile() && types.has(extname(entry.name))) copyFileSync(join(source, entry.name), join(target, entry.name));
    }
  }
  for (const [directory, types] of Object.entries(TYPES)) copyUi(join(root, directory), join(publicDir, directory), types);
  // Frontend bootstraps with empty data; operational values come only from authenticated APIs.
  writeFileSync(join(publicDir, 'src', 'data.js'), 'export const seedProducts = [];\nexport const seedCustomers = [];\nexport const seedOrders = [];\nexport const receivingAccounts = [{ id: "pix-local", name: "Pix", accent: "emerald" }];\n');
  return publicDir;
}
