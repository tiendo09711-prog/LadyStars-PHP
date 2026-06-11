import { Router } from 'express';
import { RevenueTime } from './revenueTime.model.js';

const router = Router();

router.get('/revenue-time', async (req, res) => {
  try {
    const data = await RevenueTime.find().sort({ time: 1 });
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
