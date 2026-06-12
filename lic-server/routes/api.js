const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { verifyToken } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.use(apiLimiter);

function authApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  if (!apiKey) {
    return res.status(401).json({ valid: false, error: 'API key required' });
  }
  const app = db.prepare('SELECT * FROM apps WHERE api_key = ?').get(apiKey);
  if (!app) {
    return res.status(401).json({ valid: false, error: 'Invalid API key' });
  }
  req.app = app;
  next();
}

router.post('/verify', authApiKey, (req, res) => {
  const { license_key, hwid, ip } = req.body;
  if (!license_key) {
    return res.json({ valid: false, error: 'License key required' });
  }

  const license = db.prepare('SELECT * FROM licenses WHERE license_key = ? AND app_id = ?').get(license_key, req.app.id);

  if (!license) {
    logAction(req.app.id, null, 'verify_failed', req.ip, hwid || '', 'License key not found');
    return res.json({ valid: false, error: 'Invalid license key' });
  }

  if (license.is_banned) {
    logAction(req.app.id, license.id, 'verify_banned', req.ip, hwid || '', 'License key is banned');
    return res.json({ valid: false, error: 'License key is banned', banned: true });
  }

  if (!license.is_lifetime && license.expires_at && new Date(license.expires_at) < new Date()) {
    logAction(req.app.id, license.id, 'verify_expired', req.ip, hwid || '', 'License key expired');
    return res.json({ valid: false, error: 'License key has expired', expired: true });
  }

  if (license.hwid && hwid && license.hwid !== hwid) {
    logAction(req.app.id, license.id, 'verify_hwid_mismatch', req.ip, hwid || '', 'HWID mismatch');
    return res.json({ valid: false, error: 'HWID mismatch', hwid_mismatch: true });
  }

  if (!license.hwid && hwid) {
    db.prepare('UPDATE licenses SET hwid = ? WHERE id = ?').run(hwid, license.id);
  }

  const clientIp = ip || req.ip;
  if (license.ip_address && license.ip_address !== clientIp) {
    logAction(req.app.id, license.id, 'verify_ip_mismatch', clientIp, hwid || '', 'IP mismatch');
    return res.json({ valid: false, error: 'IP address mismatch', ip_mismatch: true });
  }

  db.prepare('UPDATE licenses SET last_verified = CURRENT_TIMESTAMP, ip_address = ? WHERE id = ?').run(clientIp, license.id);
  logAction(req.app.id, license.id, 'verify_success', clientIp, hwid || '', 'License verified successfully');

  const now = new Date();
  const expires = license.expires_at ? new Date(license.expires_at) : null;
  const daysLeft = expires ? Math.max(0, Math.floor((expires - now) / (1000 * 60 * 60 * 24))) : -1;

  res.json({
    valid: true,
    status: 'VALID',
    license_key: license.license_key,
    owner: license.owner,
    hwid: license.hwid || null,
    is_lifetime: !!license.is_lifetime,
    expires_at: license.expires_at || null,
    days_left: daysLeft,
    last_verified: new Date().toISOString(),
  });
});

router.post('/activate', authApiKey, (req, res) => {
  const { license_key, hwid, owner } = req.body;
  if (!license_key || !hwid) {
    return res.json({ valid: false, error: 'License key and HWID required' });
  }

  const license = db.prepare('SELECT * FROM licenses WHERE license_key = ? AND app_id = ?').get(license_key, req.app.id);

  if (!license) {
    return res.json({ valid: false, error: 'Invalid license key' });
  }
  if (license.is_banned) {
    return res.json({ valid: false, error: 'License key is banned' });
  }
  if (!license.is_lifetime && license.expires_at && new Date(license.expires_at) < new Date()) {
    return res.json({ valid: false, error: 'License key has expired' });
  }

  if (license.hwid && license.hwid !== hwid) {
    return res.json({ valid: false, error: 'License already activated on another machine', hwid_mismatch: true });
  }

  db.prepare('UPDATE licenses SET hwid = ?, owner = COALESCE(?, owner), last_verified = CURRENT_TIMESTAMP WHERE id = ?')
    .run(hwid, owner || null, license.id);

  logAction(req.app.id, license.id, 'activate', req.ip, hwid, `Activated by ${owner || 'unknown'}`);

  res.json({ valid: true, status: 'ACTIVATED', license_key: license.license_key });
});

router.post('/deactivate', authApiKey, (req, res) => {
  const { license_key, hwid } = req.body;
  if (!license_key) {
    return res.json({ valid: false, error: 'License key required' });
  }

  const license = db.prepare('SELECT * FROM licenses WHERE license_key = ? AND app_id = ?').get(license_key, req.app.id);

  if (!license) {
    return res.json({ valid: false, error: 'Invalid license key' });
  }

  if (license.hwid === hwid || !hwid) {
    db.prepare('UPDATE licenses SET hwid = ? WHERE id = ?').run('', license.id);
    logAction(req.app.id, license.id, 'deactivate', req.ip, hwid || '', 'License deactivated');
    return res.json({ valid: true, status: 'DEACTIVATED' });
  }

  res.json({ valid: false, error: 'HWID does not match' });
});

router.post('/info', authApiKey, (req, res) => {
  const { license_key } = req.body;
  if (!license_key) {
    return res.json({ valid: false, error: 'License key required' });
  }

  const license = db.prepare('SELECT license_key, owner, hwid, is_banned, is_lifetime, expires_at, max_machines, last_verified, created_at FROM licenses WHERE license_key = ? AND app_id = ?')
    .get(license_key, req.app.id);

  if (!license) {
    return res.json({ valid: false, error: 'Invalid license key' });
  }

  res.json({ valid: true, license });
});

router.post('/check', authApiKey, (req, res) => {
  const { license_key } = req.body;
  const license = db.prepare('SELECT license_key, is_banned, expires_at, is_lifetime FROM licenses WHERE license_key = ? AND app_id = ?')
    .get(license_key, req.app.id);

  if (!license) return res.json({ valid: false });
  if (license.is_banned) return res.json({ valid: false, banned: true });
  if (!license.is_lifetime && license.expires_at && new Date(license.expires_at) < new Date()) {
    return res.json({ valid: false, expired: true });
  }

  res.json({ valid: true });
});

router.post('/generate', authApiKey, (req, res) => {
  const { count, prefix, expires_in_days, is_lifetime, max_machines } = req.body;
  const num = Math.min(Math.max(parseInt(count) || 1, 1), 100);
  const generated = [];

  const insert = db.prepare(
    'INSERT INTO licenses (app_id, license_key, expires_at, is_lifetime, max_machines, owner) VALUES (?, ?, ?, ?, ?, ?)'
  );

  for (let i = 0; i < num; i++) {
    const key = (prefix ? prefix.toUpperCase() + '-' : '') + uuidv4().toUpperCase().split('-').join('');
    const expiresAt = is_lifetime ? null : expires_in_days ? new Date(Date.now() + parseInt(expires_in_days) * 86400000).toISOString() : null;
    insert.run(req.app.id, key, expiresAt, is_lifetime ? 1 : 0, parseInt(max_machines) || 1, '');
    generated.push(key);
  }

  logAction(req.app.id, null, 'generate_keys', req.ip, '', `Generated ${num} keys`);
  res.json({ valid: true, count: generated.length, keys: generated });
});

function logAction(appId, licenseId, action, ip, hwid, details) {
  db.prepare('INSERT INTO logs (app_id, license_id, action, ip, hwid, details) VALUES (?, ?, ?, ?, ?, ?)')
    .run(appId, licenseId, action, ip, hwid, details);
}

module.exports = router;
