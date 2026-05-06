const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const session = require('express-session');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Trust proxy headers when required by your host (e.g. Railway, Fly, Heroku)
if (process.env.NODE_ENV === 'production' || process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

const CLIENT_ID = process.env.CLIENT_ID || 'YOUR_CLIENT_ID';
const CLIENT_SECRET = process.env.CLIENT_SECRET || 'YOUR_CLIENT_SECRET';
const BASE_URL = process.env.BASE_URL || (process.env.NODE_ENV === 'production'
  ? 'https://sisbcontact.yzz.me/mailing'
  : `http://localhost:${port}`);
const REDIRECT_URI = process.env.REDIRECT_URI || `${BASE_URL}/oauth2callback`;

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const upload = multer({ dest: 'uploads/' });

function replaceMergeFields(template, contact) {
  return template.replace(/{{\s*([^{}]+)\s*}}/g, (_, key) => {
    const value = contact[key];
    return value !== undefined && value !== null ? String(value) : '';
  });
}

function normalizeHeader(header) {
  return String(header || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function isEmptyHeaderKey(key) {
  return /^__EMPTY(_\d+)?$/i.test(String(key || '').trim());
}

function cleanContactRow(contact) {
  const cleaned = {};
  Object.entries(contact).forEach(([key, value]) => {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey || isEmptyHeaderKey(normalizedKey)) return;
    cleaned[normalizedKey] = String(value ?? '').trim();
  });
  return cleaned;
}

function sanitizeContacts(contacts) {
  return contacts.map((contact) => {
    const cleaned = {};
    Object.entries(contact).forEach(([key, value]) => {
      const normalizedKey = String(key || '').trim();
      if (!normalizedKey || isEmptyHeaderKey(normalizedKey)) return;
      cleaned[normalizedKey] = String(value ?? '').trim();
    });
    return cleaned;
  });
}

function getEmailAddress(contact) {
  const keys = Object.keys(contact);
  
  // Try primary email column
  const emailKey = keys.find((key) => /email/i.test(normalizeHeader(key)) && !/email.?2/i.test(normalizeHeader(key)));
  const email = emailKey ? String(contact[emailKey]).trim() : '';
  
  if (email) {
    return email;
  }

  // Fallback to email2 column
  const email2Key = keys.find((key) => /email.?2/i.test(normalizeHeader(key)));
  return email2Key ? String(contact[email2Key]).trim() : null;
}

// Middleware to check authentication
function requireAuth(req, res, next) {
  if (!req.session.tokens) {
    return res.status(401).json({ error: 'Not authenticated. Please login first.' });
  }
  next();
}

app.post('/upload', requireAuth, upload.single('excel'), (req, res) => {
  try {
    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    // Always use first row as headers
    const contacts = xlsx.utils.sheet_to_json(sheet, { defval: '' });
    let cleanedContacts = contacts.map(cleanContactRow);
    cleanedContacts = sanitizeContacts(cleanedContacts);

    if (cleanedContacts.length === 0) {
      return res.status(400).json({ error: 'File must contain at least one data row.' });
    }

    let fields = Object.keys(cleanedContacts[0]).filter((field) => String(field).trim() && !isEmptyHeaderKey(field));

    // Find name column (Pupil, Name, Student Name, Full Name, etc.)
    const nameColumn = fields.find((key) => {
      const normalized = normalizeHeader(key);
      return /^(pupil|name|student|full name)/.test(normalized) || normalized === 'name';
    });

    if (!nameColumn) {
      return res.status(400).json({ error: 'No name column found (looking for Pupil, Name, Student, or Full Name).' });
    }

    // Find all email columns
    const emailColumns = fields.filter((key) => /email/i.test(normalizeHeader(key)));
    if (emailColumns.length === 0) {
      return res.status(400).json({ error: 'No column containing "Email" found.' });
    }

    res.json({ contacts: cleanedContacts, fields });
  } catch (error) {
    res.status(500).json({ error: 'Error parsing Excel file: ' + error.message });
  }
});

app.post('/send', requireAuth, async (req, res) => {

  const { subject, body, recipients } = req.body;
  if (!Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).send('No recipients selected.');
  }

  try {
    oauth2Client.setCredentials(req.session.tokens);

    if (!req.session.tokens.refresh_token) {
      return res.status(401).send('Authentication requires a refresh token. Please re-authenticate with Google.');
    }

    const accessTokenResponse = await oauth2Client.getAccessToken();
    const accessToken = accessTokenResponse?.token || req.session.tokens.access_token;
    if (!accessToken) {
      return res.status(500).send('Unable to obtain access token. Please try again.');
    }

    const userEmail = req.session.userEmail || req.session.tokens.email;
    if (!userEmail) {
      return res.status(500).send('Authenticated user email is missing. Please re-authenticate.');
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: userEmail,
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        refreshToken: req.session.tokens.refresh_token,
        accessToken
      }
    });

    for (const contact of recipients) {
      const toAddress = getEmailAddress(contact);
      if (!toAddress) continue;

      const personalizedSubject = replaceMergeFields(subject, contact);
      const personalizedBody = replaceMergeFields(body, contact);

      await transporter.sendMail({
        from: userEmail,
        to: toAddress,
        subject: personalizedSubject,
        text: personalizedBody
      });
    }

    res.send('Emails sent successfully');
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.get('/auth', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://mail.google.com/', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile']
  });
  res.redirect(authUrl);
});

app.get('/oauth2callback', async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    if (tokens.refresh_token) {
      req.session.tokens = tokens;
    } else if (req.session.tokens?.refresh_token) {
      req.session.tokens = {
        ...req.session.tokens,
        ...tokens,
        refresh_token: req.session.tokens.refresh_token
      };
    } else {
      req.session.tokens = tokens;
    }

    let email = 'me';
    if (tokens.id_token) {
      try {
        const ticket = await oauth2Client.verifyIdToken({
          idToken: tokens.id_token,
          audience: CLIENT_ID
        });
        const payload = ticket.getPayload();
        if (payload?.email) {
          email = payload.email;
        }
      } catch (verifyError) {
        console.warn('Unable to verify ID token for email:', verifyError.message);
      }
    }
    req.session.userEmail = email;

    res.redirect('/');
  } catch (error) {
    res.status(500).send('Authentication failed: ' + error.message);
  }
});

app.get('/auth-status', (req, res) => {
  if (req.session.tokens) {
    res.json({ authenticated: true, email: req.session.userEmail || req.session.tokens.email || 'me' });
  } else {
    res.json({ authenticated: false });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    res.json({ success: true });
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  const environment = process.env.NODE_ENV || 'development';
  const url = process.env.NODE_ENV === 'production'
    ? 'https://sisbcontact.yzz.me/mailing/'
    : `http://localhost:${port}`;
  console.log(`Server running at ${url} (${environment})`);
});