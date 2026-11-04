const bcrypt = require('bcryptjs');
const User = require('../models/User');

const ensureAdminFromEnv = async ({ required = false } = {}) => {
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    const message = 'ADMIN_EMAIL and ADMIN_PASSWORD are not configured';
    if (required) throw new Error(message);
    console.log(`[Admin Seed] Skipped: ${message}.`);
    return { created: false, skipped: true };
  }

  const normalizedEmail = ADMIN_EMAIL.trim().toLowerCase();
  const existingAdmin = await User.findOne({ email: normalizedEmail });
  if (existingAdmin) {
    console.log(`[Admin Seed] Admin already exists for ${normalizedEmail}; no changes made.`);
    return { created: false, skipped: true, user: existingAdmin };
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const admin = await User.create({
    name: (ADMIN_NAME || 'Admin').trim(),
    email: normalizedEmail,
    passwordHash,
  });

  console.log(`[Admin Seed] Created admin account for ${admin.email}.`);
  return { created: true, user: admin };
};

module.exports = ensureAdminFromEnv;
