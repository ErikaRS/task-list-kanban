const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const manifestPath = path.join(repoRoot, 'manifest.json');

if (!fs.existsSync(manifestPath)) {
  console.error('manifest.json not found at repo root');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.version !== pkg.version) {
  manifest.version = pkg.version;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Synchronized manifest.json version to ${pkg.version}`);
} else {
  console.log('manifest.json version already matches package.json');
}
