import express from 'express';
import * as clientController from '../controllers/clientController.js';
import { isAuthenticated } from '../middleware/authMiddleware.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';

const router = express.Router();

router.use(isAuthenticated);

router.route('/')
  .get(checkPermission('clients', 'view'), clientController.getAllClients)
  .post(checkPermission('clients', 'create'), clientController.createClient);

router.route('/:id')
  .get(checkPermission('clients', 'view'), clientController.getClientById)
  .put(checkPermission('clients', 'update'), clientController.updateClient)
  .delete(checkPermission('clients', 'delete'), clientController.deleteClient);

router.route('/:id/hard')
  .delete(checkPermission('clients', 'delete'), clientController.hardDeleteClient);

export default router; 