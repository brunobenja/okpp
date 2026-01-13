require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs'); // add this

const useConnStr = !!process.env.DATABASE_URL;
// Safe diagnostic (does NOT print secrets)
console.log('PG env types:', {
  host: typeof process.env.PGHOST,
  port: typeof process.env.PGPORT,
  user: typeof process.env.PGUSER,
  passwordType: typeof process.env.PGPASSWORD,
  passwordLen: String(process.env.PGPASSWORD || '').length,
  database: typeof process.env.PGDATABASE,
  useConnStr: !!process.env.DATABASE_URL,
});

let pool;
if (useConnStr && process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : false,
  });
} else {
  const host = process.env.PGHOST || 'localhost';
  const port = String(process.env.PGPORT || 5432);
  const user = process.env.PGUSER || 'postgres';
  // Fallback: if PGPASSWORD is missing/empty, use a local default from .env
  const password = (process.env.PGPASSWORD && process.env.PGPASSWORD.length)
    ? String(process.env.PGPASSWORD)
    : 'tinubra2004';
  const database = process.env.PGDATABASE || 'postgres';
  const connStr = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
  console.log('PG connStr (masked):', `postgresql://${user}:***@${host}:${port}/${database}`);
  pool = new Pool({
    connectionString: connStr,
    ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : false,
  });
}

// Simple helper to run parameterized queries safely
async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  console.log(`query: ${text} | params: ${JSON.stringify(params)} | ${duration}ms`);
  return res;
}

// Create required tables
async function init() {
  // Drop existing English-named tables if they exist
  await query(`DROP TABLE IF EXISTS appointments CASCADE`);
  await query(`DROP TABLE IF EXISTS trainers CASCADE`);
  await query(`DROP TABLE IF EXISTS users CASCADE`);

  // Create Croatian-named tables
  await query(`
    CREATE TABLE IF NOT EXISTS korisnici (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      surname TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      is_admin BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS treneri (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      surname TEXT NOT NULL,
      sex TEXT,
      age INT CHECK (age > 0),
      profile_pic TEXT,
      years_experience INT CHECK (years_experience >= 0),
      user_id INT UNIQUE REFERENCES korisnici(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  
  // Add columns if they don't exist (for existing databases)
  await query(`ALTER TABLE treneri ADD COLUMN IF NOT EXISTS profile_pic TEXT`);
  await query(`ALTER TABLE treneri ADD COLUMN IF NOT EXISTS years_experience INT`);
  await query(`ALTER TABLE treneri ADD COLUMN IF NOT EXISTS user_id INT UNIQUE REFERENCES korisnici(id) ON DELETE SET NULL`);
  await query(`ALTER TABLE treneri ADD COLUMN IF NOT EXISTS trainer_type TEXT`);

  await query(`
    CREATE TABLE IF NOT EXISTS termini (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES korisnici(id) ON DELETE CASCADE,
      trainer_id INT NOT NULL REFERENCES treneri(id) ON DELETE CASCADE,
      scheduled_at TIMESTAMPTZ NOT NULL,
      duration_minutes INT NOT NULL DEFAULT 60,
      service_name TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE (trainer_id, scheduled_at),
      UNIQUE (user_id, scheduled_at),
      CHECK (EXTRACT(MINUTE FROM scheduled_at) = 0)
    )
  `);

  // Add columns if missing for existing databases
  await query(`ALTER TABLE termini ADD COLUMN IF NOT EXISTS service_name TEXT`);
  await query(`ALTER TABLE treneri ADD COLUMN IF NOT EXISTS services JSONB`);

  await query(`
    CREATE TABLE IF NOT EXISTS work_hours (
      id SERIAL PRIMARY KEY,
      open_hour INT NOT NULL CHECK (open_hour >= 0 AND open_hour <= 23),
      close_hour INT NOT NULL CHECK (close_hour >= 0 AND close_hour <= 23),
      updated_at TIMESTAMPTZ DEFAULT now(),
      CHECK (open_hour < close_hour)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS trainer_work_hours (
      trainer_id INT PRIMARY KEY REFERENCES treneri(id) ON DELETE CASCADE,
      open_hour INT NOT NULL CHECK (open_hour >= 0 AND open_hour <= 23),
      close_hour INT NOT NULL CHECK (close_hour >= 0 AND close_hour <= 23),
      updated_at TIMESTAMPTZ DEFAULT now(),
      CHECK (open_hour < close_hour)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS trainer_work_hour_overrides (
      id SERIAL PRIMARY KEY,
      trainer_id INT NOT NULL REFERENCES treneri(id) ON DELETE CASCADE,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      open_hour INT NOT NULL CHECK (open_hour >= 0 AND open_hour <= 23),
      close_hour INT NOT NULL CHECK (close_hour >= 0 AND close_hour <= 23),
      updated_at TIMESTAMPTZ DEFAULT now(),
      CHECK (open_hour < close_hour),
      CHECK (start_date <= end_date)
    )
  `);

  await query(
    `INSERT INTO work_hours (id, open_hour, close_hour)
     VALUES (1, 8, 20)
     ON CONFLICT (id) DO NOTHING`
  );

  await query(`
    CREATE TABLE IF NOT EXISTS cancellations (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      trainer_id INT NOT NULL,
      scheduled_at TIMESTAMPTZ NOT NULL,
      service_name TEXT,
      duration_minutes INT,
      cancelled_at TIMESTAMPTZ DEFAULT now(),
      cancelled_by TEXT NOT NULL,
      reason TEXT
    )
  `);
}

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Admin';
  const surname = process.env.ADMIN_SURNAME || '';
  if (!email || !password) {
    console.log('No ADMIN_EMAIL/ADMIN_PASSWORD provided; skipping admin seed');
    return;
  }
  const hash = await bcrypt.hash(password, 10);
  await query(
    `
    INSERT INTO korisnici (name, surname, email, password, is_admin)
    VALUES ($1, $2, $3, $4, true)
    ON CONFLICT (email) DO UPDATE
      SET is_admin = true,
          password = EXCLUDED.password
    `,
    [name, surname, email, hash]
  );
  console.log(`Admin ensured for ${email}`);
}

async function seedTestData() {
  try {
    // Clear existing data
    await query('DELETE FROM termini');
    await query('DELETE FROM treneri');
    // Delete test users but keep admin
    await query(`DELETE FROM korisnici WHERE email NOT LIKE '%okpp.admin%'`);
    
    // Create test users
    const users = [
      await createUser('Ivan', 'Horvat', 'ivan.horvat@mail.com', await bcrypt.hash('lozinka123', 10), false),
      await createUser('Ana', 'Kovač', 'ana.kovac@mail.com', await bcrypt.hash('lozinka456', 10), false),
      await createUser('Marko', 'Novak', 'marko.novak@mail.com', await bcrypt.hash('lozinka789', 10), false),
    ];
    
    // Create test trainers
    const trainerNames = [
      { name: 'Petar', surname: 'Babić', sex: 'M', age: 28, type: 'Personal Trainer' },
      { name: 'Marija', surname: 'Jurić', sex: 'F', age: 32, type: 'Yoga Instructor' },
      { name: 'Luka', surname: 'Knežević', sex: 'M', age: 35, type: 'CrossFit Coach' },
      { name: 'Ivana', surname: 'Marić', sex: 'F', age: 27, type: 'Pilates Instructor' },
      { name: 'Krešimir', surname: 'Perić', sex: 'M', age: 30, type: 'Strength Coach' },
      { name: 'Jelena', surname: 'Radić', sex: 'F', age: 29, type: 'Massage Therapist' },
      { name: 'Tomislav', surname: 'Božić', sex: 'M', age: 33, type: 'Personal Trainer' },
      { name: 'Sara', surname: 'Pavić', sex: 'F', age: 26, type: 'Cardio Specialist' },
      { name: 'Nikola', surname: 'Petrović', sex: 'M', age: 31, type: 'CrossFit Coach' },
      { name: 'Maja', surname: 'Vuković', sex: 'F', age: 28, type: 'Yoga Instructor' },
    ];
    
    const trainers = [];
    const maleImages = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
    const femaleImages = [44, 45, 46, 47, 48, 49, 50, 51, 52, 53];
    let maleIdx = 0, femaleIdx = 0;
    
    for (const t of trainerNames) {
      const profilePic = t.sex === 'M' 
        ? `https://i.pravatar.cc/150?img=${maleImages[maleIdx++ % maleImages.length]}`
        : `https://i.pravatar.cc/150?img=${femaleImages[femaleIdx++ % femaleImages.length]}`;
      const trainer = await createTrainer(t.name, t.surname, t.sex, t.age, profilePic, 5 + Math.floor(Math.random() * 8), null, t.type);
      trainers.push(trainer);
    }
    
    // Create 100 test appointments
    const serviceNames = ['Funkcionalni trening', 'Trening snage', 'Crossfit', 'Masaža'];
    const serviceDurations = { 'Funkcionalni trening': 60, 'Trening snage': 60, 'Crossfit': 45, 'Masaža': 90 };
    
    const startDate = new Date('2026-01-11');
    let appointmentCount = 0;
    
    for (let dayOffset = 0; dayOffset < 8; dayOffset++) {
      for (let hour = 7; hour < 20; hour++) {
        if (appointmentCount >= 100) break;
        
        const date = new Date(startDate);
        date.setDate(date.getDate() + dayOffset);
        date.setHours(hour, 0, 0, 0);
        
        const trainerId = trainers[Math.floor(Math.random() * trainers.length)].id;
        const userId = users[Math.floor(Math.random() * users.length)].id;
        const serviceName = serviceNames[Math.floor(Math.random() * serviceNames.length)];
        const duration = serviceDurations[serviceName];
        
        try {
          await query(
            'INSERT INTO termini (user_id, trainer_id, scheduled_at, duration_minutes, service_name) VALUES ($1, $2, $3, $4, $5)',
            [userId, trainerId, date.toISOString(), duration, serviceName]
          );
          appointmentCount++;
        } catch (e) {
          // Unique constraint violation, skip
        }
      }
      if (appointmentCount >= 100) break;
    }
    
    console.log('✓ Test data seeded successfully');
  } catch (e) {
    console.error('Error seeding test data:', e.message);
  }
}

// Minimal helpers
async function createUser(name, surname, email, password, isAdmin = false) {
  const { rows } = await query(
    'INSERT INTO korisnici (name, surname, email, password, is_admin) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [name, surname, email, password, isAdmin]
  );
  return rows[0];
}
async function getUserByEmail(email) {
  const { rows } = await query('SELECT * FROM korisnici WHERE email = $1', [email]);
  return rows[0] || null;
}
async function getUserById(id) {
  const { rows } = await query('SELECT * FROM korisnici WHERE id = $1', [id]);
  return rows[0] || null;
}
async function createTrainer(name, surname, sex, age, profilePic = null, yearsExperience = null, userId = null, trainerType = null) {
  const { rows } = await query(
    'INSERT INTO treneri (name, surname, sex, age, profile_pic, years_experience, user_id, trainer_type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
    [name, surname, sex, age, profilePic, yearsExperience, userId, trainerType]
  );
  return rows[0];
}
async function getTrainers() {
  const { rows } = await query('SELECT * FROM treneri ORDER BY surname, name', []);
  return rows;
}
async function getTrainersByType(type) {
  const { rows } = await query('SELECT * FROM treneri WHERE trainer_type = $1 ORDER BY surname, name', [type]);
  return rows;
}
async function getUsers() {
  const { rows } = await query('SELECT id, name, surname, email FROM korisnici WHERE is_admin = false ORDER BY surname, name', []);
  return rows;
}

async function bookAppointment(userId, trainerId, scheduledAt) {
  const { rows } = await query(
    'INSERT INTO termini (user_id, trainer_id, scheduled_at) VALUES ($1, $2, $3) RETURNING *',
    [userId, trainerId, scheduledAt]
  );
  return rows[0];
}
async function bookAppointmentWithDetails(userId, trainerId, scheduledAt, durationMinutes, serviceName) {
  const { rows } = await query(
    'INSERT INTO termini (user_id, trainer_id, scheduled_at, duration_minutes, service_name) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [userId, trainerId, scheduledAt, durationMinutes, serviceName]
  );
  return rows[0];
}
async function getAppointmentsForUser(userId) {
  const { rows } = await query(
    `SELECT a.id, a.scheduled_at, t.name AS trainer_name, t.surname AS trainer_surname
     FROM termini a
     JOIN treneri t ON t.id = a.trainer_id
     WHERE a.user_id = $1
     ORDER BY a.scheduled_at DESC`,
    [userId]
  );
  return rows;
}

async function getAllAppointments() {
  const { rows } = await query(
    `SELECT a.id, a.scheduled_at,
            u.name AS user_name, u.surname AS user_surname, u.email AS user_email,
            t.name AS trainer_name, t.surname AS trainer_surname
     FROM termini a
     JOIN korisnici u ON u.id = a.user_id
     JOIN treneri t ON t.id = a.trainer_id
     ORDER BY a.scheduled_at DESC`,
    []
  );
  return rows;
}

async function deleteAppointment(id) {
  await query('DELETE FROM termini WHERE id = $1', [id]);
}

async function cancelAppointment(id, cancelledBy, reason = null) {
  // First, fetch the appointment details
  const { rows } = await query(
    'SELECT user_id, trainer_id, scheduled_at, service_name, duration_minutes FROM termini WHERE id = $1',
    [id]
  );
  if (!rows.length) throw new Error('Appointment not found');
  
  const appt = rows[0];
  
  // Record the cancellation
  await query(
    `INSERT INTO cancellations (user_id, trainer_id, scheduled_at, service_name, duration_minutes, cancelled_by, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [appt.user_id, appt.trainer_id, appt.scheduled_at, appt.service_name, appt.duration_minutes, cancelledBy, reason]
  );
  
  // Delete the appointment
  await query('DELETE FROM termini WHERE id = $1', [id]);
}

const DEFAULT_WORK_HOURS = { open_hour: 8, close_hour: 20 };

async function getWorkHours() {
  const { rows } = await query('SELECT open_hour, close_hour FROM work_hours ORDER BY id ASC LIMIT 1', []);
  if (!rows.length) return DEFAULT_WORK_HOURS;
  return rows[0];
}

async function setWorkHours(openHour, closeHour) {
  const open = Number(openHour);
  const close = Number(closeHour);
  if (Number.isNaN(open) || Number.isNaN(close)) throw new Error('Invalid work hours');
  if (open < 0 || open > 23 || close < 0 || close > 23) throw new Error('Hours must be between 0 and 23');
  if (open >= close) throw new Error('Open hour must be before close hour');

  const { rows } = await query(
    `INSERT INTO work_hours (id, open_hour, close_hour)
     VALUES (1, $1, $2)
     ON CONFLICT (id) DO UPDATE
       SET open_hour = EXCLUDED.open_hour,
           close_hour = EXCLUDED.close_hour,
           updated_at = now()
     RETURNING open_hour, close_hour`,
    [open, close]
  );
  return rows[0];
}

async function getTrainerWorkHours(trainerId) {
  const { rows } = await query('SELECT open_hour, close_hour FROM trainer_work_hours WHERE trainer_id = $1', [trainerId]);
  if (!rows.length) return null;
  return rows[0];
}

async function setTrainerWorkHours(trainerId, openHour, closeHour) {
  const open = Number(openHour);
  const close = Number(closeHour);
  if (Number.isNaN(open) || Number.isNaN(close)) throw new Error('Invalid work hours');
  if (open < 0 || open > 23 || close < 0 || close > 23) throw new Error('Hours must be between 0 and 23');
  if (open >= close) throw new Error('Open hour must be before close hour');

  const { rows } = await query(
    `INSERT INTO trainer_work_hours (trainer_id, open_hour, close_hour)
     VALUES ($1, $2, $3)
     ON CONFLICT (trainer_id) DO UPDATE
       SET open_hour = EXCLUDED.open_hour,
           close_hour = EXCLUDED.close_hour,
           updated_at = now()
     RETURNING open_hour, close_hour`,
    [trainerId, open, close]
  );
  return rows[0];
}

async function getTrainerWorkHoursForDate(trainerId, dateStr) {
  if (!dateStr) return null;
  const { rows } = await query(
    `SELECT open_hour, close_hour, start_date, end_date
     FROM trainer_work_hour_overrides
     WHERE trainer_id = $1 AND start_date <= $2 AND end_date >= $2
     ORDER BY updated_at DESC
     LIMIT 1`,
    [trainerId, dateStr]
  );
  if (!rows.length) return null;
  return rows[0];
}

async function setTrainerWorkHoursRange(trainerId, startDate, endDate, openHour, closeHour) {
  const open = Number(openHour);
  const close = Number(closeHour);
  if (Number.isNaN(open) || Number.isNaN(close)) throw new Error('Invalid work hours');
  if (open < 0 || open > 23 || close < 0 || close > 23) throw new Error('Hours must be between 0 and 23');
  if (open >= close) throw new Error('Open hour must be before close hour');
  if (!startDate || !endDate) throw new Error('Missing date range');
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new Error('Invalid date range');
  if (start > end) throw new Error('Start date must be before end date');

  const { rows } = await query(
    `INSERT INTO trainer_work_hour_overrides (trainer_id, start_date, end_date, open_hour, close_hour)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, trainer_id, start_date, end_date, open_hour, close_hour`,
    [trainerId, startDate, endDate, open, close]
  );
  return rows[0];
}

async function listTrainerWorkHourOverrides(trainerId) {
  const { rows } = await query(
    `SELECT id, start_date::TEXT, end_date::TEXT, open_hour, close_hour
     FROM trainer_work_hour_overrides
     WHERE trainer_id = $1
     ORDER BY start_date DESC, end_date DESC`,
    [trainerId]
  );
  return rows;
}

async function getStatistics() {
  // Total appointments (past and future)
  const { rows: totalRows } = await query('SELECT COUNT(*) as count FROM termini', []);
  const totalAppointments = Number(totalRows[0].count);

  // Total cancellations
  const { rows: cancelRows } = await query('SELECT COUNT(*) as count FROM cancellations', []);
  const totalCancellations = Number(cancelRows[0].count);

  // Appointments by service
  const { rows: serviceRows } = await query(
    `SELECT service_name, COUNT(*) as count FROM termini
     WHERE service_name IS NOT NULL
     GROUP BY service_name
     ORDER BY count DESC`,
    []
  );

  // Appointments by trainer
  const { rows: trainerRows } = await query(
    `SELECT t.id, t.name, t.surname, COUNT(a.id) as count
     FROM treneri t
     LEFT JOIN termini a ON a.trainer_id = t.id
     GROUP BY t.id, t.name, t.surname
     ORDER BY count DESC`,
    []
  );

  // Peak hours (count appointments by hour of day)
  const { rows: hourRows } = await query(
    `SELECT EXTRACT(HOUR FROM scheduled_at) as hour, COUNT(*) as count
     FROM termini
     GROUP BY hour
     ORDER BY hour`,
    []
  );

  // Recent cancellations (last 30 days)
  const { rows: recentCancelRows } = await query(
    `SELECT COUNT(*) as count FROM cancellations
     WHERE cancelled_at >= NOW() - INTERVAL '30 days'`,
    []
  );
  const recentCancellations = Number(recentCancelRows[0].count);

  // Cancellations by reason (if tracked)
  const { rows: cancelReasonRows } = await query(
    `SELECT cancelled_by, COUNT(*) as count FROM cancellations
     GROUP BY cancelled_by
     ORDER BY count DESC`,
    []
  );

  return {
    totalAppointments,
    totalCancellations,
    recentCancellations,
    serviceBreakdown: serviceRows.map(r => ({ name: r.service_name, count: Number(r.count) })),
    trainerBreakdown: trainerRows.map(r => ({ 
      id: r.id, 
      name: `${r.name} ${r.surname}`, 
      count: Number(r.count) 
    })),
    peakHours: hourRows.map(r => ({ hour: Number(r.hour), count: Number(r.count) })),
    cancellationsByType: cancelReasonRows.map(r => ({ type: r.cancelled_by, count: Number(r.count) }))
  };
}

module.exports = {
  pool,
  query,
  init,
  getUserById,
  seedAdmin,
  seedTestData,
  createUser,
  getUserByEmail,
  createTrainer,
  getTrainers,
  getTrainersByType,
  bookAppointment,
  bookAppointmentWithDetails,
  getAppointmentsForUser,
  getAllAppointments,
  deleteAppointment,
  getWorkHours,
  setWorkHours,
  getTrainerWorkHours,
  setTrainerWorkHours,
  getTrainerWorkHoursForDate,
  setTrainerWorkHoursRange,
  listTrainerWorkHourOverrides,
  cancelAppointment,
  getStatistics,
  getUsers,
};