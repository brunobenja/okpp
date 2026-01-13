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

// Simple in-memory catalog of services (all trainers can offer these)
const SERVICES = [
  { id: 'func', name: 'Funkcionalni trening', duration: 60 },
  { id: 'snaga', name: 'Trening snage', duration: 60 },
  { id: 'crossfit', name: 'Crossfit', duration: 45 },
  { id: 'masaza', name: 'Masaža', duration: 90 },
];

// Trainer-service mappings (trainer ID -> array of service IDs)
const TRAINER_SERVICES = {
  // Will be populated dynamically based on trainer IDs
};

function getServiceById(id) {
  return SERVICES.find(s => s.id === id) || null;
}

function getTrainerServices(trainerId) {
  return TRAINER_SERVICES[trainerId] || [];
}

function setTrainerServices(trainerId, serviceIds) {
  TRAINER_SERVICES[trainerId] = serviceIds;
}

function signToken(user) {
  return jwt.sign({ id: String(user.id), email: user.email, is_admin: user.is_admin }, JWT_SECRET, { expiresIn: '7d' });
}
function isAdminUser(user) {
  return user && (user.is_admin === true || user.is_admin === 'true');
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

function formatHourLabel(hour) {
  return `${String(hour).padStart(2, '0')}:00`;
}

async function getEffectiveWorkHours(trainerId, dateStr = null) {
  if (trainerId) {
    if (dateStr) {
      const override = await db.getTrainerWorkHoursForDate(Number(trainerId), dateStr);
      if (override) return { ...override, source: 'override' };
    }
    const specific = await db.getTrainerWorkHours(Number(trainerId));
    if (specific) return { ...specific, source: 'trainer' };
  }
  const global = await db.getWorkHours();
  return { ...global, source: 'global' };
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

app.get('/api/user', authRequired, async (req, res) => {
  try {
    const userId = parseInt(req.user.id);
    const user = await db.getUserById(userId);
    if (!user) return res.status(404).json({ error: 'Korisnik nije pronađen' });
    res.json({ id: user.id, name: user.name, surname: user.surname, email: user.email });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Pogreška poslužitelja' });
  }
});

// Services
app.get('/api/services', authRequired, async (req, res) => {
  res.json(SERVICES);
});

app.get('/api/work-hours', authRequired, async (req, res) => {
  try {
    const hours = await db.getWorkHours();
    res.json(hours);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Pogreška poslužitelja' });
  }
});

app.get('/api/trainer/:id/work-hours', authRequired, async (req, res) => {
  try {
    const trainerId = Number(req.params.id);
    if (!trainerId) return res.status(400).json({ error: 'Neispravan ID trenera' });
    const dateStr = req.query.date || null;
    const hours = await getEffectiveWorkHours(trainerId, dateStr);
    res.json(hours);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Pogreška poslužitelja' });
  }
});

app.get('/api/admin/trainer/:id/work-hours', authRequired, async (req, res) => {
  if (!isAdminUser(req.user)) return res.status(403).json({ error: 'Zabranjeno' });
  try {
    const trainerId = Number(req.params.id);
    if (!trainerId) return res.status(400).json({ error: 'Neispravan ID trenera' });
    const dateStr = req.query.date || null;
    const effective = await getEffectiveWorkHours(trainerId, dateStr);
    const base = await db.getTrainerWorkHours(trainerId);
    const overrides = await db.listTrainerWorkHourOverrides(trainerId);
    res.json({ effective, base, overrides });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Pogreška poslužitelja' });
  }
});

// Trainers
app.get('/api/trainers', authRequired, async (req, res) => {
  try {
    const { type } = req.query;
    let trainers;
    if (type) {
      trainers = await db.getTrainersByType(type);
    } else {
      trainers = await db.getTrainers();
    }
    res.json(trainers);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Pogreška poslužitelja' });
  }
});

app.get('/api/trainer-types', authRequired, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT DISTINCT trainer_type FROM treneri WHERE trainer_type IS NOT NULL ORDER BY trainer_type',
      []
    );
    res.json(rows.map(r => r.trainer_type));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Pogreška poslužitelja' });
  }
});

app.get('/api/admin/clients', authRequired, async (req, res) => {
  if (!isAdminUser(req.user)) return res.status(403).json({ error: 'Zabranjeno' });
  try {
    const clients = await db.getUsers();
    res.json(clients);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Pogreška poslužitelja' });
  }
});

// (Optional) Admin-only: create trainer
app.post('/api/trainers', authRequired, async (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Zabranjeno' });
  try {
    const { name, surname, sex, age, profilePic, yearsExperience, userId, trainerType } = req.body || {};
    if (!name || !surname) return res.status(400).json({ error: 'Nedostaju polja' });
    const trainer = await db.createTrainer(
      name,
      surname,
      sex || null,
      age ? Number(age) : null,
      profilePic || null,
      yearsExperience ? Number(yearsExperience) : null,
      userId || null,
      trainerType || null
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
      `SELECT a.id, a.scheduled_at, a.user_id, a.trainer_id, a.duration_minutes, a.service_name,
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
      `SELECT a.id, a.scheduled_at, a.trainer_id, a.duration_minutes
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

// Admin: Cancel all future appointments (no 24h restriction)
app.post('/api/admin/appointments/cancel-all', authRequired, async (req, res) => {
  if (!isAdminUser(req.user)) return res.status(403).json({ error: 'Zabranjeno' });
  try {
    const { rows } = await db.query(
      `SELECT id, scheduled_at FROM termini ORDER BY scheduled_at ASC`,
      []
    );
    let cancelled = 0;
    let failed = 0;
    for (const appt of rows) {
      try {
        await db.cancelAppointment(appt.id, 'admin');
        cancelled++;
      } catch (e) {
        failed++;
      }
    }
    res.json({ cancelled, failed });
  } catch (e) {
    console.error('Admin bulk cancel error:', e);
    res.status(500).json({ error: 'Pogreška poslužitelja' });
  }
});
// Cancel all upcoming appointments for the current user (respect 24h policy)
app.post('/api/appointments/cancel-all', authRequired, async (req, res) => {
  try {
    // Fetch all appointments for user
    const { rows } = await db.query(
      `SELECT id, scheduled_at FROM termini WHERE user_id = $1 ORDER BY scheduled_at ASC`,
      [req.user.id]
    );

    const now = new Date();
    let cancelled = 0;
    let skipped = 0;

    for (const appt of rows) {
      const scheduledAt = new Date(appt.scheduled_at);
      const hoursUntilAppt = (scheduledAt - now) / (1000 * 60 * 60);
      // Respect 24-hour cancellation policy
      if (hoursUntilAppt >= 24) {
        try {
          await db.cancelAppointment(appt.id, 'user');
          cancelled++;
        } catch (e) {
          // If a single cancellation fails, count as skipped
          skipped++;
        }
      } else {
        skipped++;
      }
    }

    res.json({ cancelled, skipped });
  } catch (e) {
    console.error('Bulk cancel error:', e);
    res.status(500).json({ error: 'Pogreška poslužitelja' });
  }
});

app.post('/api/appointments', authRequired, async (req, res) => {
  try {
    const { trainerId, scheduledAt, serviceId } = req.body || {};
    if (!trainerId || !scheduledAt) return res.status(400).json({ error: 'Nedostaju polja' });
    const when = new Date(scheduledAt);
    if (isNaN(when.getTime())) return res.status(400).json({ error: 'Neispravan datum' });
    // Enforce hour boundary (minutes must be 00)
    if (when.getMinutes() !== 0 || when.getSeconds() !== 0 || when.getMilliseconds() !== 0) {
      return res.status(400).json({ error: 'Termini moraju počinjati na puni sat (npr. 16:00)' });
    }
    const service = serviceId ? getServiceById(serviceId) : null;
    const duration = service ? service.duration : 60;
    const serviceName = service ? service.name : null;

    const dateStr = when.toISOString().slice(0, 10);
    const { open_hour, close_hour } = await getEffectiveWorkHours(trainerId, dateStr);
    const openHour = Number(open_hour ?? 8);
    const closeHour = Number(close_hour ?? 20);
    const startHour = when.getHours();
    if (startHour < openHour || startHour > closeHour) {
      return res.status(400).json({ error: `Termini su dostupni između ${formatHourLabel(openHour)} i ${formatHourLabel(closeHour)}` });
    }

    // Check trainer overlap
    const startIso = when.toISOString();
    const endIso = new Date(when.getTime() + duration * 60000).toISOString();
    const trainerOverlap = await db.query(
      `SELECT 1 FROM termini
       WHERE trainer_id = $1
         AND scheduled_at < $3
         AND (scheduled_at + (duration_minutes || ' minutes')::interval) > $2
       LIMIT 1`,
      [Number(trainerId), startIso, endIso]
    );
    if (trainerOverlap.rows.length) return res.status(409).json({ error: 'Termin nije dostupan' });

    // Check user overlap
    const userOverlap = await db.query(
      `SELECT 1 FROM termini
       WHERE user_id = $1
         AND scheduled_at < $3
         AND (scheduled_at + (duration_minutes || ' minutes')::interval) > $2
       LIMIT 1`,
      [Number(req.user.id), startIso, endIso]
    );
    if (userOverlap.rows.length) return res.status(409).json({ error: 'Već imate termin u odabranom periodu' });

    const appt = await db.bookAppointmentWithDetails(req.user.id, Number(trainerId), when.toISOString(), duration, serviceName);
    res.json(appt);
  } catch (e) {
    if (e && e.code === '23505') return res.status(409).json({ error: 'Termin nije dostupan' });
    console.error(e);
    res.status(500).json({ error: 'Pogreška poslužitelja' });
  }
});

// Admin: create appointment for an existing client
app.post('/api/admin/appointments', authRequired, async (req, res) => {
  if (!isAdminUser(req.user)) return res.status(403).json({ error: 'Zabranjeno' });
  try {
    const { userId, trainerId, scheduledAt, serviceId } = req.body || {};
    if (!userId || !trainerId || !scheduledAt) return res.status(400).json({ error: 'Nedostaju polja' });
    
    // Verify user exists
    const user = await db.getUserById(Number(userId));
    if (!user) return res.status(404).json({ error: 'Korisnik nije pronađen' });
    
    const when = new Date(scheduledAt);
    if (isNaN(when.getTime())) return res.status(400).json({ error: 'Neispravan datum' });
    
    // Enforce hour boundary
    if (when.getMinutes() !== 0 || when.getSeconds() !== 0 || when.getMilliseconds() !== 0) {
      return res.status(400).json({ error: 'Termini moraju počinjati na puni sat (npr. 16:00)' });
    }
    
    const service = serviceId ? getServiceById(serviceId) : null;
    const duration = service ? service.duration : 60;
    const serviceName = service ? service.name : null;

    const dateStr = when.toISOString().slice(0, 10);
    const { open_hour, close_hour } = await getEffectiveWorkHours(trainerId, dateStr);
    const openHour = Number(open_hour ?? 8);
    const closeHour = Number(close_hour ?? 20);
    const startHour = when.getHours();
    if (startHour < openHour || startHour > closeHour) {
      return res.status(400).json({ error: `Termini su dostupni između ${formatHourLabel(openHour)} i ${formatHourLabel(closeHour)}` });
    }

    // Check trainer overlap
    const startIso = when.toISOString();
    const endIso = new Date(when.getTime() + duration * 60000).toISOString();
    const trainerOverlap = await db.query(
      `SELECT 1 FROM termini
       WHERE trainer_id = $1
         AND scheduled_at < $3
         AND (scheduled_at + (duration_minutes || ' minutes')::interval) > $2
       LIMIT 1`,
      [Number(trainerId), startIso, endIso]
    );
    if (trainerOverlap.rows.length) return res.status(409).json({ error: 'Termin nije dostupan za trenera' });

    // Check user overlap
    const userOverlap = await db.query(
      `SELECT 1 FROM termini
       WHERE user_id = $1
         AND scheduled_at < $3
         AND (scheduled_at + (duration_minutes || ' minutes')::interval) > $2
       LIMIT 1`,
      [Number(userId), startIso, endIso]
    );
    if (userOverlap.rows.length) return res.status(409).json({ error: 'Korisnik već ima termin u odabranom periodu' });

    const appt = await db.bookAppointmentWithDetails(Number(userId), Number(trainerId), when.toISOString(), duration, serviceName);
    res.json(appt);
  } catch (e) {
    if (e && e.code === '23505') return res.status(409).json({ error: 'Termin nije dostupan' });
    console.error(e);
    res.status(500).json({ error: 'Pogreška poslužitelja' });
  }
});

// Update user's own appointment (reschedule and/or change trainer/service)
app.put('/api/appointments/:id', authRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) return res.status(400).json({ error: 'Neispravan ID' });

    const { scheduledAt, trainerId, serviceId } = req.body || {};
    if (!scheduledAt && !trainerId && !serviceId) return res.status(400).json({ error: 'Nedostaju podaci za izmjenu' });

    // Load appointment and verify ownership
    const { rows: apptRows } = await db.query('SELECT id, user_id, trainer_id, duration_minutes FROM termini WHERE id = $1', [id]);
    if (!apptRows.length) return res.status(404).json({ error: 'Termin nije pronađen' });
    const appt = apptRows[0];

    if (String(appt.user_id) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Zabranjeno' });
    }

    console.log('PUT /api/appointments/:id', {
      id,
      incomingTrainerId: trainerId,
      incomingScheduledAt: scheduledAt,
    });

    const newTrainerId = trainerId ? Number(trainerId) : Number(appt.trainer_id);
    const chosenService = serviceId ? getServiceById(serviceId) : null;
    const newDuration = chosenService ? chosenService.duration : Number(appt.duration_minutes);
    const newServiceName = chosenService ? chosenService.name : null;

    let whenIso = null;
    if (scheduledAt) {
      const when = new Date(scheduledAt);
      if (isNaN(when.getTime())) return res.status(400).json({ error: 'Neispravan datum' });
      if (when.getMinutes() !== 0 || when.getSeconds() !== 0 || when.getMilliseconds() !== 0) {
        return res.status(400).json({ error: 'Termini moraju počinjati na puni sat (npr. 16:00)' });
      }
      whenIso = when.toISOString();
    }

    try {
      console.log('Updating appointment with', { newTrainerId, whenIso, id, userId: appt.user_id, newDuration, newServiceName });

      // Determine final start time for overlap check
      const { rows: currentRows } = await db.query('SELECT scheduled_at FROM termini WHERE id = $1', [id]);
      const currentStart = new Date(currentRows[0].scheduled_at);
      const startDate = whenIso ? new Date(whenIso) : currentStart;
      const startIso = startDate.toISOString();
      const endIso = new Date(startDate.getTime() + newDuration * 60000).toISOString();

      const startDateStr = startIso.slice(0, 10);
      const { open_hour, close_hour } = await getEffectiveWorkHours(newTrainerId, startDateStr);
      const openHour = Number(open_hour ?? 8);
      const closeHour = Number(close_hour ?? 20);
      const startHour = startDate.getHours();
      if (startHour < openHour || startHour > closeHour) {
        return res.status(400).json({ error: `Termini su dostupni između ${formatHourLabel(openHour)} i ${formatHourLabel(closeHour)}` });
      }

      // Overlap checks (exclude this appointment id)
      const trainerOverlap = await db.query(
        `SELECT 1 FROM termini
         WHERE id <> $1 AND trainer_id = $2
           AND scheduled_at < $4
           AND (scheduled_at + (duration_minutes || ' minutes')::interval) > $3
         LIMIT 1`,
        [id, newTrainerId, startIso, endIso]
      );
      if (trainerOverlap.rows.length) return res.status(409).json({ error: 'Termin nije dostupan' });

      const userOverlap = await db.query(
        `SELECT 1 FROM termini
         WHERE id <> $1 AND user_id = $2
           AND scheduled_at < $4
           AND (scheduled_at + (duration_minutes || ' minutes')::interval) > $3
         LIMIT 1`,
        [id, appt.user_id, startIso, endIso]
      );
      if (userOverlap.rows.length) return res.status(409).json({ error: 'Već imate termin u odabranom periodu' });

      const { rows: updated } = await db.query(
        'UPDATE termini SET trainer_id = $1, scheduled_at = COALESCE($2, scheduled_at), duration_minutes = $3, service_name = COALESCE($4, service_name) WHERE id = $5 AND user_id = $6 RETURNING *',
        [newTrainerId, whenIso, newDuration, newServiceName, id, appt.user_id]
      );
      if (!updated.length) return res.status(404).json({ error: 'Termin nije pronađen' });
      res.json(updated[0]);
    } catch (e) {
      console.error('PUT update error:', e);
      if (e && e.code === '23505') return res.status(409).json({ error: 'Termin nije dostupan' });
      console.error(e);
      return res.status(500).json({ error: 'Pogreška poslužitelja' });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Pogreška poslužitelja' });
  }
});

// Admin: set global work hours
app.put('/api/admin/work-hours', authRequired, async (req, res) => {
  if (!isAdminUser(req.user)) return res.status(403).json({ error: 'Zabranjeno' });
  try {
    const { openHour, closeHour } = req.body || {};
    if (openHour === undefined || closeHour === undefined) {
      return res.status(400).json({ error: 'Nedostaju sati' });
    }
    const saved = await db.setWorkHours(openHour, closeHour);
    res.json(saved);
  } catch (e) {
    console.error('Admin work-hours update error:', e);
    if (e && typeof e.message === 'string' && e.message.toLowerCase().includes('hour')) {
      return res.status(400).json({ error: e.message });
    }
    res.status(500).json({ error: 'Pogreška poslužitelja' });
  }
});

// Admin: set trainer-specific work hours
app.put('/api/admin/trainer-work-hours', authRequired, async (req, res) => {
  if (!isAdminUser(req.user)) return res.status(403).json({ error: 'Zabranjeno' });
  try {
    const { trainerId, openHour, closeHour } = req.body || {};
    if (!trainerId || openHour === undefined || closeHour === undefined) {
      return res.status(400).json({ error: 'Nedostaju podaci' });
    }
    const saved = await db.setTrainerWorkHours(Number(trainerId), openHour, closeHour);
    res.json(saved);
  } catch (e) {
    console.error('Admin trainer work-hours update error:', e);
    const msg = (e && typeof e.message === 'string') ? e.message : 'Pogreška poslužitelja';
    if (msg.toLowerCase().includes('hour')) {
      return res.status(400).json({ error: msg });
    }
    res.status(500).json({ error: msg });
  }
});

// Admin: set trainer-specific work hours for a date range
app.put('/api/admin/trainer-work-hours-range', authRequired, async (req, res) => {
  if (!isAdminUser(req.user)) return res.status(403).json({ error: 'Zabranjeno' });
  try {
    const { trainerId, startDate, endDate, openHour, closeHour } = req.body || {};
    if (!trainerId || !startDate || !endDate || openHour === undefined || closeHour === undefined) {
      return res.status(400).json({ error: 'Nedostaju podaci' });
    }
    const saved = await db.setTrainerWorkHoursRange(Number(trainerId), startDate, endDate, openHour, closeHour);
    res.json(saved);
  } catch (e) {
    console.error('Admin trainer work-hours range update error:', e);
    const msg = (e && typeof e.message === 'string') ? e.message : 'Pogreška poslužitelja';
    if (msg.toLowerCase().includes('hour') || msg.toLowerCase().includes('date')) {
      return res.status(400).json({ error: msg });
    }
    res.status(500).json({ error: msg });
  }
});

app.get('/api/admin/statistics', authRequired, async (req, res) => {
  if (!isAdminUser(req.user)) return res.status(403).json({ error: 'Zabranjeno' });
  try {
    const stats = await db.getStatistics();
    res.json(stats);
  } catch (e) {
    console.error('Admin statistics error:', e);
    res.status(500).json({ error: 'Pogreška poslužitelja' });
  }
});

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
    await db.cancelAppointment(id, 'admin');
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
    
    // Check 24-hour cancellation policy
    const { rows: apptRows } = await db.query('SELECT scheduled_at FROM termini WHERE id = $1', [id]);
    if (apptRows.length) {
      const scheduledAt = new Date(apptRows[0].scheduled_at);
      const now = new Date();
      const hoursUntilAppt = (scheduledAt - now) / (1000 * 60 * 60);
      
      if (hoursUntilAppt < 24) {
        return res.status(400).json({ error: 'Ne možete otkazati termin manje od 24 sata prije početka' });
      }
    }
    
    console.log('Deleting appointment...');
    await db.cancelAppointment(id, 'user');
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
    
    // Assign different services to different trainers
    list.forEach((trainer, idx) => {
      const allServiceIds = SERVICES.map(s => s.id);
      let trainerServices = [];
      
      // Distribute services: some trainers have 2, some 3, some all 4
      if (idx % 3 === 0) {
        // Every 3rd trainer: all services
        trainerServices = allServiceIds;
      } else if (idx % 3 === 1) {
        // Every 3rd+1 trainer: 3 services
        trainerServices = allServiceIds.slice(0, 3);
      } else {
        // Every 3rd+2 trainer: 2 services
        trainerServices = allServiceIds.slice(0, 2);
      }
      
      setTrainerServices(trainer.id, trainerServices);
    });
  }
}

(async () => {
  await db.init();
  await db.seedAdmin();
  await db.seedTestData();
  await ensureSampleTrainers();
  app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
})();