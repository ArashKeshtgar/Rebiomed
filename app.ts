import './env';

import path from 'path';
import express from 'express';
import connectDB from './db';

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

export default app;
