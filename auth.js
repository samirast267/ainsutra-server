const express = require('express');
const jwt = require('jsonwebtoken');

const router = express.Router();

// ⚠️ এখানে তোমার Firebase projectId বসাও (src/firebase.ts এর projectId যেটা, ঠিক সেটাই)
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'ainsutra';

const CERT_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

// ---------- Firebase ID token (JWT) verification ----------
let certs = {};
let certsAt = 0;

async function getCerts(force) {
  if (!force && Date.now() - certsAt < 60 * 60 * 1000 && Object.keys(certs).length) return certs;
  const r = await fetch(CERT_URL);
  if (!r.ok) throw new Error('Could not fetch Google public keys');
  certs = await r.json();
  certsAt = Date.now();
  return certs;
}

async function verifyFirebaseToken(token) {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || !decoded.header || !decoded.header.kid) throw new Error('Malformed token');
  let all = await getCerts(false);
  let cert = all[decoded.header.kid];
  if (!cert) {
    all = await getCerts(true);
    cert = all[decoded.header.kid];
  }
  if (!cert) throw new Error('Unknown signing key');
  return jwt.verify(token, cert, {
    algorithms: ['RS256'],
    audience: PROJECT_ID,
    issuer: 'https://securetoken.google.com/' + PROJECT_ID,
  });
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Bearer token' });
  }
  try {
    req.user = await verifyFirebaseToken(header.slice(7));
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid or expired token', detail: e.message });
  }
}

// ---------- Phone verification (demo SMS gateway) ----------
// আসল SMS পাঠাতে paid gateway (Twilio / SSL Wireless) লাগে। ল্যাব ডেমোর জন্য OTP
// সার্ভারের টার্মিনালে ছাপা হয় এবং অ্যাপে "Demo SMS" হিসেবে দেখানো হয়।
// sendSms() ফাংশনের ভেতরে gateway-র কোড বসালেই আসল SMS চলবে।
const otpStore = new Map(); // uid -> { phone, code, expires, attempts }
const verifiedPhones = new Map(); // uid -> phone

const BD_PHONE = /^(?:\+?88)?(01[3-9]\d{8})$/;

function sendSms(phone, text) {
  console.log(`[SMS SIMULATOR] To ${phone}: ${text}`);
}

router.get('/me', requireAuth, (req, res) => {
  res.json({
    uid: req.user.user_id || req.user.sub,
    email: req.user.email || null,
    emailVerified: !!req.user.email_verified,
    phone: verifiedPhones.get(req.user.sub) || null,
    tokenIssuedAt: new Date(req.user.iat * 1000).toISOString(),
    tokenExpiresAt: new Date(req.user.exp * 1000).toISOString(),
    verifiedBy: 'Express server (RS256 signature checked against Google public keys)',
  });
});

router.post('/phone/send-otp', requireAuth, (req, res) => {
  const m = BD_PHONE.exec(String((req.body && req.body.phone) || '').replace(/[\s-]/g, ''));
  if (!m) return res.status(400).json({ error: 'Enter a valid Bangladeshi mobile number (01XXXXXXXXX)' });
  const phone = '+88' + m[1];
  const code = String(Math.floor(100000 + Math.random() * 900000));
  otpStore.set(req.user.sub, { phone, code, expires: Date.now() + 5 * 60 * 1000, attempts: 0 });
  sendSms(phone, `Your AinSutra verification code is ${code}. It expires in 5 minutes.`);
  res.json({
    message: 'OTP sent',
    phone,
    demoSms: process.env.DEMO_SMS === 'off' ? undefined : `Your AinSutra verification code is ${code}`,
  });
});

router.post('/phone/verify-otp', requireAuth, (req, res) => {
  const entry = otpStore.get(req.user.sub);
  const code = String((req.body && req.body.otp) || '').trim();
  if (!entry) return res.status(400).json({ error: 'No OTP requested. Send an OTP first.' });
  if (Date.now() > entry.expires) {
    otpStore.delete(req.user.sub);
    return res.status(400).json({ error: 'OTP expired. Request a new one.' });
  }
  entry.attempts += 1;
  if (entry.attempts > 5) {
    otpStore.delete(req.user.sub);
    return res.status(429).json({ error: 'Too many wrong attempts. Request a new OTP.' });
  }
  if (code !== entry.code) return res.status(400).json({ error: 'Wrong OTP' });
  verifiedPhones.set(req.user.sub, entry.phone);
  otpStore.delete(req.user.sub);
  res.json({ verified: true, phone: entry.phone });
});

module.exports = router;
module.exports.verifyFirebaseToken = verifyFirebaseToken;