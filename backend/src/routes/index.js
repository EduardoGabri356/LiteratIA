import { Router } from 'express';
import booksRoutes from './books.routes.js';
import userRoutes from './user.routes.js';

const router = Router();

router.get('/ping', (req, res) => res.json({ ok: true, sessionUuid: req.sessionUuid }));
router.use('/user', userRoutes);
router.use('/books', booksRoutes);

export default router;
