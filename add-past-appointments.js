require('dotenv').config();
const db = require('./index');

// Service definitions
const SERVICES = [
  { id: 'func', name: 'Funkcionalni trening', duration: 60 },
  { id: 'snaga', name: 'Trening snage', duration: 60 },
  { id: 'crossfit', name: 'Crossfit', duration: 45 },
  { id: 'masaza', name: 'Masaža', duration: 90 },
];

async function addPastAppointments() {
  try {
    console.log('Adding past appointments for testing history view...\n');
    
    // Get users
    const { rows: users } = await db.query('SELECT * FROM korisnici WHERE is_admin = false', []);
    
    // Get trainers
    const { rows: trainers } = await db.query('SELECT * FROM treneri', []);
    
    if (users.length === 0 || trainers.length === 0) {
      console.log('No users or trainers found. Please run seed-data.js first.');
      process.exit(1);
    }
    
    console.log(`Found ${users.length} users and ${trainers.length} trainers`);
    
    // Create 30 past appointments (last 30 days)
    let created = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (let daysAgo = 1; daysAgo <= 30; daysAgo++) {
      const date = new Date(today);
      date.setDate(date.getDate() - daysAgo);
      
      // Random hour between 8 and 18
      const hour = 8 + Math.floor(Math.random() * 11);
      date.setHours(hour, 0, 0, 0);
      
      // Random user and trainer
      const user = users[Math.floor(Math.random() * users.length)];
      const trainer = trainers[Math.floor(Math.random() * trainers.length)];
      
      // Random service
      const service = SERVICES[Math.floor(Math.random() * SERVICES.length)];
      
      try {
        await db.bookAppointmentWithDetails(
          user.id,
          trainer.id,
          date.toISOString(),
          service.duration,
          service.name
        );
        created++;
        
        if (created % 10 === 0) {
          console.log(`Created ${created} past appointments...`);
        }
      } catch (e) {
        // Skip conflicts
        continue;
      }
    }
    
    console.log(`\nSuccessfully created ${created} past appointments!`);
    console.log('You can now view them in the History tab.');
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

addPastAppointments();
