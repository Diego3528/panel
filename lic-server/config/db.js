const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS apps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    app_id TEXT UNIQUE NOT NULL,
    api_key TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS licenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id INTEGER NOT NULL,
    license_key TEXT UNIQUE NOT NULL,
    owner TEXT DEFAULT '',
    hwid TEXT DEFAULT '',
    ip_address TEXT DEFAULT '',
    max_machines INTEGER DEFAULT 1,
    expires_at DATETIME,
    is_banned INTEGER DEFAULT 0,
    is_lifetime INTEGER DEFAULT 0,
    metadata TEXT DEFAULT '{}',
    last_verified DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_id INTEGER,
    app_id INTEGER,
    action TEXT NOT NULL,
    ip TEXT DEFAULT '',
    hwid TEXT DEFAULT '',
    user_agent TEXT DEFAULT '',
    details TEXT DEFAULT '',
    status TEXT DEFAULT 'success',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE SET NULL,
    FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(license_key);
  CREATE INDEX IF NOT EXISTS idx_licenses_app ON licenses(app_id);
  CREATE INDEX IF NOT EXISTS idx_logs_app ON logs(app_id);
  CREATE INDEX IF NOT EXISTS idx_logs_license ON logs(license_id);
  CREATE INDEX IF NOT EXISTS idx_apps_user ON apps(user_id);
`);

module.exports = db;
