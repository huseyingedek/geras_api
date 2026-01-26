import express from 'express';
import authRoutes from './authRoutes.js';
import adminRoutes from './adminRoutes.js';
import serviceRoutes from './serviceRoutes.js';
import staffRoutes from './staffRoutes.js';
import clientRoutes from './clientRoutes.js';
import salesRoutes from './salesRoutes.js';
import appointmentRoutes from './appointmentRoutes.js';
import dashboardRoutes from './dashboardRoutes.js';
import notificationRoutes from './notificationRoutes.js';
import expenseRoutes from './expenseRoutes.js';
import referenceRoutes from './referenceRoutes.js';
import clientNotesRoutes from './clientNotesRoutes.js';

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ message: 'API çalışıyor' });
});

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/services', serviceRoutes);
router.use('/staff', staffRoutes);
router.use('/clients', clientRoutes);
router.use('/sales', salesRoutes);
router.use('/appointments', appointmentRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/notifications', notificationRoutes);
router.use('/expenses', expenseRoutes);
router.use('/references', referenceRoutes);
router.use('/', clientNotesRoutes); // Client notes routes

export default router; 