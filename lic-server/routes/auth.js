const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { isAuthenticated, generateToken } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('login', { title: 'Sign In', error: null, success: null });
});

router.post('/login', authLimiter, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.render('login', { title: 'Sign In', error: 'Please fill in all fields', success: null });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.render('login', { title: 'Sign In', error: 'Invalid credentials', success: null });
  }

  req.session.userId = user.id;
  req.session.token = generateToken(user);
  res.redirect(user.role === 'admin' ? '/admin' : '/dashboard');
});

router.get('/register', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('register', { title: 'Create Account', error: null, success: null });
});

router.post('/register', authLimiter, (req, res) => {
  const { username, email, password, confirm_password } = req.body;

  if (!username || !email || !password || !confirm_password) {
    return res.render('register', { title: 'Create Account', error: 'Please fill in all fields', success: null });
  }
  if (password !== confirm_password) {
    return res.render('register', { title: 'Create Account', error: 'Passwords do not match', success: null });
  }
  if (password.length < 6) {
    return res.render('register', { title: 'Create Account', error: 'Password must be at least 6 characters', success: null });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (existing) {
    return res.render('register', { title: 'Create Account', error: 'Username or email already exists', success: null });
  }

  const hashed = bcrypt.hashSync(password, 10);
  const isFirstUser = db.prepare('SELECT COUNT(*) as count FROM users').get().count === 0;

  db.prepare('INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)').run(username, email, hashed, isFirstUser ? 'admin' : 'user');

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  req.session.userId = user.id;
  req.session.token = generateToken(user);
  res.redirect(user.role === 'admin' ? '/admin' : '/dashboard');
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

module.exports = router;
