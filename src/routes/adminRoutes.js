import express from 'express';
import * as adminController from '../controllers/adminController.js';
import { isAuthenticated, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(isAuthenticated, restrictTo('ADMIN'));

router.route('/accounts')
  .get(adminController.getAllAccounts)
  .post(adminController.createAccount);

router.route('/accounts/:id')
  .get(adminController.getAccountById)
  .put(adminController.updateAccount)
  .delete(adminController.deleteAccount);

export default router; 