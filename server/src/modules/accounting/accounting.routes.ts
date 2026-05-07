import { Router } from 'express';
import { crudRoutes } from '../../core/utils/routeFactory.js';
import { AccountingType, ExpensePayment, PayPerson, Receipt } from './accounting.models.js';
const router = Router();
router.use('/types', crudRoutes(AccountingType));
router.use('/pay-persons', crudRoutes(PayPerson));
router.use('/receipts', crudRoutes(Receipt));
router.use('/payments', crudRoutes(ExpensePayment));
export default router;
