import express from 'express';
import * as staffController from '../controllers/staffController.js';
import { isAuthenticated, requireAccountId } from '../middleware/authMiddleware.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';

const router = express.Router();

router.use(isAuthenticated, requireAccountId);

router.route('/')
  .get(checkPermission('staff', 'view'), staffController.getAllStaff)
  .post(checkPermission('staff', 'create'), staffController.createStaff);

router.route('/permissions')
  .get(checkPermission('staff', 'view'), staffController.getAllPermissions);

router.route('/commission-report')
  .get(checkPermission('staff', 'view'), staffController.getCommissionReport);

router.route('/:id')
  .get(checkPermission('staff', 'view'), staffController.getStaffById)
  .put(checkPermission('staff', 'update'), staffController.updateStaff)
  .delete(checkPermission('staff', 'delete'), staffController.deleteStaff);

router.route('/:id/permissions')
  .put(checkPermission('staff', 'update'), staffController.updateStaffPermissions);

export default router; 