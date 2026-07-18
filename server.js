// require('dotenv').config({ path: '../.env' });
const express = require('express');
const cors    = require('cors');
const crypto  = require('crypto');
const fs      = require('fs');
const path    = require('path');

const app        = express();
const PORT       = process.env.PORT || 3000;
const BUNDLE_DIR = path.join(__dirname, 'bundle');
const MODULE_DIR = path.join(__dirname, 'modules');

// ─── CORS: only allow requests from Amazon hiring pages + Chrome extensions ───
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // same-origin / non-browser
    const allowed =
      origin.startsWith('chrome-extension://') ||
      origin.includes('hiring.amazon.com') ||
      origin.includes('hiring.amazon.ca');
    cb(allowed ? null : new Error('Not allowed'), allowed);
  },
}));
app.use(express.json({ limit: '16kb' }));

function readBundle() {
  const files = fs.readdirSync(BUNDLE_DIR)
    .filter(f => f.endsWith('.js'))
    .sort();
  if (files.length === 0) throw new Error('No bundle files found');
  const parts = files.map(f => {
    const code = fs.readFileSync(path.join(BUNDLE_DIR, f), 'utf8');
    return `\n// ═══ ${f} ═══\n${code}\n`;
  });
  return {
    files,
    bundle: [
      `// ApplyPilot Bundle — generated ${new Date().toISOString()}`,
      `// Files: ${files.join(', ')}`,
      ...parts,
    ].join('\n'),
  };
}

function readModule(name) {
  const allowed = new Set(['login-page', 'gmail-otp']);
  if (!allowed.has(name)) throw new Error('Unknown module');
  return fs.readFileSync(path.join(MODULE_DIR, `${name}.js`), 'utf8');
}

async function validateLicence(licenceKey) {
  if (typeof licenceKey !== 'string' || !licenceKey.trim()) return false;
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'hq-config.json'), 'utf8'));
  const endpoint = config.hq_url.replace(/\/+$/, '') + '/' + config.app_slug.replace(/^\/+/, '');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ licence_key: licenceKey.trim() }),
    signal: AbortSignal.timeout(10000),
  });
  const body = await response.json();
  return response.ok && body.working === true && !body.expired && !body.maintenance;
}

function encryptBundleForClient(bundle, clientPublicKeyJwk) {
  const clientPublicKey = crypto.createPublicKey({ key: clientPublicKeyJwk, format: 'jwk' });
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const sharedSecret = crypto.diffieHellman({ privateKey, publicKey: clientPublicKey });
  const key = crypto.createHash('sha256')
    .update('ApplyPilot bundle v1', 'utf8')
    .update(sharedSecret)
    .digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(bundle, 'utf8'), cipher.final()]);
  return {
    alg: 'ECDH-P256/AES-256-GCM',
    server_public_key: publicKey.export({ format: 'jwk' }),
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

// ─── Bundle ───────────────────────────────────────────────────────────────────
app.post('/bundle', async (req, res) => {
  try {
    const { licence_key: licenceKey, client_public_key: clientPublicKey } = req.body || {};
    if (!clientPublicKey || clientPublicKey.kty !== 'EC' || clientPublicKey.crv !== 'P-256') {
      return res.status(400).json({ error: 'A P-256 client public key is required.' });
    }
    if (!(await validateLicence(licenceKey))) {
      return res.status(403).json({ error: 'Licence is not authorized.' });
    }
    const { files, bundle } = readBundle();
    res.setHeader('Cache-Control', 'no-store');
    res.json(encryptBundleForClient(bundle, clientPublicKey));
    console.log(`[Server] Served encrypted bundle (${files.length} files, ${bundle.length} bytes) to ${req.ip}`);
  } catch (err) {
    console.error('[Server] Bundle error:', err);
    res.status(500).json({ error: 'Could not create encrypted bundle.' });
  }
});

// Small, page-specific modules use the same live-HQ check and one-request
// ECDH/AES-GCM envelope as the main bundle.  They are never cacheable.
app.post('/module/:name', async (req, res) => {
  try {
    const { licence_key: licenceKey, client_public_key: clientPublicKey } = req.body || {};
    if (!clientPublicKey || clientPublicKey.kty !== 'EC' || clientPublicKey.crv !== 'P-256') {
      return res.status(400).json({ error: 'A P-256 client public key is required.' });
    }
    if (!(await validateLicence(licenceKey))) {
      return res.status(403).json({ error: 'Licence is not authorized.' });
    }
    const moduleCode = readModule(req.params.name);
    res.setHeader('Cache-Control', 'no-store');
    res.json(encryptBundleForClient(moduleCode, clientPublicKey));
  } catch (err) {
    const status = err.message === 'Unknown module' ? 404 : 500;
    console.error('[Server] Module error:', err.message);
    res.status(status).json({ error: status === 404 ? 'Unknown module.' : 'Could not create encrypted module.' });
  }
});

// ─── HQ config — fetched by background.js so HQ URL/slug never live in the extension ──
// Change your HQ server or app slug here; extension picks it up on next daily refresh.
app.get('/hq-config.json', (req, res) => {
  try {
    const cfg = fs.readFileSync(path.join(__dirname, 'hq-config.json'), 'utf8');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.send(cfg);
  } catch (err) {
    console.error('[Server] HQ config error:', err);
    res.status(500).json({ error: 'Could not read hq-config.json' });
  }
});

// ─── WAF rules — fetched by background.js, installed as dynamic DNR rules ────
app.get('/waf-rules.json', (req, res) => {
  try {
    const rules = fs.readFileSync(path.join(__dirname, 'waf-rules.json'), 'utf8');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.send(rules);
    console.log(`[Server] Served waf-rules.json to ${req.ip}`);
  } catch (err) {
    console.error('[Server] WAF rules error:', err);
    res.status(500).json({ error: 'Could not read waf-rules.json' });
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  const files = fs.readdirSync(BUNDLE_DIR).filter(f => f.endsWith('.js')).sort();
  res.json({ status: 'ok', files, time: new Date().toISOString() });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[ApplyPilot Server] Running on port ${PORT}`);
  console.log(`[ApplyPilot Server] Bundle:     POST /bundle (encrypted, licence required)`);
  console.log(`[ApplyPilot Server] HQ config:  http://localhost:${PORT}/hq-config.json`);
  console.log(`[ApplyPilot Server] WAF rules:  http://localhost:${PORT}/waf-rules.json`);
  console.log(`[ApplyPilot Server] Health:     http://localhost:${PORT}/health`);
  const files = fs.readdirSync(BUNDLE_DIR).filter(f => f.endsWith('.js')).sort();
  console.log(`[ApplyPilot Server] Bundle files: ${files.join(', ') || '(none)'}`);
});
