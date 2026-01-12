require("dotenv").config();
const express = require("express");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const path = require("path");
const jwt = require("jsonwebtoken");
const db = require("./index");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

// ---------------- MIDDLEWARE ----------------
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

const isProd = process.env.NODE_ENV === "production";

const cookieOptions = {
  httpOnly: true,
  secure: isProd, // REQUIRED for HTTPS
  sameSite: isProd ? "none" : "lax",
  path: "/",
};


// ---------------- INIT DB ON START ----------------
(async () => {
  try {
    await db.init();
    console.log("Database initialized");
  } catch (err) {
    console.error("DB init failed:", err);
  }
})();
//function is appointment locked
function isAppointmentLocked(scheduledAt) {
  const now = new Date();
  const appt = new Date(scheduledAt);

  if (appt <= now) return true;

  const diffMs = appt - now;
  const hours24 = 24 * 60 * 60 * 1000;

  return diffMs < hours24;
}

// ---------------- AUTH HELPERS ----------------
function authRequired(req, res, next) {
  try {
    const token = req.cookies.auth;
    if (!token) return res.status(401).json({ error: "Not logged in" });

    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid session" });
  }
}

// ---------------- AUTH ROUTES ----------------
app.post("/api/register", async (req, res) => {
  try {
    const { name, surname, email, password } = req.body;
    if (!name || !surname || !email || !password)
      return res.status(400).json({ error: "Missing fields" });

    const existing = await db.getUserByEmail(email);
    if (existing)
      return res.status(400).json({ error: "Email already exists" });

    const hash = await bcrypt.hash(password, 10);
    const user = await db.createUser(name, surname, email, hash, false);

    const token = jwt.sign({ id: user.id, is_admin: false }, JWT_SECRET);
    res.cookie("auth", token, cookieOptions);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Registration failed" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await db.getUserByEmail(email);
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { id: user.id, is_admin: user.is_admin },
      JWT_SECRET
    );
    res.cookie("auth", token, cookieOptions);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

app.post("/api/logout", (req, res) => {
  res.clearCookie("auth", cookieOptions);
  res.json({ success: true });
});


app.get("/api/me", authRequired, async (req, res) => {
  try {
    const user = await db.getUserById(req.user.id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      id: user.id,
      name: user.name,
      surname: user.surname,
      email: user.email,
      is_admin: user.is_admin,
    });
  } catch (err) {
    console.error("GET /api/me failed:", err);
    res.status(500).json({ error: "Failed to load user" });
  }
});


// ---------------- DATA ROUTES ----------------
app.get("/api/trainers", async (req, res) => {
  try {
    const trainers = await db.getTrainers();
    res.json(Array.isArray(trainers) ? trainers : trainers.rows || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load trainers" });
  }
});

// ---------------- APPOINTMENTS (USER) ----------------
app.get("/api/appointments", authRequired, async (req, res) => {
  try {
    const appts = await db.getAppointmentsForUser(req.user.id);
    res.json(appts);
  } catch (err) {
    console.error("GET /api/appointments failed:", err);
    res.status(500).json({ error: "Failed to load appointments" });
  }
});

// Return all appointments (used for availability checks)
app.get("/api/appointments/all", authRequired, async (req, res) => {
  try {
    const appts = await db.getAllAppointments();
    res.json(appts);
  } catch (err) {
    console.error("GET /api/appointments/all failed:", err);
    res.status(500).json({ error: "Failed to load appointments" });
  }
});

app.post("/api/appointments", authRequired, async (req, res) => {
  try {
    const { trainerId, scheduledAt } = req.body;
    if (!trainerId || !scheduledAt)
      return res.status(400).json({ error: "Missing fields" });

    const created = await db.bookAppointment(req.user.id, trainerId, scheduledAt);

    // Return joined appointment with trainer info for client convenience
    const { rows } = await db.query(
      `SELECT a.id, a.scheduled_at, a.trainer_id, t.name AS trainer_name, t.surname AS trainer_surname
       FROM termini a JOIN treneri t ON t.id = a.trainer_id WHERE a.id = $1`,
      [created.id]
    );

    res.json(rows[0] || created);
  } catch (err) {
    console.error("POST /api/appointments failed:", err);
    res.status(500).json({ error: err.message || "Failed to create appointment" });
  }
});

app.put("/api/appointments/:id", authRequired, async (req, res) => {
  try {
    const id = req.params.id;
    const { trainerId, scheduledAt } = req.body;
    if (!trainerId || !scheduledAt)
      return res.status(400).json({ error: "Missing fields" });

    // Ensure user owns the appointment (or is admin)
    const { rows } = await db.query("SELECT user_id FROM termini WHERE id = $1", [id]);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    const ownerId = rows[0].user_id;
    if (req.user.id !== ownerId && !req.user.is_admin)
      return res.status(403).json({ error: "Forbidden" });

     if (isAppointmentLocked(rows[0].scheduled_at)) {
       return res.status(403).json({
         error: "Termin je zaključan (manje od 24h ili u prošlosti)",
       });
     }

    const updated = await db.updateAppointment(id, trainerId, scheduledAt);

    // Return joined appointment with trainer info for client convenience
    const { rows: joined } = await db.query(
      `SELECT a.id, a.scheduled_at, a.trainer_id, t.name AS trainer_name, t.surname AS trainer_surname
       FROM termini a JOIN treneri t ON t.id = a.trainer_id WHERE a.id = $1`,
      [id]
    );

    res.json(joined[0] || updated);
  } catch (err) {
    console.error("PUT /api/appointments/:id failed:", err);
    res.status(500).json({ error: err.message || "Failed to update appointment" });
  }
});

app.delete("/api/appointments/:id", authRequired, async (req, res) => {
  try {
    const id = req.params.id;

    // Ensure user owns the appointment
    const { rows } = await db.query(
      "SELECT scheduled_at FROM termini WHERE id = $1 AND user_id = $2",
      [id, req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Termin ne postoji" });
    }

    // ❌ Check lock
    if (isAppointmentLocked(rows[0].scheduled_at)) {
      return res.status(403).json({
        error: "Termin je zaključan (manje od 24h ili u prošlosti)",
      });
    }

    await db.deleteAppointment(id);
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/appointments/:id failed:", err);
    res.status(500).json({ error: "Failed to delete" });
  }
});

// ---------------- ADMIN APPOINTMENTS ----------------
app.get("/api/admin/appointments", authRequired, async (req, res) => {
  try {
    if (!req.user.is_admin) return res.status(403).json({ error: "Forbidden" });
    const appts = await db.getAllAppointments();
    res.json(appts);
  } catch (err) {
    console.error("GET /api/admin/appointments failed:", err);
    res.status(500).json({ error: "Failed to load admin appointments" });
  }
});

app.delete("/api/admin/appointments/:id", authRequired, async (req, res) => {
  try {
    if (!req.user.is_admin) return res.status(403).json({ error: "Forbidden" });
    const id = req.params.id;
    await db.deleteAppointment(id);
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/admin/appointments/:id failed:", err);
    res.status(500).json({ error: "Failed to delete appointment" });
  }
});

// ---------------- SEED (DEV ONLY) ----------------
app.get("/seed", async (req, res) => {
  try {
    console.log("Seeding started...");

    // ---------- ADMIN ----------
    const adminEmail = "admin@mail.com";
    const existingAdmin = await db.getUserByEmail(adminEmail);

    if (!existingAdmin) {
      const adminPassHash = await bcrypt.hash("admin", 10);
      await db.createUser("Admin", "", adminEmail, adminPassHash, true);
      console.log("Admin created");
    } else {
      console.log("Admin already exists");
    }

    // ---------- USERS ----------
    const users = [
      ["user", "user", "user@mail.com", "user"],
      /*
      ["Ivan", "Horvat", "ivan.horvat@mail.com", "lozinka123"],
      ["Ana", "Kovač", "ana.kovac@mail.com", "lozinka456"],
      ["Marko", "Novak", "marko.novak@mail.com", "lozinka789"],
      */
    ];

    for (const [n, s, e, p] of users) {
      const existing = await db.getUserByEmail(e);
      if (existing) {
        console.log(`User already exists: ${e}`);
        continue;
      }

      await db.createUser(n, s, e, await bcrypt.hash(p, 10), false);
      console.log(`User created: ${e}`);
    }

    // ---------- TRAINERS ----------
    /*const trainers = [
      ["Petar", "Babić", "M", 28, 5] ,
      ["Marko", "Novak", "M", 30, 6] ,
      ["Luka", "Knežević", "M", 35, 10] ,
      ["Ana", "Kovač", "F", 25, 3] ,
      ["Marija", "Jurić", "F", 32, 8] ,
    ];*/

    const existingTrainers = await db.getTrainers();
    if (existingTrainers.length === 0) {
      for (const t of trainers) {
        await db.createTrainer(...t, "https://i.pravatar.cc/150");
      }
      console.log("Trainers created");
    } else {
      console.log("Trainers already exist");
    }

    res.send("Seeding complete!");
  } catch (err) {
    console.error("Seed failed:", err);
    res.status(500).send("Seed failed");
  }
});


// ---------------- FRONTEND FALLBACK ----------------
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
// ---------------- START ----------------
app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);
