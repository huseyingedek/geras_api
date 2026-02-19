import express from 'express';
import * as planController from '../controllers/planController.js';

const router = express.Router();

// Public — fiyatlandırma sayfası için
router.get('/', planController.getPublicPlans);

export default router;
