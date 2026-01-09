// ---------------- TEMP DATABASE SEED ----------------
// REMOVE THIS AFTER FIRST USE!
app.get("/seed", async (req, res) => {
  try {
    // Admin
    const adminPassHash = await bcrypt.hash("admin", 10);
    await db.createUser("Admin", "", "admin@mail.com", adminPassHash, true);

    // Regular users
    const users = [
      {
        name: "Ivan",
        surname: "Horvat",
        email: "ivan.horvat@mail.com",
        password: "lozinka123",
      },
      {
        name: "Ana",
        surname: "Kovač",
        email: "ana.kovac@mail.com",
        password: "lozinka456",
      },
      {
        name: "Marko",
        surname: "Novak",
        email: "marko.novak@mail.com",
        password: "lozinka789",
      },
    ];
    for (const u of users) {
      const hash = await bcrypt.hash(u.password, 10);
      await db.createUser(u.name, u.surname, u.email, hash, false);
    }

    // Trainers
    const trainers = [
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

    for (const t of trainers) {
      await db.createTrainer(
        t.name,
        t.surname,
        t.sex,
        t.age,
        t.pic,
        t.yearsExp
      );
    }

    res.send("Database seeded successfully! Admin, users, and trainers added.");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error seeding database");
  }
});
