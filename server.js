require("dotenv").config();
const express = require("express");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const path = require("path");
const db = require("./index");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());
// Serve static files from public folder
app.use(express.static(path.join(__dirname, "public")));
// ---------------- TEMP DATABASE SEED ----------------
// REMOVE OR PROTECT THIS AFTER FIRST USE!
app.get("/seed", async (req, res) => {
  try {
    await db.init(); // make sure DB connection is ready
    console.log("Database initialized");

    // ---------------- USERS ----------------
    const userPasswords = [
      {
        email: "ivan.horvat@mail.com",
        password: "lozinka123",
        name: "Ivan",
        surname: "Horvat",
      },
      {
        email: "ana.kovac@mail.com",
        password: "lozinka456",
        name: "Ana",
        surname: "Kovač",
      },
      {
        email: "marko.novak@mail.com",
        password: "lozinka789",
        name: "Marko",
        surname: "Novak",
      },
    ];

    console.log("\nCreating users...");
    const users = [];
    for (const u of userPasswords) {
      const existing = await db.getUserByEmail(u.email);
      if (!existing) {
        const hash = await bcrypt.hash(u.password, 10);
        const created = await db.createUser(
          u.name,
          u.surname,
          u.email,
          hash,
          false
        );
        users.push(created);
        console.log(`User created: ${u.email} / ${u.password}`);
      } else {
        users.push(existing);
        console.log(`User already exists: ${u.email}`);
      }
    }

    // ---------------- TRAINERS ----------------
    const trainerData = [
      {
        name: "Petar",
        surname: "Babić",
        sex: "M",
        age: 28,
        yearsExp: 5,
        pic: "https://i.pravatar.cc/150?img=12",
      },
      {
        name: "Marija",
        surname: "Jurić",
        sex: "F",
        age: 32,
        yearsExp: 8,
        pic: "https://i.pravatar.cc/150?img=47",
      },
      {
        name: "Luka",
        surname: "Knežević",
        sex: "M",
        age: 35,
        yearsExp: 10,
        pic: "https://i.pravatar.cc/150?img=13",
      },
      {
        name: "Ivana",
        surname: "Marić",
        sex: "F",
        age: 27,
        yearsExp: 4,
        pic: "https://i.pravatar.cc/150?img=48",
      },
      {
        name: "Krešimir",
        surname: "Perić",
        sex: "M",
        age: 30,
        yearsExp: 7,
        pic: "https://i.pravatar.cc/150?img=14",
      },
      {
        name: "Jelena",
        surname: "Radić",
        sex: "F",
        age: 29,
        yearsExp: 6,
        pic: "https://i.pravatar.cc/150?img=49",
      },
      {
        name: "Tomislav",
        surname: "Božić",
        sex: "M",
        age: 33,
        yearsExp: 9,
        pic: "https://i.pravatar.cc/150?img=15",
      },
      {
        name: "Sara",
        surname: "Pavić",
        sex: "F",
        age: 26,
        yearsExp: 3,
        pic: "https://i.pravatar.cc/150?img=44",
      },
      {
        name: "Nikola",
        surname: "Petrović",
        sex: "M",
        age: 31,
        yearsExp: 8,
        pic: "https://i.pravatar.cc/150?img=33",
      },
      {
        name: "Maja",
        surname: "Vuković",
        sex: "F",
        age: 28,
        yearsExp: 5,
        pic: "https://i.pravatar.cc/150?img=45",
      },
    ];

    console.log("\nCreating trainers...");
    const trainers = [];
    for (const t of trainerData) {
      const existing = (await db.getTrainers()).find(
        (tr) => tr.name === t.name && tr.surname === t.surname
      );
      if (!existing) {
        const created = await db.createTrainer(
          t.name,
          t.surname,
          t.sex,
          t.age,
          t.pic,
          t.yearsExp
        );
        trainers.push(created);
        console.log(`Trainer created: ${t.name} ${t.surname}`);
      } else {
        trainers.push(existing);
        console.log(`Trainer already exists: ${t.name} ${t.surname}`);
      }
    }

    // ---------------- APPOINTMENTS ----------------
    console.log("\nCreating 100 appointments...");
    const startDate = new Date();
    startDate.setHours(8, 0, 0, 0);
    let appointmentsCreated = 0;

    for (let day = 0; day < 30 && appointmentsCreated < 100; day++) {
      for (let hour = 8; hour <= 20 && appointmentsCreated < 100; hour++) {
        const apptDate = new Date(startDate);
        apptDate.setDate(apptDate.getDate() + day);
        apptDate.setHours(hour, 0, 0, 0);

        const randomUser = users[Math.floor(Math.random() * users.length)];
        const randomTrainer =
          trainers[Math.floor(Math.random() * trainers.length)];

        try {
          await db.bookAppointment(
            randomUser.id,
            randomTrainer.id,
            apptDate.toISOString()
          );
          appointmentsCreated++;
        } catch (e) {
          // skip conflicts
          continue;
        }
      }
    }
    console.log(`Created ${appointmentsCreated} appointments`);

    res.send("Seeding complete! Check server logs for details.");
  } catch (err) {
    console.error("Seeding error:", err);
    res.status(500).send("Error seeding database");
  }
});

// ---------------- ROOT ROUTE ----------------
app.get("/", (req, res) => {
  // Send the HTML file instead of text
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
// Catch-all route for client-side routing (must come after all other routes)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---------------- START SERVER ----------------
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
