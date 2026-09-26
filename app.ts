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

export default app;
