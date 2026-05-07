import { Router } from 'express';
import { crudRoutes } from '../../core/utils/routeFactory.js';
import { Project, Task } from './task.models.js';
const router = Router();
router.use('/projects', crudRoutes(Project));
router.use('/tasks', crudRoutes(Task));
export default router;
