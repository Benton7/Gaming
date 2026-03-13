const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { db } = require('../db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required');
}

// ===== EMAIL TRANSPORT =====
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const EMAIL_FROM = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@5stack.gg';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

async function sendVerificationEmail(email, username, token) {
  const verifyUrl = `${APP_URL}/#/verify-email?token=${token}`;
  await transporter.sendMail({
    from: `"5-STACK" <${EMAIL_FROM}>`,
    to: email,
    subject: 'Activate your 5-STACK account',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#07071a;color:#e8e8ff;border:1px solid rgba(99,102,241,0.3);border-radius:16px;overflow:hidden">
        <div style="background:linear-gradient(135deg,#13133a,#0c0c24);padding:32px 32px 24px;text-align:center;border-bottom:1px solid rgba(99,102,241,0.2)">
          <div style="font-size:2rem;font-weight:900;letter-spacing:-0.03em;color:#e8e8ff">5-STACK</div>
          <div style="font-size:0.75rem;color:#8888b8;text-transform:uppercase;letter-spacing:0.15em;margin-top:4px">The Competitive Gaming Platform</div>
        </div>
        <div style="padding:32px">
          <p style="font-size:1.1rem;font-weight:700;margin-bottom:8px">Hey ${username},</p>
          <p style="color:#8888b8;line-height:1.7;margin-bottom:28px">You're one step away from activating your 5-STACK account. Click the button below to verify your email address and start competing.</p>
          <div style="text-align:center;margin-bottom:28px">
            <a href="${verifyUrl}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;text-decoration:none;font-weight:700;font-size:0.95rem;padding:14px 36px;border-radius:10px;letter-spacing:0.04em">
              Activate My Account
            </a>
          </div>
          <p style="font-size:0.8rem;color:#4a4a88;line-height:1.6">This link expires in 24 hours. If you didn't create a 5-STACK account, you can safely ignore this email.</p>
          <hr style="border:none;border-top:1px solid rgba(99,102,241,0.15);margin:24px 0">
          <p style="font-size:0.75rem;color:#4a4a88">Or copy this link:<br><span style="color:#6366f1;word-break:break-all">${verifyUrl}</span></p>
        </div>
      </div>
    `,
  });
}

// ===== REGISTER =====
router.post('/register', async (req, res) => {
  const { username, email, password, gamertag } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    db.prepare(
      `INSERT INTO users (username, email, password_hash, gamertag, email_verified, verification_token, verification_token_expires)
       VALUES (?, ?, ?, ?, 0, ?, ?)`
    ).run(username, email, hash, gamertag || username, token, expires);

    try {
      await sendVerificationEmail(email, username, token);
    } catch (mailErr) {
      console.error('Email send failed:', mailErr.message);
      // Don't block registration if email fails — user can request resend
    }

    res.json({ pending_verification: true, email });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed: users.username')) {
      return res.status(409).json({ error: 'Username already taken' });
    }
    if (err.message.includes('UNIQUE constraint failed: users.email')) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ===== VERIFY EMAIL =====
router.get('/verify-email', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token required' });

  const user = db.prepare('SELECT * FROM users WHERE verification_token = ?').get(token);
  if (!user) return res.status(400).json({ error: 'Invalid or expired verification link' });

  if (user.email_verified) {
    return res.json({ already_verified: true });
  }

  if (new Date(user.verification_token_expires) < new Date()) {
    return res.status(400).json({ error: 'Verification link has expired. Please register again or request a new link.' });
  }

  db.prepare(
    'UPDATE users SET email_verified = 1, verification_token = NULL, verification_token_expires = NULL WHERE id = ?'
  ).run(user.id);

  const jwtToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  const { password_hash, verification_token, verification_token_expires, ...safeUser } = user;
  res.json({ token: jwtToken, user: { ...safeUser, email_verified: 1 } });
});

// ===== RESEND VERIFICATION =====
router.post('/resend-verification', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'No account found with that email' });
  if (user.email_verified) return res.status(400).json({ error: 'Account already verified' });

  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  db.prepare('UPDATE users SET verification_token = ?, verification_token_expires = ? WHERE id = ?')
    .run(token, expires, user.id);

  try {
    await sendVerificationEmail(email, user.username, token);
    res.json({ success: true });
  } catch (err) {
    console.error('Resend email failed:', err.message);
    res.status(500).json({ error: 'Failed to send email. Check server email configuration.' });
  }
});

// ===== LOGIN =====
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (!user.email_verified) {
    return res.status(403).json({ error: 'Please verify your email before signing in.', pending_verification: true, email: user.email });
  }

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  const { password_hash, verification_token, verification_token_expires, ...safeUser } = user;
  res.json({ token, user: safeUser });
});

module.exports = router;
module.exports.JWT_SECRET = JWT_SECRET;
