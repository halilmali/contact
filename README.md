# Mailing App

A Node.js/Express mailing app with Google OAuth authentication and Excel contact upload.

## Setup

1. Copy `.env.example` to `.env`.
2. Set `CLIENT_ID`, `CLIENT_SECRET`, `SESSION_SECRET`, and production URL values.
3. If deployed behind a proxy, set `TRUST_PROXY=true`.

## Run locally

```bash
npm install
npm start
```

## GitHub / Deployment

If this folder is not yet a git repository, initialize and push it:

```bash
git init
git add .
git commit -m "Initial mailing app"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo>.git
git push -u origin main
```

For Railway or similar hosts, set the environment variables in the service dashboard and use `PORT` provided by the host.

## Notes

- `.env` is ignored by `.gitignore`.
- `BASE_URL` / `REDIRECT_URI` are used for OAuth redirect handling in production.
