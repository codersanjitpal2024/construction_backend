const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
  login,
  logout,
  getMe,
  changePassword,
  singup,
} = require('../controllers/authController');
const { requireAuth } = require('../middleware/authMiddleware');

// Rate limiter for login: 10 requests per 15 minutes
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts. Please try again after 15 minutes.',
  },
});

// Public auth routes
router.post('/login', loginLimiter, login);
router.post('/signup', singup);

// Protected auth routes
router.post('/logout', requireAuth, logout);
router.get('/me', requireAuth, getMe);
router.post('/change-password', requireAuth, changePassword);

module.exports = router;

