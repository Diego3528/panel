const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { isAuthenticated } = require('../middleware/auth');

const router = express.Router();

router.get('/', isAuthenticated, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  const apps = db.prepare('SELECT * FROM apps WHERE user_id = ? ORDER BY created_at DESC').all(user.id);
  const totalLicenses = db.prepare(`
    SELECT COUNT(*) as count FROM licenses JOIN apps ON licenses.app_id = apps.id WHERE apps.user_id = ?
  `).get(user.id).count;
  const activeLicenses = db.prepare(`
    SELECT COUNT(*) as count FROM licenses JOIN apps ON licenses.app_id = apps.id 
    WHERE apps.user_id = ? AND is_banned = 0 AND (is_lifetime = 1 OR expires_at > CURRENT_TIMESTAMP)
  `).get(user.id).count;

  const appStats = apps.map(app => {
    const total = db.prepare('SELECT COUNT(*) as c FROM licenses WHERE app_id = ?').get(app.id).c;
    const active = db.prepare("SELECT COUNT(*) as c FROM licenses WHERE app_id = ? AND is_banned = 0 AND (is_lifetime = 1 OR expires_at > CURRENT_TIMESTAMP)").get(app.id).c;
    return { ...app, totalLicenses: total, activeLicenses: active };
  });

  res.render('dashboard', { title: 'Dashboard', user, apps: appStats, stats: { totalLicenses, activeLicenses, totalApps: apps.length } });
});

router.get('/apps', isAuthenticated, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  const apps = db.prepare('SELECT * FROM apps WHERE user_id = ? ORDER BY created_at DESC').all(user.id);

  const appsWithStats = apps.map(app => {
    const total = db.prepare('SELECT COUNT(*) as c FROM licenses WHERE app_id = ?').get(app.id).c;
    const active = db.prepare("SELECT COUNT(*) as c FROM licenses WHERE app_id = ? AND is_banned = 0 AND (is_lifetime = 1 OR expires_at > CURRENT_TIMESTAMP)").get(app.id).c;
    return { ...app, totalLicenses: total, activeLicenses: active };
  });

  res.render('apps', { title: 'My Apps', user, apps: appsWithStats, error: null, success: null });
});

router.post('/apps/create', isAuthenticated, (req, res) => {
  const { name, description } = req.body;
  if (!name) {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
    const apps = db.prepare('SELECT * FROM apps WHERE user_id = ? ORDER BY created_at DESC').all(user.id);
    return res.render('apps', { title: 'My Apps', user, apps, error: 'App name is required', success: null });
  }

  const appId = 'app_' + uuidv4().split('-').join('').substring(0, 16);
  const apiKey = 'lic_' + uuidv4().split('-').join('').substring(0, 32);

  db.prepare('INSERT INTO apps (user_id, name, description, app_id, api_key) VALUES (?, ?, ?, ?, ?)')
    .run(req.session.userId, name, description || '', appId, apiKey);

  res.redirect('/dashboard/apps');
});

router.post('/apps/regenerate/:id', isAuthenticated, (req, res) => {
  const app = db.prepare('SELECT * FROM apps WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!app) return res.redirect('/dashboard/apps');

  const newApiKey = 'lic_' + uuidv4().split('-').join('').substring(0, 32);
  db.prepare('UPDATE apps SET api_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newApiKey, app.id);

  res.redirect('/dashboard/apps');
});

router.post('/apps/delete/:id', isAuthenticated, (req, res) => {
  const app = db.prepare('SELECT * FROM apps WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!app) return res.redirect('/dashboard/apps');

  db.prepare('DELETE FROM apps WHERE id = ?').run(app.id);
  res.redirect('/dashboard/apps');
});

router.get('/apps/:id/licenses', isAuthenticated, (req, res) => {
  const app = db.prepare('SELECT * FROM apps WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!app) return res.redirect('/dashboard/apps');

  const search = req.query.search || '';
  let licenses;
  if (search) {
    licenses = db.prepare("SELECT * FROM licenses WHERE app_id = ? AND (license_key LIKE ? OR owner LIKE ?) ORDER BY created_at DESC")
      .all(app.id, `%${search}%`, `%${search}%`);
  } else {
    licenses = db.prepare('SELECT * FROM licenses WHERE app_id = ? ORDER BY created_at DESC').all(app.id);
  }

  const logs = db.prepare('SELECT * FROM logs WHERE app_id = ? ORDER BY created_at DESC LIMIT 50').all(app.id);

  res.render('licenses', { title: `${app.name} - Licenses`, user: db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId), app, licenses, logs, search, error: null, success: null });
});

router.post('/apps/:id/licenses/create', isAuthenticated, (req, res) => {
  const app = db.prepare('SELECT * FROM apps WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!app) return res.redirect('/dashboard/apps');

  const { prefix, expires_in_days, is_lifetime, max_machines, count, owner } = req.body;
  const num = Math.min(Math.max(parseInt(count) || 1, 1), 50);

  const insert = db.prepare(
    'INSERT INTO licenses (app_id, license_key, expires_at, is_lifetime, max_machines, owner) VALUES (?, ?, ?, ?, ?, ?)'
  );

  const transaction = db.transaction(() => {
    for (let i = 0; i < num; i++) {
      const key = (prefix ? prefix.toUpperCase().substring(0, 8) + '-' : '') + uuidv4().toUpperCase().split('-').join('').substring(0, 24);
      const expiresAt = is_lifetime ? null : expires_in_days ? new Date(Date.now() + parseInt(expires_in_days) * 86400000).toISOString() : null;
      insert.run(app.id, key, expiresAt, is_lifetime ? 1 : 0, parseInt(max_machines) || 1, owner || '');
    }
  });
  transaction();

  res.redirect(`/dashboard/apps/${app.id}/licenses`);
});

router.post('/apps/:id/licenses/ban/:licenseId', isAuthenticated, (req, res) => {
  const app = db.prepare('SELECT * FROM apps WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!app) return res.redirect('/dashboard/apps');

  db.prepare('UPDATE licenses SET is_banned = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.licenseId);
  res.redirect(`/dashboard/apps/${app.id}/licenses`);
});

router.post('/apps/:id/licenses/unban/:licenseId', isAuthenticated, (req, res) => {
  const app = db.prepare('SELECT * FROM apps WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!app) return res.redirect('/dashboard/apps');

  db.prepare('UPDATE licenses SET is_banned = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.licenseId);
  res.redirect(`/dashboard/apps/${app.id}/licenses`);
});

router.post('/apps/:id/licenses/delete/:licenseId', isAuthenticated, (req, res) => {
  const app = db.prepare('SELECT * FROM apps WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!app) return res.redirect('/dashboard/apps');

  db.prepare('DELETE FROM licenses WHERE id = ?').run(req.params.licenseId);
  res.redirect(`/dashboard/apps/${app.id}/licenses`);
});

router.get('/logs', isAuthenticated, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  const logs = db.prepare(`
    SELECT logs.*, apps.name as app_name, licenses.license_key 
    FROM logs 
    LEFT JOIN apps ON logs.app_id = apps.id 
    LEFT JOIN licenses ON logs.license_id = licenses.id 
    WHERE apps.user_id = ? 
    ORDER BY logs.created_at DESC LIMIT 100
  `).all(user.id);

  res.render('logs-view', { title: 'Activity Logs', user, logs });
});

module.exports = router;
