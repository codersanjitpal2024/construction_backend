const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
  login,
  logout,
  getMe,
  changePassword,
  signup,
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
/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Log in
 *     description: Limited to 10 attempts per 15 minutes. Successful login sets the httpOnly token cookie for seven days.
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginInput'
 *     responses:
 *       '200':
 *         description: Logged in; token cookie set.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       '400':
 *         description: Invalid request body.
 *       '401':
 *         description: Invalid email or password.
 *       '429':
 *         description: Too many login attempts.
 */
router.post('/login', loginLimiter, login);

/**
 * @swagger
 * /auth/signup:
 *   post:
 *     summary: Create a user account
 *     description: Send a JSON POST request to create an account. Opening this URL in a browser sends GET and does not sign up.
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SignupInput'
 *     responses:
 *       '201':
 *         description: User created.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       '400':
 *         description: Required fields are missing or email is already registered.
 *       '500':
 *         description: Server error.
 */
router.post('/signup', signup);

// Protected auth routes
/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Log out
 *     tags: [Authentication]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       '200':
 *         description: Logged out; token cookie cleared.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 *       '401':
 *         description: Missing or invalid authentication.
 */
router.post('/logout', requireAuth, logout);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get the current user
 *     tags: [Authentication]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       '200':
 *         description: Current user profile.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CurrentUserResponse'
 *       '401':
 *         description: Missing or invalid authentication.
 */
router.get('/me', requireAuth, getMe);

/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     summary: Change the current user's password
 *     tags: [Authentication]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChangePasswordInput'
 *     responses:
 *       '200':
 *         description: Password changed.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 *       '400':
 *         description: Invalid input or current password does not match.
 *       '401':
 *         description: Missing or invalid authentication.
 *       '404':
 *         description: User not found.
 */
router.post('/change-password', requireAuth, changePassword);

module.exports = router;

