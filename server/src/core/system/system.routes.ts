import { Router } from 'express';
import { crudRoutes } from '../utils/routeFactory.js';
import { MenuItem, Permission, Role } from './system.models.js';

const router = Router();
router.use('/permissions', crudRoutes(Permission));
router.use('/roles', crudRoutes(Role));
router.use('/menus', crudRoutes(MenuItem));

export default router;
