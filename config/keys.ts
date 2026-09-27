import path from 'path';

export const mongoURI: string = process.env.MONGO_URI || 'mongodb://localhost:27017/mern-store';
export const jwtSecret: string = process.env.JWT_SECRET || 'dev-only-secret-change-me';
export const stripeSecretKey: string = process.env.STRIPE_SECRET_KEY || '';
export const stripeWebhookSecret: string = process.env.STRIPE_WEBHOOK_SECRET || '';
// Signing secret of the Connect webhook endpoint (events from sellers' accounts).
export const stripeConnectWebhookSecret: string = process.env.STRIPE_CONNECT_WEBHOOK_SECRET || '';
// Platform commission in basis points (800 = 8%), kept from each seller's share.
export const platformFeeBps: number = Number(process.env.PLATFORM_FEE_BPS) || 800;
// Where Stripe sends sellers back to after onboarding.
export const clientUrl: string = process.env.CLIENT_URL || 'http://localhost:3000';
// Verification documents live outside the public /uploads static folder.
export const privateUploadDir: string = process.env.PRIVATE_UPLOAD_DIR || path.join(process.cwd(), 'private-uploads');
export const port: number = Number(process.env.PORT) || 5000;

export default {
  mongoURI, jwtSecret, stripeSecretKey, stripeWebhookSecret, stripeConnectWebhookSecret,
  platformFeeBps, clientUrl, privateUploadDir, port
};
