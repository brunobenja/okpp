require("dotenv").config();
const { Pool } = require("pg");
const bcrypt = require("bcryptjs"); // add this

const useConnStr = !!process.env.DATABASE_URL;
const pool = new Pool(
  useConnStr
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl:
          process.env.PGSSL === "require"
            ? { rejectUnauthorized: false }
            : false,
      }
    : {
        host: process.env.PGHOST || "localhost",
        port: Number(process.env.PGPORT || 5432),
        user: process.env.PGUSER || "postgres",
        password: process.env.PGPASSWORD || "",
        database: process.env.PGDATABASE || "postgres",
        ssl:
          process.env.PGSSL === "require"
            ? { rejectUnauthorized: false }
            : false,
      }
);

// Simple helper to run parameterized queries safely
async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  console.log(
    `query: ${text} | params: ${JSON.stringify(params)} | ${duration}ms`
  );
  return res;
}

// Create required tables
async function init() {
  // Drop existing English-named tables if they exist
  //await query(`DROP TABLE IF EXISTS appointments CASCADE`);
  //await query(`DROP TABLE IF EXISTS trainers CASCADE`);
  //await query(`DROP TABLE IF EXISTS users CASCADE`);

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
      type TEXT NOT NULL DEFAULT 'personal',
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  // Add columns if they don't exist (for existing databases)
  await query(`ALTER TABLE treneri ADD COLUMN IF NOT EXISTS profile_pic TEXT`);
  await query(`ALTER TABLE treneri ADD COLUMN IF NOT EXISTS type TEXT`);
  await query(
    `ALTER TABLE treneri ADD COLUMN IF NOT EXISTS years_experience INT`
  );
  await query(
    `ALTER TABLE treneri ADD COLUMN IF NOT EXISTS user_id INT UNIQUE REFERENCES korisnici(id) ON DELETE SET NULL`
  );

  await query(`
    CREATE TABLE IF NOT EXISTS termini (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES korisnici(id) ON DELETE CASCADE,
      trainer_id INT NOT NULL REFERENCES treneri(id) ON DELETE CASCADE,
      scheduled_at TIMESTAMPTZ NOT NULL,
      duration_minutes INT NOT NULL DEFAULT 60,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE (trainer_id, scheduled_at),
      UNIQUE (user_id, scheduled_at),
      CHECK (EXTRACT(MINUTE FROM scheduled_at) = 0)
    )
  `);
}

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || "Admin";
  const surname = process.env.ADMIN_SURNAME || "";
  if (!email || !password) {
    console.log("No ADMIN_EMAIL/ADMIN_PASSWORD provided; skipping admin seed");
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

// Minimal helpers
async function createUser(name, surname, email, password, isAdmin = false) {
  const { rows } = await query(
    "INSERT INTO korisnici (name, surname, email, password, is_admin) VALUES ($1, $2, $3, $4, $5) RETURNING *",
    [name, surname, email, password, isAdmin]
  );
  return rows[0];
}
async function getUserByEmail(email) {
  const { rows } = await query("SELECT * FROM korisnici WHERE email = $1", [
    email,
  ]);
  if (!rows.length) return null;
  const user = rows[0];
  return {
    ...user,
    is_admin: Boolean(user.is_admin), // ensures true/false
    password: user.password, // ensure password is returned
  };
}
async function getUserById(id) {
  const { rows } = await query("SELECT * FROM korisnici WHERE id = $1", [id]);

  if (!rows.length) return null;

  const user = rows[0];

  return {
    ...user,
    is_admin: Boolean(user.is_admin),
  };
}

async function createTrainer(
  name,
  surname,
  sex,
  age,
  profilePic = null,
  yearsExperience = null,
  userId = null,
  type = "personal"
) {
  const { rows } = await query(
    "INSERT INTO treneri (name, surname, sex, age, profile_pic, years_experience, user_id,type) VALUES ($1, $2, $3, $4, $5, $6, $7,$8) RETURNING *",
    [name, surname, sex, age, profilePic, yearsExperience, userId, type]
  );
  return rows[0];
}
async function getTrainers() {
  const { rows } = await query(
    "SELECT id, name, surname, sex, age, years_experience, profile_pic, type FROM treneri"
  );
  return rows;
}

async function bookAppointment(userId, trainerId, scheduledAt) {
  const { rows } = await query(
    "INSERT INTO termini (user_id, trainer_id, scheduled_at) VALUES ($1, $2, $3) RETURNING *",
    [userId, trainerId, scheduledAt]
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
  await query("DELETE FROM termini WHERE id = $1", [id]);
}

async function updateAppointment(id, trainerId, scheduledAt) {
  const { rows } = await query(
    "UPDATE termini SET trainer_id = $1, scheduled_at = $2 WHERE id = $3 RETURNING *",
    [trainerId, scheduledAt, id]
  );
  return rows[0];
}

module.exports = {
  pool,
  query,
  init,
  seedAdmin,
  createUser,
  getUserByEmail,
  getUserById,
  createTrainer,
  getTrainers,
  bookAppointment,
  getAppointmentsForUser,
  getAllAppointments,
  deleteAppointment,
  updateAppointment,
};
