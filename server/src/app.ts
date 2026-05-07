import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { connectDatabase } from './config/database.js';
import { env } from './config/env.js';
import authRoutes from './core/auth/auth.routes.js';
import { requireAuth } from './core/middleware/auth.js';
import productRoutes from './modules/product/product.routes.js';
import customerRoutes from './modules/customer/customer.routes.js';
import vendorRoutes from './modules/vendor/vendor.routes.js';
import accountingRoutes from './modules/accounting/accounting.routes.js';
import taskRoutes from './modules/task/task.routes.js';
import printFormsRoutes from './modules/printForms/printForms.routes.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';

const app = express();
const allowedOrigins = new Set([env.clientUrl, 'http://localhost:5173', 'http://localhost:5174']);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    if (env.nodeEnv === 'development' && /^http:\/\/localhost:\d+$/.test(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked origin: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

app.get('/health', (_, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', requireAuth, dashboardRoutes);
app.use('/api/products', requireAuth, productRoutes);
app.use('/api/customers', requireAuth, customerRoutes);
app.use('/api/vendors', requireAuth, vendorRoutes);
app.use('/api/accounting', requireAuth, accountingRoutes);
app.use('/api/tasks', requireAuth, taskRoutes);
app.use('/api/print-forms', requireAuth, printFormsRoutes);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  const status = err.name === 'ZodError' ? 422 : 500;
  res.status(status).json({ message: err.message ?? 'Server error', issues: err.issues });
});

connectDatabase().then(() => app.listen(env.port, () => console.log(`[api] http://localhost:${env.port}`)));
