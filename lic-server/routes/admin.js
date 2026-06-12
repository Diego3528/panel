const express = require('express');
const db = require('../config/db');
const { isAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', isAdmin, (req, res) => {
  const usersCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const appsCount = db.prepare('SELECT COUNT(*) as c FROM apps').get().c;
  const licensesCount = db.prepare('SELECT COUNT(*) as c FROM licenses').get().c;
  const logsCount = db.prepare('SELECT COUNT(*) as c FROM logs').get().c;
  const activeLicenses = db.prepare("SELECT COUNT(*) as c FROM licenses WHERE is_banned = 0 AND (is_lifetime = 1 OR expires_at > CURRENT_TIMESTAMP)").get().c;
  const bannedLicenses = db.prepare('SELECT COUNT(*) as c FROM licenses WHERE is_banned = 1').get().c;

  const recentLogs = db.prepare(`
    SELECT logs.*, apps.name as app_name, users.username 
    FROM logs 
    LEFT JOIN apps ON logs.app_id = apps.id 
    LEFT JOIN licenses ON logs.license_id = licenses.id 
    LEFT JOIN users ON apps.user_id = users.id 
    ORDER BY logs.created_at DESC LIMIT 20
  `).all();

  const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();

  res.render('admin/index', {
    title: 'Admin Panel',
    user: req.user,
    stats: { usersCount, appsCount, licensesCount, logsCount, activeLicenses, bannedLicenses },
    recentLogs,
    users,
  });
});

router.post('/users/role/:id', isAdmin, (req, res) => {
  const { role } = req.body;
  if (!['user', 'admin'].includes(role)) return res.redirect('/admin');
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  res.redirect('/admin');
});

router.post('/users/delete/:id', isAdmin, (req, res) => {
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.redirect('/admin');
});

router.get('/logs', isAdmin, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 50;
  const offset = (page - 1) * limit;
  const total = db.prepare('SELECT COUNT(*) as c FROM logs').get().c;

  const logs = db.prepare(`
    SELECT logs.*, apps.name as app_name, users.username 
    FROM logs 
    LEFT JOIN apps ON logs.app_id = apps.id 
    LEFT JOIN users ON apps.user_id = users.id 
    ORDER BY logs.created_at DESC LIMIT ? OFFSET ?
  `).all(limit, offset);

  res.render('admin/logs', {
    title: 'All Logs - Admin',
    user: req.user,
    logs,
    page,
    totalPages: Math.ceil(total / limit),
  });
});

module.exports = router;
