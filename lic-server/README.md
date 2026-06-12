# LicServer

Self-hosted license key management system. Generate, validate, and manage license keys for your applications.

## Features

- **License Generation** - Create single or bulk license keys
- **HWID Locking** - Bind licenses to hardware IDs
- **Expiration Management** - Set expiry dates or lifetime keys
- **REST API** - Simple API for license verification
- **Admin Dashboard** - Web-based management interface
- **Activity Logging** - Track all verification attempts
- **Ban Management** - Block users by license key

## Quick Start

```bash
npm install
cp .env .env  # edit secrets
npm start
```

Open http://localhost:3000 - first user to register becomes admin.

## API

All endpoints require `X-API-Key` header.

| Endpoint | Method | Description |
|----------|--------|-------------|
| /api/verify | POST | Verify a license key |
| /api/activate | POST | Activate and HWID-lock a key |
| /api/deactivate | POST | Release HWID lock |
| /api/check | POST | Quick validity check |
| /api/info | POST | Get license details |
| /api/generate | POST | Generate new keys |

## Free Hosting Options

### Render.com (Recommended)
1. Push to GitHub
2. Create new Web Service on Render
3. Use "Node" environment
4. Build: `npm install`
5. Start: `node index.js`
6. Add environment variables from `.env`

### Railway.app
1. Push to GitHub
2. New Project -> Deploy from repo
3. Auto-detects Node.js

### Fly.io
```bash
fly launch
fly deploy
```
