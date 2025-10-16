const fs = require('fs');
const path = require('path');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const manifestPath = path.join(__dirname, '..', 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error('manifest.json not found at repo root');
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.version !== pkg.version) {
  manifest.version = pkg.version;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Synchronized manifest.json version to ${pkg.version}`);
}
