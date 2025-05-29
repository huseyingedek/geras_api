import express from 'express';
import * as serviceController from '../controllers/serviceController.js';
import { isAuthenticated } from '../middleware/authMiddleware.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';

const router = express.Router();

router.use(isAuthenticated);

router.route('/')
  .get(checkPermission('services', 'view'), serviceController.getAllServices)
  .post(checkPermission('services', 'create'), serviceController.createService);

router.route('/:id')
  .get(checkPermission('services', 'view'), serviceController.getServiceById)
  .put(checkPermission('services', 'update'), serviceController.updateService)
  .delete(checkPermission('services', 'delete'), serviceController.deleteService);

export default router; 