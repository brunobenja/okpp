require('dotenv').config();
const db = require('./index');

// Same service catalog as server.js
const SERVICES = [
  { id: 'func', name: 'Funkcionalni trening', duration: 60 },
  { id: 'snaga', name: 'Trening snage', duration: 60 },
  { id: 'crossfit', name: 'Crossfit', duration: 45 },
  { id: 'masaza', name: 'Masaža', duration: 90 },
];
const SERVICE_MAP = SERVICES.reduce((acc, s) => ({ ...acc, [s.id]: s }), {});

function parseArgs() {
  const args = {};
  const parts = process.argv.slice(2);
  for (let i = 0; i < parts.length; i += 2) {
    const key = parts[i];
    const value = parts[i + 1];
    if (!key?.startsWith('--')) continue;
    args[key.slice(2)] = value;
  }
  return args;
}

function usage() {
  console.log('Usage: node change-appointment.js --id <appointmentId> --user <userEmail> [--trainer <trainerId>] [--datetime <ISO>] [--service <serviceId>]');
  console.log('Examples:');
  console.log('  node change-appointment.js --id 12 --user ivan.horvat@mail.com --datetime 2026-01-15T16:00:00Z');
  console.log('  node change-appointment.js --id 12 --user ivan.horvat@mail.com --trainer 3 --service crossfit');
}

async function main() {
  const { id, user: userEmail, trainer, datetime, service } = parseArgs();
  if (!id || !userEmail) {
    usage();
    throw new Error('Missing required --id or --user');
  }
  if (!trainer && !datetime && !service) {
    usage();
    throw new Error('Provide at least one of --trainer, --datetime, --service');
  }

  const apptId = Number(id);
  if (!apptId || Number.isNaN(apptId)) throw new Error('Invalid appointment id');

  let newStart = null;
  if (datetime) {
    newStart = new Date(datetime);
    if (Number.isNaN(newStart.getTime())) throw new Error('Invalid datetime');
    if (newStart.getMinutes() !== 0 || newStart.getSeconds() !== 0 || newStart.getMilliseconds() !== 0) {
      throw new Error('Appointments must start on the hour (e.g. 16:00)');
    }
  }

  const { rows: apptRows } = await db.query(
    `SELECT a.id, a.user_id, a.trainer_id, a.scheduled_at, a.duration_minutes, a.service_name, u.email
     FROM termini a
     JOIN korisnici u ON u.id = a.user_id
     WHERE a.id = $1`,
    [apptId]
  );
  if (!apptRows.length) throw new Error('Appointment not found');
  const appt = apptRows[0];

  if (appt.email.toLowerCase() !== userEmail.toLowerCase()) {
    throw new Error('User does not own this appointment');
  }

  const nextTrainerId = trainer ? Number(trainer) : Number(appt.trainer_id);
  if (!nextTrainerId || Number.isNaN(nextTrainerId)) throw new Error('Invalid trainer id');

  const chosenService = service ? SERVICE_MAP[service] : null;
  if (service && !chosenService) throw new Error(`Unknown service id: ${service}`);
  const nextDuration = chosenService ? chosenService.duration : Number(appt.duration_minutes || 60);
  const nextServiceName = chosenService ? chosenService.name : appt.service_name;

  const currentStart = new Date(appt.scheduled_at);
  const finalStart = newStart || currentStart;
  const startIso = finalStart.toISOString();
  const endIso = new Date(finalStart.getTime() + nextDuration * 60000).toISOString();

  // Prevent overlaps with other appointments (same trainer or same user)
  const trainerOverlap = await db.query(
    `SELECT 1 FROM termini
     WHERE id <> $1 AND trainer_id = $2
       AND scheduled_at < $4
       AND (scheduled_at + (duration_minutes || ' minutes')::interval) > $3
     LIMIT 1`,
    [apptId, nextTrainerId, startIso, endIso]
  );
  if (trainerOverlap.rows.length) throw new Error('Selected slot is not available for this trainer');

  const userOverlap = await db.query(
    `SELECT 1 FROM termini
     WHERE id <> $1 AND user_id = $2
       AND scheduled_at < $4
       AND (scheduled_at + (duration_minutes || ' minutes')::interval) > $3
     LIMIT 1`,
    [apptId, appt.user_id, startIso, endIso]
  );
  if (userOverlap.rows.length) throw new Error('User already has an appointment in that period');

  const { rows: updated } = await db.query(
    `UPDATE termini
     SET trainer_id = $1,
         scheduled_at = $2,
         duration_minutes = $3,
         service_name = $4
     WHERE id = $5
     RETURNING *`,
    [nextTrainerId, startIso, nextDuration, nextServiceName, apptId]
  );

  console.log('✓ Appointment updated');
  console.table(updated);
}

main()
  .catch(err => {
    console.error('Error:', err.message || err);
    process.exitCode = 1;
  })
  .finally(() => {
    // Ensure pool is closed so the script exits cleanly
    db.pool.end();
  });
