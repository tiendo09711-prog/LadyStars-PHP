import { Router } from 'express';
import { crudRoutes } from '../utils/routeFactory.js';
import { requireOwner } from '../middleware/auth.js';
import { MenuItem, Permission, Role } from './system.models.js';
import branchRoutes from '../org/branch.routes.js';

const router = Router();
router.use('/permissions', requireOwner, crudRoutes(Permission));
router.use('/roles', requireOwner, crudRoutes(Role));
router.use('/menus', requireOwner, crudRoutes(MenuItem));
router.use('/branches', branchRoutes);

export default router;
