require('dotenv').config();
const db = require('./index');

// Service definitions matching server.js
const SERVICES = [
  { id: 'func', name: 'Funkcionalni trening', duration: 60 },
  { id: 'snaga', name: 'Trening snage', duration: 60 },
  { id: 'crossfit', name: 'Crossfit', duration: 45 },
  { id: 'masaza', name: 'Masaža', duration: 90 },
];

async function updateExistingAppointments() {
  try {
    console.log('Starting service update for existing appointments...\n');
    
    // Get all appointments without service_name
    const { rows: appointments } = await db.query(
      'SELECT id FROM termini WHERE service_name IS NULL',
      []
    );
    
    console.log(`Found ${appointments.length} appointments without service information.\n`);
    
    if (appointments.length === 0) {
      console.log('No appointments to update. All appointments already have services assigned.');
      process.exit(0);
    }
    
    console.log('Assigning random services to appointments...');
    let updated = 0;
    
    for (const appt of appointments) {
      // Randomly select a service
      const randomService = SERVICES[Math.floor(Math.random() * SERVICES.length)];
      
      await db.query(
        'UPDATE termini SET service_name = $1, duration_minutes = $2 WHERE id = $3',
        [randomService.name, randomService.duration, appt.id]
      );
      
      updated++;
      
      if (updated % 20 === 0) {
        console.log(`  Updated ${updated} appointments...`);
      }
    }
    
    console.log(`\nSuccessfully updated ${updated} appointments!`);
    console.log('All appointments now have services assigned.');
    
    process.exit(0);
  } catch (error) {
    console.error('Error updating appointments:', error);
    process.exit(1);
  }
}

updateExistingAppointments();
