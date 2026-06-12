require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./config/db');

const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const dashboardRoutes = require('./routes/dashboard');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'lic-server-secret-key-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 },
}));

app.use((req, res, next) => {
  res.locals.user = null;
  res.locals.path = req.path;
  if (req.session && req.session.userId) {
    const user = db.prepare('SELECT id, username, email, role, created_at FROM users WHERE id = ?').get(req.session.userId);
    if (user) res.locals.user = user;
  }
  next();
});

app.use('/', authRoutes);
app.use('/api', apiRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/admin', adminRoutes);

app.get('/', (req, res) => {
  res.render('index', { title: 'LicServer - License Management System' });
});

app.get('/docs', (req, res) => {
  res.render('docs', { title: 'API Documentation' });
});

app.use((req, res) => {
  res.status(404).render('404', { title: 'Page Not Found' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`LicServer running on http://0.0.0.0:${PORT}`);
});
