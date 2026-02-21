import express from 'express';
import * as clientController from '../controllers/clientController.js';
import { isAuthenticated } from '../middleware/authMiddleware.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';

const router = express.Router();

// PUBLIC routes (auth gerektirmez) - router.use(isAuthenticated) öncesinde
router.get('/consent/page/:token', clientController.getConsentPage);
router.post('/consent/approve/:token', clientController.approveConsent);
router.post('/consent/decline/:token', clientController.declineConsent);

router.use(isAuthenticated);

router.route('/')
  .get(checkPermission('clients', 'view'), clientController.getAllClients)
  .post(checkPermission('clients', 'create'), clientController.createClient);

// Sabit path'ler /:id'den ÖNCE tanımlanmalı
router.route('/bulk/consent')
  .patch(checkPermission('clients', 'update'), clientController.bulkUpdateConsent);

router.route('/:id')
  .get(checkPermission('clients', 'view'), clientController.getClientById)
  .put(checkPermission('clients', 'update'), clientController.updateClient)
  .delete(checkPermission('clients', 'delete'), clientController.deleteClient);

router.route('/:id/hard')
  .delete(checkPermission('clients', 'delete'), clientController.hardDeleteClient);

router.route('/:id/consent')
  .patch(checkPermission('clients', 'update'), clientController.updateClientConsent);

// Personel: Müşteriye SMS ile KVKK onay talebi gönder
router.post('/:id/consent/request', checkPermission('clients', 'update'), clientController.requestConsentViaSMS);

// Kampanya SMS gönderimi (sadakat raporu vb.) — marketingConsent zorunlu
router.post('/:id/sms', checkPermission('clients', 'update'), clientController.sendCampaignSMS);

export default router; 