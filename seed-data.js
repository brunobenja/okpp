require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./index');

const userPasswords = [
  { email: 'ivan.horvat@mail.com', password: 'lozinka123', name: 'Ivan', surname: 'Horvat' },
  { email: 'ana.kovac@mail.com', password: 'lozinka456', name: 'Ana', surname: 'Kovač' },
  { email: 'marko.novak@mail.com', password: 'lozinka789', name: 'Marko', surname: 'Novak' }
];

const trainerData = [
  { name: 'Petar', surname: 'Babić', sex: 'M', age: 28, yearsExp: 5, pic: 'https://i.pravatar.cc/150?img=12', services: ['func', 'snaga'] },
  { name: 'Marija', surname: 'Jurić', sex: 'F', age: 32, yearsExp: 8, pic: 'https://i.pravatar.cc/150?img=47', services: ['masaza', 'func'] },
  { name: 'Luka', surname: 'Knežević', sex: 'M', age: 35, yearsExp: 10, pic: 'https://i.pravatar.cc/150?img=13', services: ['crossfit', 'func', 'snaga'] },
  { name: 'Ivana', surname: 'Marić', sex: 'F', age: 27, yearsExp: 4, pic: 'https://i.pravatar.cc/150?img=48', services: ['masaza'] },
  { name: 'Krešimir', surname: 'Perić', sex: 'M', age: 30, yearsExp: 7, pic: 'https://i.pravatar.cc/150?img=14', services: ['crossfit', 'snaga'] },
  { name: 'Jelena', surname: 'Radić', sex: 'F', age: 29, yearsExp: 6, pic: 'https://i.pravatar.cc/150?img=49', services: ['func', 'masaza'] },
  { name: 'Tomislav', surname: 'Božić', sex: 'M', age: 33, yearsExp: 9, pic: 'https://i.pravatar.cc/150?img=15', services: ['snaga', 'crossfit'] },
  { name: 'Sara', surname: 'Pavić', sex: 'F', age: 26, yearsExp: 3, pic: 'https://i.pravatar.cc/150?img=44', services: ['func'] },
  { name: 'Nikola', surname: 'Petrović', sex: 'M', age: 31, yearsExp: 8, pic: 'https://i.pravatar.cc/150?img=33', services: ['func', 'snaga', 'crossfit'] },
  { name: 'Maja', surname: 'Vuković', sex: 'F', age: 28, yearsExp: 5, pic: 'https://i.pravatar.cc/150?img=45', services: ['masaza', 'func'] }
];

async function seedDatabase() {
  try {
    await db.init();
    console.log('Database initialized\n');

    // Clear existing appointments and trainers
    await db.query('DELETE FROM termini', []);
    await db.query('DELETE FROM treneri', []);
    console.log('Cleared existing appointments and trainers\n');

    // Create users
    console.log('Creating users...');
    console.log('='.repeat(60));
    const users = [];
    for (const userData of userPasswords) {
      const hash = await bcrypt.hash(userData.password, 10);
      try {
        const user = await db.createUser(userData.name, userData.surname, userData.email, hash, false);
        users.push(user);
        console.log(`Email: ${userData.email} | Password: ${userData.password}`);
      } catch (e) {
        if (e.code === '23505') {
          // User already exists, fetch it
          const existing = await db.getUserByEmail(userData.email);
          users.push(existing);
          console.log(`Email: ${userData.email} | Password: ${userData.password} (already exists)`);
        } else {
          throw e;
        }
      }
    }
    console.log('='.repeat(60));
    console.log(`Created ${users.length} users\n`);

    // Create trainers
    console.log('Creating trainers...');
    const trainers = [];
    for (const trainer of trainerData) {
      const created = await db.createTrainer(
        trainer.name,
        trainer.surname,
        trainer.sex,
        trainer.age,
        trainer.pic,
        trainer.yearsExp,
        null
      );
      // Update services
      if (trainer.services) {
        await db.query('UPDATE treneri SET services = $1 WHERE id = $2', [JSON.stringify(trainer.services), created.id]);
      }
      trainers.push(created);
    }
    console.log(`Created ${trainers.length} trainers\n`);

    // Service definitions matching server.js
    const SERVICES = [
      { id: 'func', name: 'Funkcionalni trening', duration: 60 },
      { id: 'snaga', name: 'Trening snage', duration: 60 },
      { id: 'crossfit', name: 'Crossfit', duration: 45 },
      { id: 'masaza', name: 'Masaža', duration: 90 },
    ];
    
    // Create 100 appointments
    console.log('Creating 100 appointments...');
    const startDate = new Date();
    startDate.setHours(8, 0, 0, 0);
    
    let appointmentsCreated = 0;
    const appointmentsNeeded = 100;
    
    // Generate appointments spread over the next 30 days
    for (let day = 0; day < 30 && appointmentsCreated < appointmentsNeeded; day++) {
      for (let hour = 8; hour <= 20 && appointmentsCreated < appointmentsNeeded; hour++) {
        const apptDate = new Date(startDate);
        apptDate.setDate(apptDate.getDate() + day);
        apptDate.setHours(hour, 0, 0, 0);
        
        // Randomly assign user and trainer
        const randomUser = users[Math.floor(Math.random() * users.length)];
        const randomTrainer = trainers[Math.floor(Math.random() * trainers.length)];
        
        // Randomly select a service
        const randomService = SERVICES[Math.floor(Math.random() * SERVICES.length)];
        
        try {
          await db.bookAppointmentWithDetails(
            randomUser.id, 
            randomTrainer.id, 
            apptDate.toISOString(),
            randomService.duration,
            randomService.name
          );
          appointmentsCreated++;
          
          if (appointmentsCreated % 20 === 0) {
            console.log(`  Created ${appointmentsCreated} appointments...`);
          }
        } catch (e) {
          // Skip conflicts (duplicate appointments)
          continue;
        }
      }
    }
    
    console.log(`Created ${appointmentsCreated} appointments\n`);
    
    console.log('='.repeat(60));
    console.log('DATABASE SEEDING COMPLETE!');
    console.log('='.repeat(60));
    console.log('\nUSER CREDENTIALS:');
    console.log('-'.repeat(60));
    userPasswords.forEach(u => {
      console.log(`${u.name} ${u.surname}: ${u.email} / ${u.password}`);
    });
    console.log('-'.repeat(60));
    
    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
}

seedDatabase();
