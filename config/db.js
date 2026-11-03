const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const mongoURI = 'mongodb+srv://sanjitpal132_db_user:0bd4miMKA98xf3LS@cluster0.brj5ib0.mongodb.net/';
    const conn = await mongoose.connect(mongoURI);

    console.log(`[MongoDB] Connected successfully to host: ${conn.connection.host}, database: ${conn.connection.name}`);
  } catch (error) {
    console.error(`[MongoDB Connection Error] ${error.message}`);
    console.error('Hint: Make sure your local MongoDB daemon is running and replica set (rs0) is initiated.');
    process.exit(1);
  }
};

module.exports = connectDB;

