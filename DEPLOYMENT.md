# Deployment Guide

## Before Deploying to Production

### 1. Update Google Cloud Console

You must add the production redirect URI to your Google OAuth app:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Navigate to **Credentials** → **OAuth 2.0 Client IDs**
4. Edit your OAuth 2.0 client
5. Add this to **Authorized redirect URIs**:
   ```
   https://sisbcontact.yzz.me/mailing/oauth2callback
   ```
6. Save changes

### 2. Environment Variables

On your production server, create a `.env` file in the app root:

```bash
NODE_ENV=production
PORT=3000
SESSION_SECRET=generate-a-random-secure-string-here
```

Generate a secure SESSION_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Install Dependencies

```bash
cd /path/to/mailing
npm install
```

### 4. Update App Configuration

The app now automatically detects production mode:
- In production: Uses `https://sisbcontact.yzz.me/mailing/oauth2callback`
- In development: Uses `http://localhost:3000/oauth2callback`

### 5. Run the Server

**Development:**
```bash
node app.js
```

**Production (with environment variables):**
```bash
NODE_ENV=production SESSION_SECRET=your-secure-key npm start
```

Or use a process manager like PM2:
```bash
pm2 start app.js --name "mailing" --env "NODE_ENV=production"
```

### 6. Reverse Proxy Setup (Nginx)

If the app is behind a reverse proxy at `https://sisbcontact.yzz.me/mailing/`:

```nginx
location /mailing/ {
    proxy_pass http://localhost:3000/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Path /mailing;
    proxy_cache_bypass $http_upgrade;
    
    # Important: Pass the original request URI for proper redirect handling
    proxy_redirect http://localhost:3000/ https://$host/mailing/;
    proxy_redirect http://localhost:3000 https://$host/mailing;
}
```

**Important nginx settings explained:**
- `proxy_pass http://localhost:3000/;` - Routes requests to your Node.js app
- `proxy_set_header X-Forwarded-*` - Tells Node.js about the original request (HTTPS, client IP, etc.)
- `proxy_redirect` - Rewrites redirects from the app to use the correct domain and path
- `proxy_set_header Host $host` - Preserves the original hostname

### 7. Test

1. Visit `https://sisbcontact.yzz.me/mailing/`
2. Click "Sign in with Google"
3. Complete OAuth flow
4. Upload Excel file with Name/Email columns
5. Compose and send test email

### Security Notes

- Never commit `.env` files to git
- Change `SESSION_SECRET` in production
- Use HTTPS only in production
- Keep credentials safe
- Consider using a CDN for static files
