import { Router } from 'express';
import { crudRoutes } from '../../core/utils/routeFactory.js';
import { Category, DeliveryPartner, PaymentMethod, Product, ProductBranchStock, SaleChannel, SalePayment, Shelf, StockAdjustment, Trademark } from './product.models.js';
import { completeSalePayment } from './product.service.js';

const router = Router();
router.use('/categories', crudRoutes(Category));
router.use('/trademarks', crudRoutes(Trademark));
router.use('/shelves', crudRoutes(Shelf));
router.use('/products', crudRoutes(Product));
router.use('/branch-stocks', crudRoutes(ProductBranchStock));
router.use('/sale-channels', crudRoutes(SaleChannel));
router.use('/delivery-partners', crudRoutes(DeliveryPartner));
router.use('/payment-methods', crudRoutes(PaymentMethod));
router.use('/stock-adjustments', crudRoutes(StockAdjustment));
router.use('/sales', crudRoutes(SalePayment));
router.post('/sales/:id/complete', async (req, res) => res.json(await completeSalePayment(req.params.id)));
export default router;
