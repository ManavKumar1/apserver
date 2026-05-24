// require('dotenv').config({ path: '../.env' });
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const BUNDLE_DIR = path.join(__dirname, 'bundle');
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

app.get('/bundle.js', (req, res) => {
  try {
    const files = fs.readdirSync(BUNDLE_DIR)
      .filter(f => f.endsWith('.js'))
      .sort();
    if (files.length === 0) {
      return res.status(404).send('// No bundle files found');
    }
    const parts = files.map(f => {
      const code = fs.readFileSync(path.join(BUNDLE_DIR, f), 'utf8');
      return `\n// ═══ ${f} ═══\n${code}\n`;
    });
    // const injected = `const TG_BOT_TOKEN = ${JSON.stringify(process.env.TG_BOT_TOKEN)};\nconst TG_CHAT_IDS = ${JSON.stringify((process.env.TG_CHAT_IDS || '').split(','))};\n`;

    const bundle = [
      `// ApplyPilot Bundle — generated ${new Date().toISOString()}`,
      `// Files: ${files.join(', ')}`,
      // injected,
      ...parts,
    ].join('\n');
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-store');
    res.send(bundle);
    console.log(`[Server] Served bundle (${files.length} files, ${bundle.length} bytes) to ${req.ip}`);
  } catch (err) {
    console.error('[Server] Bundle error:', err);
    res.status(500).send('// Server error');
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
  console.log(`[ApplyPilot Server] Bundle: http://localhost:${PORT}/bundle.js`);
  console.log(`[ApplyPilot Server] Health: http://localhost:${PORT}/health`);
  const files = fs.readdirSync(BUNDLE_DIR).filter(f => f.endsWith('.js')).sort();
  console.log(`[ApplyPilot Server] Bundle files loaded: ${files.join(', ') || '(none)'}`);
});
