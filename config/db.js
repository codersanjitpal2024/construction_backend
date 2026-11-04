const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI;
    if (!mongoURI) {
      throw new Error('MONGODB_URI is not configured. Add it to the server environment.');
    }

    const conn = await mongoose.connect(mongoURI);

    console.log(`[MongoDB] Connected successfully to host: ${conn.connection.host}, database: ${conn.connection.name}`);
  } catch (error) {
    console.error(`[MongoDB Connection Error] ${error.message}`);
    console.error('Hint: Make sure your local MongoDB daemon is running and replica set (rs0) is initiated.');
    process.exit(1);
  }
};

module.exports = connectDB;

