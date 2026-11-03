const express = require('express');
const router = express.Router();

const healthRoutes = require('./healthRoutes');
const authRoutes = require('./authRoutes');
const metaRoutes = require('./metaRoutes');
const productRoutes = require('./productRoutes');
const supplierRoutes = require('./supplierRoutes');
const purchaseRoutes = require('./purchaseRoutes');
const inventoryRoutes = require('./inventoryRoutes');
const customerRoutes = require('./customerRoutes');
const saleRoutes = require('./saleRoutes');
const quotationRoutes = require('./quotationRoutes');
const settingsRoutes = require('./settingsRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const { requireAuth } = require('../middleware/authMiddleware');

// Public endpoints
router.use('/health', healthRoutes);
router.use('/auth', authRoutes);

// Protect all remaining /api routes by default
router.use(requireAuth);

// Protected application modules
router.use('/dashboard', dashboardRoutes);
router.use('/meta', metaRoutes);
router.use('/products', productRoutes);
router.use('/suppliers', supplierRoutes);
router.use('/purchases', purchaseRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/customers', customerRoutes);
router.use('/quotations', quotationRoutes);
router.use('/sales', saleRoutes);
router.use('/settings', settingsRoutes);

module.exports = router;
