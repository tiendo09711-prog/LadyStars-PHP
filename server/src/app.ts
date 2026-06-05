import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { connectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { bootstrapSystem } from './core/bootstrap.js';
import authRoutes from './core/auth/auth.routes.js';
import { requireAuth, requireOwner } from './core/middleware/auth.js';
import systemRoutes from './core/system/system.routes.js';
import staffRoutes from './core/staff/staff.routes.js';
import settingsRoutes from './core/settings/settings.routes.js';
import auditRoutes from './core/audit/audit.routes.js';
import productRoutes from './modules/product/product.routes.js';
import customerRoutes from './modules/customer/customer.routes.js';
import vendorRoutes from './modules/vendor/vendor.routes.js';
import accountingRoutes from './modules/accounting/accounting.routes.js';
import taskRoutes from './modules/task/task.routes.js';
import printFormsRoutes from './modules/printForms/printForms.routes.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';
import warehouseRoutes from './modules/warehouse/warehouse.routes.js';
import ordersRoutes from './modules/orders/orders.routes.js';
import reportsRoutes from './modules/reports/reports.routes.js';
import { Branch } from './core/org/branch.model.js';
import { crudRoutes } from './core/utils/routeFactory.js';

const app = express();
const allowedOrigins = new Set([env.clientUrl, 'http://localhost:5173', 'http://localhost:5174']);
const isDevelopmentOrigin = (origin: string) =>
  /^http:\/\/localhost:\d+$/.test(origin) ||
  /^http:\/\/127\.0\.0\.1:\d+$/.test(origin) ||
  /^http:\/\/192\.168\.\d+\.\d+:\d+$/.test(origin) ||
  /^http:\/\/10\.\d+\.\d+\.\d+:\d+$/.test(origin) ||
  /^http:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+:\d+$/.test(origin);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    if (env.nodeEnv === 'development' && isDevelopmentOrigin(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked origin: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

app.get('/health', (_, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/system/branches', requireAuth, crudRoutes(Branch));
app.use('/api/system', requireAuth, requireOwner, systemRoutes);
app.use('/api/staff', requireAuth, requireOwner, staffRoutes);
app.use('/api/settings', requireAuth, settingsRoutes);
app.use('/api/audit-logs', requireAuth, requireOwner, auditRoutes);
app.use('/api/dashboard', requireAuth, dashboardRoutes);
app.use('/api/products', requireAuth, productRoutes);
app.use('/api/customers', requireAuth, customerRoutes);
app.use('/api/vendors', requireAuth, vendorRoutes);
app.use('/api/accounting', requireAuth, accountingRoutes);
app.use('/api/tasks', requireAuth, taskRoutes);
app.use('/api/print-forms', requireAuth, printFormsRoutes);
app.use('/api/warehouse', requireAuth, warehouseRoutes);
app.use('/api/orders', requireAuth, ordersRoutes);
app.use('/api/reports', requireAuth, reportsRoutes);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  const status = err.status ?? (err.name === 'ZodError' ? 422 : 500);
  res.status(status).json({ message: err.message ?? 'Server error', issues: err.issues });
});

connectDatabase().then(async () => {
  await bootstrapSystem();
  app.listen(env.port, () => console.log(`[api] http://localhost:${env.port}`));
});
