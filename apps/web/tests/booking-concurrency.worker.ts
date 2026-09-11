import { openBookingDb } from "../app/lib/db-booking.server";
import { createPendingBooking } from "../app/lib/booking.server";

async function run() {
  const dbPath = process.env.WORKER_DB_PATH;
  const date = process.env.WORKER_DATE;
  const time = process.env.WORKER_TIME;
  const names = process.env.WORKER_NAMES;
  const email = process.env.WORKER_EMAIL;

  if (!dbPath || !date || !time || !names || !email) {
    console.error("Missing env");
    process.exit(1);
  }

  try {
    const db = openBookingDb(dbPath);
    
    const result = createPendingBooking({
      date,
      time,
      names,
      email,
      language: 'fr'
    }, db);
    
    db.close();

    console.log(JSON.stringify({ success: true, id: result.id }));
    process.exit(0);
  } catch (err: unknown) {
    console.log(JSON.stringify({ 
      success: false, 
      error: err instanceof Error ? err.message : String(err) 
    }));
    process.exit(0);
  }
}

run();
