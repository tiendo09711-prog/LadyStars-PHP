import { Router } from 'express';
import { crudRoutes } from '../../core/utils/routeFactory.js';
import { Customer, CustomerGroup, CustomerCare } from './customer.models.js';
const router = Router();

// Auto-generate customer code if missing (e.g., from auto-save in invoice creation)
router.post('/customers', (req, res, next) => {
  if (!req.body.code) {
    req.body.code = `KH${Math.floor(100000 + Math.random() * 900000)}`;
  }
  next();
});

router.use('/customers', crudRoutes(Customer));
router.use('/groups', crudRoutes(CustomerGroup));
router.use('/care', crudRoutes(CustomerCare));
export default router;
