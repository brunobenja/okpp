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

// ---------------- INIT DB ON START ----------------
(async () => {
  try {
    await db.init();
    console.log("Database initialized");
  } catch (err) {
    console.error("DB init failed:", err);
  }
})();

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
    res.cookie("auth", token, { httpOnly: true });
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
    res.cookie("auth", token, { httpOnly: true });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

app.get("/api/me", authRequired, async (req, res) => {
  const user = await db.getUserById(req.user.id);
  res.json({
    id: user.id,
    name: user.name,
    surname: user.surname,
    email: user.email,
    is_admin: user.is_admin,
  });
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

// ---------------- SEED (DEV ONLY) ----------------
app.get("/seed", async (req, res) => {
  try {
    await db.clearAll?.();

    const adminPass = await bcrypt.hash("admin", 10);
    await db.createUser("Admin", "", "admin@mail.com", adminPass, true);

    const users = [
      ["Ivan", "Horvat", "ivan.horvat@mail.com", "lozinka123"],
      ["Ana", "Kovač", "ana.kovac@mail.com", "lozinka456"],
      ["Marko", "Novak", "marko.novak@mail.com", "lozinka789"],
    ];

    for (const [n, s, e, p] of users) {
      await db.createUser(n, s, e, await bcrypt.hash(p, 10), false);
    }

    const trainers = [
      ["Petar", "Babić", "M", 28, 5],
      ["Marija", "Jurić", "F", 32, 8],
      ["Luka", "Knežević", "M", 35, 10],
      ["Ivana", "Marić", "F", 27, 4],
      ["Krešimir", "Perić", "M", 30, 7],
      ["Jelena", "Radić", "F", 29, 6],
      ["Tomislav", "Božić", "M", 33, 9],
      ["Sara", "Pavić", "F", 26, 3],
      ["Nikola", "Petrović", "M", 31, 8],
      ["Maja", "Vuković", "F", 28, 5],
    ];

    for (const t of trainers) {
      await db.createTrainer(...t, "https://i.pravatar.cc/150");
    }

    res.send("Seeding complete");
  } catch (err) {
    console.error(err);
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
