const https = require('https');

const ownerRepo = process.env.GITHUB_REPOSITORY || '<owner>/<repo>';
const url = `https://github.com/${ownerRepo}/releases/latest/download/manifest.json`;
https
  .get(url, (res) => {
    if (res.statusCode !== 200) {
      console.error(`BRAT manifest check failed: HTTP ${res.statusCode} for ${url}`);
      process.exit(1);
    }
    let data = '';
    res.on('data', (d) => (data += d));
    res.on('end', () => {
      try {
        const m = JSON.parse(data);
        console.log('OK:', { id: m.id, name: m.name, version: m.version });
      } catch (e) {
        console.error('Invalid JSON from release manifest');
        process.exit(1);
      }
    });
  })
  .on('error', (e) => {
    console.error(e);
    process.exit(1);
  });
