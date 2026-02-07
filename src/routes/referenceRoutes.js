import express from 'express';
import * as referenceController from '../controllers/referenceController.js';
import { isAuthenticated } from '../middleware/authMiddleware.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';

const router = express.Router();

// Tüm route'lar authentication gerektirir
router.use(isAuthenticated);

// 📊 REFERANS İSTATİSTİKLERİ (/:id'den önce!)
router.route('/stats')
  .get(checkPermission('sales', 'view'), referenceController.getReferenceStats);

// 📈 REFERANS PERFORMANS RAPORU (GELİŞMİŞ)
router.route('/performance-report')
  .get(checkPermission('sales', 'view'), referenceController.getReferencePerformanceReport);

// 📋 REFERANS KAYNAKLARI
router.route('/')
  .get(checkPermission('sales', 'view'), referenceController.getAllReferences)
  .post(checkPermission('sales', 'create'), referenceController.createReference);

router.route('/:id')
  .get(checkPermission('sales', 'view'), referenceController.getReferenceById)
  .put(checkPermission('sales', 'update'), referenceController.updateReference)
  .delete(checkPermission('sales', 'delete'), referenceController.deleteReference);

export default router;

