import express from 'express';
import * as clientNotesController from '../controllers/clientNotesController.js';
import { isAuthenticated, requireAccountId } from '../middleware/authMiddleware.js';

const router = express.Router();

// Tüm route'lar authentication ve işletme hesabı gerektirir
router.use(isAuthenticated, requireAccountId);

// 📝 Müşteriye not ekleme
router.post('/clients/:clientId/notes', clientNotesController.createClientNote);

// 📋 Müşterinin notlarını listeleme
router.get('/clients/:clientId/notes', clientNotesController.getClientNotes);

// 📄 Tek not detayı
router.get('/notes/:noteId', clientNotesController.getClientNoteById);

// ✏️ Not güncelleme
router.put('/notes/:noteId', clientNotesController.updateClientNote);

// 🗑️ Not silme
router.delete('/notes/:noteId', clientNotesController.deleteClientNote);

export default router;
