const mongoose = require('mongoose');

// @desc    Basic server health check
// @route   GET /api/health
// @access  Public
const getHealth = (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
  });
};

// @desc    Database & Replica Set Transaction health check
// @route   GET /api/health/db
// @access  Public
// const getDbHealth = async (req, res) => {
//   let session = null;

//   try {
//     // Check if mongoose is connected
//     if (mongoose.connection.readyState !== 1) {
//       return res.status(503).json({
//         status: 'error',
//         message: 'MongoDB is not connected. Please ensure MongoDB is running locally.',
//         readyState: mongoose.connection.readyState,
//       });
//     }

//     // Open a Mongoose session to test replica set transactions
//     // session = await mongoose.startSession();
//     // session.startTransaction();

//     // Commit the empty transaction
//     await session.commitTransaction();

//     return res.status(200).json({
//       transactions: 'ok',
//     });
//   } catch (error) {
//     return res.status(503).json({
//       status: 'error',
//       message:
//         'MongoDB transaction failed. Please check that your local MongoDB instance is running as a replica set (rs0). Run "rs.status()" or "rs.initiate()" in mongosh.',
//       error: error.message,
//     });
//   } finally {
//     if (session) {
//       session.endSession();
//     }
//   }
// };

module.exports = {
  getHealth,
  // getDbHealth,
};

