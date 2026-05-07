import { Router } from 'express';
import { crudRoutes } from '../../core/utils/routeFactory.js';
import { Customer, CustomerGroup } from './customer.models.js';
const router = Router();
router.use('/customers', crudRoutes(Customer));
router.use('/groups', crudRoutes(CustomerGroup));
export default router;
