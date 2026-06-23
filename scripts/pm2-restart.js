'use strict';
const { execSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const eco  = path.join(root, 'ecosystem.config.js');

function findPm2() {
  const nodeDir = path.dirname(process.execPath);
  const candidates = [
    'pm2',
    path.join(nodeDir, 'pm2'),
    '/usr/local/bin/pm2',
    '/usr/bin/pm2',
    path.join(process.env.NVM_DIR || '/root/.nvm', 'versions', 'node',
              process.version, 'bin', 'pm2'),
  ];
  for (const c of candidates) {
    try { execSync(`"${c}" --version`, { stdio: 'ignore' }); return c; }
    catch {}
  }
  return null;
}

try {
  const pm2 = findPm2();
  if (!pm2) { console.log('pm2 not in PATH, skipping'); process.exit(0); }
  execSync(`"${pm2}" startOrRestart "${eco}" --env production`, {
    stdio: 'inherit', cwd: root,
  });
  console.log('pm2 restarted via ecosystem.config.js');
} catch (e) {
  console.log('pm2 restart skipped:', e.message);
}
process.exit(0);
