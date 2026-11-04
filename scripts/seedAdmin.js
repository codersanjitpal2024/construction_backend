const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const ensureAdminFromEnv = require('../services/adminSeeder');

const envPath = path.resolve(__dirname, '../.env');
const envResult = dotenv.config({ path: envPath });

if (envResult.error && envResult.error.code !== 'ENOENT') {
  console.error('[Seed Error] Failed to load .env file:', envResult.error.message);
  process.exit(1);
}

const seedAdmin = async () => {
  const { MONGODB_URI } = process.env;
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI must be defined in server/.env or the process environment');
  }

  await mongoose.connect(MONGODB_URI);
  console.log(`[Seed] Connected to MongoDB database: ${mongoose.connection.name}`);

  try {
    await ensureAdminFromEnv({ required: true });
  } finally {
    await mongoose.disconnect();
    console.log('[Seed] MongoDB connection closed');
  }
};

if (require.main === module) {
  seedAdmin().catch((error) => {
    console.error('[Seed Error] Failed to seed admin:', error.message);
    process.exitCode = 1;
  });
}

module.exports = seedAdmin;
