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
import taskRoutes from './modules/task/task.routes.js';
import printFormsRoutes from './modules/printForms/printForms.routes.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';
import warehouseRoutes from './modules/warehouse/warehouse.routes.js';
import inventoryAuditRoutes, { inventoryAuditItemsRouter } from './modules/warehouse/inventory-audit.routes.js';
import reportsRoutes from './modules/reports/reports.routes.js';


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
app.use('/api/system', requireAuth, systemRoutes);
app.use('/api/staff', requireAuth, requireOwner, staffRoutes);
app.use('/api/settings', requireAuth, settingsRoutes);
app.use('/api/audit-logs', requireAuth, requireOwner, auditRoutes);
app.use('/api/dashboard', requireAuth, dashboardRoutes);
app.use('/api/products', requireAuth, productRoutes);
app.use('/api/customers', requireAuth, customerRoutes);
app.use('/api/tasks', requireAuth, requireOwner, taskRoutes);
app.use('/api/print-forms', requireAuth, requireOwner, printFormsRoutes);
app.use('/api/warehouse', requireAuth, warehouseRoutes);
app.use('/api/inventory-audits', requireAuth, inventoryAuditRoutes);
app.use('/api/inventory-audit-items', requireAuth, inventoryAuditItemsRouter);
app.use('/api/reports', requireAuth, requireOwner, reportsRoutes);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  const isMongooseValidation = err?.name === 'ValidationError';
  const isDuplicateKey = err?.code === 11000 || err?.code === 11001;
  const status = err.status
    ?? (err.name === 'ZodError' ? 422
      : isMongooseValidation ? 400
      : isDuplicateKey ? 409
      : 500);
  res.status(status).json({
    message: err.message ?? 'Server error',
    issues: err.issues,
    usage: err.usage,
  });
});

connectDatabase().then(async () => {
  await bootstrapSystem();
  app.listen(env.port, () => console.log(`[api] http://localhost:${env.port}`));
});
