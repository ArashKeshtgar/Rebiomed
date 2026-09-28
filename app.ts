import './env';

import path from 'path';
import express from 'express';
import mongoose from 'mongoose';
import connectDB from './db';
import keys from './config/keys';

import authRoutes from './routes/auth';
import productRoutes from './routes/products';
import categoryRoutes from './routes/categories';
import reviewRoutes from './routes/reviews';
import paymentRoutes from './routes/payment';
import orderRoutes from './routes/orders';
import webhookRoutes from './routes/webhook';
import organizationRoutes from './routes/organizations';
import adminRoutes from './routes/admin';
import payoutRoutes from './routes/payouts';
import salesRoutes from './routes/sales';
import offerRoutes from './routes/offers';
import inspectionRoutes from './routes/inspections';

const app = express();

connectDB();

// Behind the hosting platform's load balancer; lets req.ip/req.protocol see the client.
app.set('trust proxy', 1);

// Stripe signs the raw request body, so the webhook must be mounted before express.json().
app.use('/api/payment/webhook', webhookRoutes);
app.use(express.json());
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payouts', payoutRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/offers', offerRoutes);
app.use('/api/inspections', inspectionRoutes);

// @route   GET /api/health
// @desc    Liveness/readiness for the hosting platform: 503 until MongoDB is connected
// @access  Public
app.get('/api/health', (_req, res) => {
  const db = mongoose.connection.readyState === 1;
  res.status(db ? 200 : 503).json({ status: db ? 'ok' : 'starting', db, payments: !!keys.stripeSecretKey });
});

app.use('/api', (_req, res) => {
  res.status(404).json({ msg: 'Not found' });
});

// In production one service hosts both the API and the React build, so the
// client can call /api on its own origin. Unknown paths get index.html and are
// routed on the client.
if (keys.serveClient) {
  const build = path.join(process.cwd(), 'client', 'build');
  app.use(express.static(build, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => res.sendFile(path.join(build, 'index.html')));
}

export default app;
