
const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ==========================================
// 1. Load Environment Variables
// ==========================================

const envPath = path.resolve(__dirname, '../.env');

const envResult = dotenv.config({
  path: envPath,
});

if (envResult.error) {
  console.error('[Seed Error] Failed to load .env file:', envResult.error.message);
  process.exit(1);
}

console.log('[Seed] Environment file loaded successfully');

// ==========================================
// 2. Import Models
// ==========================================

const User = require('../models/User');

// ==========================================
// 3. Seed Admin Function
// ==========================================

const seedAdmin = async () => {
  const {
    ADMIN_NAME,
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    MONGODB_URI,
  } = process.env;

  // Verify required environment variables
  console.log('[Seed Debug] Environment variables:', {
    ADMIN_NAME: Boolean(ADMIN_NAME),
    ADMIN_EMAIL: Boolean(ADMIN_EMAIL),
    ADMIN_PASSWORD: Boolean(ADMIN_PASSWORD),
    MONGODB_URI: Boolean(MONGODB_URI),
  });

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error(
      '[Seed Error] ADMIN_EMAIL and ADMIN_PASSWORD must be defined in server/.env'
    );
    process.exitCode = 1;
    return;
  }

  // MongoDB connection
  const mongoURI =
    MONGODB_URI ||
    'mongodb://127.0.0.1:27017/construction_db?replicaSet=rs0';

  try {
    // ==========================================
    // 4. Connect to MongoDB
    // ==========================================

    await mongoose.connect(mongoURI);

    console.log('[Seed] Connected to MongoDB successfully');
    console.log(`[Seed] Database: ${mongoose.connection.name}`);

    // ==========================================
    // 5. Normalize Admin Email
    // ==========================================

    const normalizedEmail = ADMIN_EMAIL.trim().toLowerCase();

    // ==========================================
    // 6. Check Existing Admin
    // ==========================================

    const existingAdmin = await User.findOne({
      email: normalizedEmail,
    });

    if (existingAdmin) {
      console.log(
        `[Seed Info] Admin already exists: ${normalizedEmail}`
      );
      console.log('[Seed Info] Skipping admin creation.');

      return;
    }

    // ==========================================
    // 7. Hash Admin Password
    // ==========================================

    const saltRounds = 12;

    const passwordHash = await bcrypt.hash(
      ADMIN_PASSWORD,
      saltRounds
    );

    // ==========================================
    // 8. Create Admin User
    // ==========================================

    const admin = await User.create({
      name: (ADMIN_NAME || 'Admin').trim(),
      email: normalizedEmail,
      passwordHash,
    });

    console.log('[Seed Success] Admin created successfully!');
    console.log(` - ID: ${admin._id}`);
    console.log(` - Name: ${admin.name}`);
    console.log(` - Email: ${admin.email}`);

  } catch (error) {
    console.error('[Seed Error] Failed to seed admin:', error.message);
    process.exitCode = 1;

  } finally {
    // ==========================================
    // 9. Close MongoDB Connection
    // ==========================================

    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('[Seed] MongoDB connection closed');
    }
  }
};

// ==========================================
// 10. Execute Seed
// ==========================================

seedAdmin().catch((error) => {
  console.error('[Seed Fatal Error]', error);
  process.exitCode = 1;
});
