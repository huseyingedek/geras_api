import express from 'express';
import { getSurvey, submitSurvey, getReviews } from '../controllers/surveyController.js';
import { isAuthenticated } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public — müşteri tarafı (auth yok)
router.get('/survey/:token', getSurvey);
router.post('/survey/:token', submitSurvey);

// Authenticated — salon paneli
router.get('/reviews', isAuthenticated, getReviews);

export default router;
