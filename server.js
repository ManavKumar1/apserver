const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');

const app        = express();
const PORT       = process.env.PORT || 3000;
const BUNDLE_DIR = path.join(__dirname, 'bundle');

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const ok = origin.startsWith('chrome-extension://') ||
               origin.includes('hiring.amazon.com') ||
               origin.includes('hiring.amazon.ca');
    cb(ok ? null : new Error('Not allowed'), ok);
  },
}));

app.get('/bundle.js', (req, res) => {
  try {
    const files = fs.readdirSync(BUNDLE_DIR).filter(f => f.endsWith('.js')).sort();
    if (!files.length) return res.status(404).send('// No bundle files found');
    const bundle = [
      `// ApplyPilot — ${new Date().toISOString()}`,
      ...files.map(f => fs.readFileSync(path.join(BUNDLE_DIR, f), 'utf8')),
    ].join('\n');
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-store');
    res.send(bundle);
    console.log(`[Server] bundle served — ${files.length} files, ${bundle.length}b → ${req.ip}`);
  } catch (e) {
    console.error('[Server] error:', e);
    res.status(500).send('// Server error');
  }
});

app.get('/health', (_req, res) => {
  const files = fs.readdirSync(BUNDLE_DIR).filter(f => f.endsWith('.js')).sort();
  res.json({ status: 'ok', files, time: new Date().toISOString() });
});

app.listen(PORT, () => {
  const files = fs.readdirSync(BUNDLE_DIR).filter(f => f.endsWith('.js')).sort();
  console.log(`[ApplyPilot] http://localhost:${PORT} | files: ${files.join(', ') || '(none)'}`);
});
