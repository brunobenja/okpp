require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./index');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

function signToken(user) {
  return jwt.sign({ id: String(user.id), email: user.email, is_admin: user.is_admin }, JWT_SECRET, { expiresIn: '7d' });
}
function authRequired(req, res, next) {
  const token = req.cookies.auth;
  if (!token) return res.status(401).json({ error: 'Neautorizirano' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Neautorizirano' });
  }
}
function setAuthCookie(res, token) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('auth', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

// Auth
app.post('/api/register', async (req, res) => {
  try {
    const { name, surname, email, password } = req.body || {};
    if (!name || !surname || !email || !password) return res.status(400).json({ error: 'Nedostaju polja' });
    const existing = await db.getUserByEmail(email);
    if (existing) return res.status(409).json({ error: 'E-pošta je već registrirana' });
    const hash = await bcrypt.hash(password, 10);
    const user = await db.createUser(name, surname, email, hash, false);
    const token = signToken(user);
    setAuthCookie(res, token);
    res.json({ id: user.id, name: user.name, surname: user.surname, email: user.email, is_admin: user.is_admin });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Pogreška poslužitelja' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Nedostaju polja' });
    const user = await db.getUserByEmail(email);
    if (!user) return res.status(401).json({ error: 'Neispravni podaci za prijavu' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Neispravni podaci za prijavu' });
    const token = signToken(user);
    setAuthCookie(res, token);
    res.json({ id: user.id, name: user.name, surname: user.surname, email: user.email, is_admin: user.is_admin });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Pogreška poslužitelja' });
  }
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('auth', { httpOnly: true, sameSite: 'lax' });
  res.json({ ok: true });
});

app.get('/api/me', authRequired, async (req, res) => {
  res.json({ id: req.user.id, email: req.user.email, is_admin: req.user.is_admin });
});

// Trainers
app.get('/api/trainers', authRequired, async (req, res) => {
  try {
    const trainers = await db.getTrainers();
    res.json(trainers);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Pogreška poslužitelja' });
  }
});

// (Optional) Admin-only: create trainer
app.post('/api/trainers', authRequired, async (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Zabranjeno' });
  try {
    const { name, surname, sex, age, profilePic, yearsExperience, userId } = req.body || {};
    if (!name || !surname) return res.status(400).json({ error: 'Nedostaju polja' });
    const trainer = await db.createTrainer(
      name,
      surname,
      sex || null,
      age ? Number(age) : null,
      profilePic || null,
      yearsExperience ? Number(yearsExperience) : null,
      userId || null
    );
    res.json(trainer);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Pogreška poslužitelja' });
  }
});

// Appointments
app.get('/api/appointments', authRequired, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT a.id, a.scheduled_at, a.user_id, a.trainer_id,
              t.name AS trainer_name, t.surname AS trainer_surname
       FROM termini a
       JOIN treneri t ON t.id = a.trainer_id
       WHERE a.user_id = $1
       ORDER BY a.scheduled_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Pogreška poslužitelja' });
  }
});

// Get all appointments (for filtering available time slots)
app.get('/api/appointments/all', authRequired, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT a.id, a.scheduled_at, a.trainer_id
       FROM termini a
       ORDER BY a.scheduled_at DESC`,
      []
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Pogreška poslužitelja' });
  }
});

app.post('/api/appointments', authRequired, async (req, res) => {
  try {
    const { trainerId, scheduledAt } = req.body || {};
    if (!trainerId || !scheduledAt) return res.status(400).json({ error: 'Nedostaju polja' });
    const when = new Date(scheduledAt);
    if (isNaN(when.getTime())) return res.status(400).json({ error: 'Neispravan datum' });
    // Enforce hour boundary (minutes must be 00)
    if (when.getMinutes() !== 0 || when.getSeconds() !== 0 || when.getMilliseconds() !== 0) {
      return res.status(400).json({ error: 'Termini moraju počinjati na puni sat (npr. 16:00)' });
    }
    const appt = await db.bookAppointment(req.user.id, Number(trainerId), when.toISOString());
    res.json(appt);
  } catch (e) {
    if (e && e.code === '23505') return res.status(409).json({ error: 'Termin nije dostupan' });
    console.error(e);
    res.status(500).json({ error: 'Pogreška poslužitelja' });
  }
});

// Admin: view all appointments
app.get('/api/admin/appointments', authRequired, async (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Zabranjeno' });
  try {
    const { rows } = await db.query(
      `SELECT a.id, a.scheduled_at, a.user_id, a.trainer_id,
              u.name AS user_name, u.surname AS user_surname, u.email AS user_email,
              t.name AS trainer_name, t.surname AS trainer_surname
       FROM termini a
       JOIN korisnici u ON u.id = a.user_id
       JOIN treneri t ON t.id = a.trainer_id
       ORDER BY a.scheduled_at DESC`,
      []
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Pogreška poslužitelja' });
  }
});

// Admin: delete appointment - THIS MUST COME FIRST
app.delete('/api/admin/appointments/:id', authRequired, async (req, res) => {
  console.log('Admin delete route hit - User:', req.user);
  console.log('is_admin value:', req.user.is_admin, 'Type:', typeof req.user.is_admin);
  console.log('Appointment ID from params:', req.params.id);
  
  if (req.user.is_admin !== true && req.user.is_admin !== 'true') {
    console.log('Admin check FAILED');
    return res.status(403).json({ error: 'Zabranjeno' });
  }
  
  try {
    const id = Number(req.params.id);
    console.log('Parsed ID:', id, 'isNaN:', isNaN(id));
    if (!id || isNaN(id)) {
      console.log('Invalid ID provided');
      return res.status(400).json({ error: 'Neispravan ID' });
    }
    console.log('Admin deleting appointment:', id);
    await db.deleteAppointment(id);
    res.json({ ok: true });
  } catch (e) {
    console.error('Admin delete error:', e);
    res.status(500).json({ error: 'Pogreška poslužitelja' });
  }
});

// Delete user's own appointment - THIS MUST COME AFTER ADMIN ROUTE
app.delete('/api/appointments/:id', authRequired, async (req, res) => {
  console.log('User delete route hit');
  try {
    const id = Number(req.params.id);
    console.log('Delete attempt - ID:', id, 'User ID:', req.user.id, 'Type:', typeof req.user.id);
    if (!id) return res.status(400).json({ error: 'Neispravan ID' });
    
    const { rows } = await db.query('SELECT user_id FROM termini WHERE id = $1', [id]);
    console.log('Appointment found:', rows);
    
    if (!rows.length) return res.status(404).json({ error: 'Termin nije pronađen' });
    
    // Convert database user_id to string for comparison
    const dbUserId = String(rows[0].user_id);
    const tokenUserId = String(req.user.id);
    console.log('Comparing dbUserId:', dbUserId, 'with tokenUserId:', tokenUserId, 'Equal?', dbUserId === tokenUserId);
    
    if (dbUserId !== tokenUserId) {
      console.log('Ownership check FAILED');
      return res.status(403).json({ error: 'Zabranjeno' });
    }
    
    console.log('Deleting appointment...');
    await db.deleteAppointment(id);
    res.json({ ok: true });
  } catch (e) {
    console.error('Delete error:', e);
    res.status(500).json({ error: 'Pogreška poslužitelja' });
  }
});

// Fallback to index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function ensureSampleTrainers() {
  const list = await db.getTrainers();
  if (list.length > 0) {
    // Remove old English trainers if they exist
    const oldEnglishTrainers = ['Alex', 'Sam', 'Jordan'];
    for (const name of oldEnglishTrainers) {
      try {
        await db.query('DELETE FROM treneri WHERE name = $1', [name]);
      } catch (e) {
        // ignore
      }
    }
  }
}

(async () => {
  await db.init();
  await db.seedAdmin();
  await ensureSampleTrainers();
  app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
})();