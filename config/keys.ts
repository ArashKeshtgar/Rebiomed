import path from 'path';

export const isProduction: boolean = process.env.NODE_ENV === 'production';

// Development falls back to local defaults; production refuses to start
// without real values rather than run with a guessable JWT secret.
const required = (name: string, devDefault: string): string => {
  const value = process.env[name];
  if (value) return value;
  if (isProduction) throw new Error(`${name} must be set in production`);
  return devDefault;
};

export const mongoURI: string = required('MONGO_URI', 'mongodb://localhost:27017/mern-store');
export const jwtSecret: string = required('JWT_SECRET', 'dev-only-secret-change-me');
export const stripeSecretKey: string = process.env.STRIPE_SECRET_KEY || '';
export const stripeWebhookSecret: string = process.env.STRIPE_WEBHOOK_SECRET || '';
// Signing secret of the Connect webhook endpoint (events from sellers' accounts).
export const stripeConnectWebhookSecret: string = process.env.STRIPE_CONNECT_WEBHOOK_SECRET || '';
// Platform commission in basis points (800 = 8%), kept from each seller's share.
export const platformFeeBps: number = Number(process.env.PLATFORM_FEE_BPS) || 800;
// Where Stripe sends sellers back to after onboarding. Render sets
// RENDER_EXTERNAL_URL to the service's public URL.
export const clientUrl: string = process.env.CLIENT_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
// Verification documents live outside the public /uploads static folder.
export const privateUploadDir: string = process.env.PRIVATE_UPLOAD_DIR || path.join(process.cwd(), 'private-uploads');
// Serve the React build (client/build) from this server, as in production.
export const serveClient: boolean = isProduction || process.env.SERVE_CLIENT === 'true';
export const port: number = Number(process.env.PORT) || 5000;

export default {
  isProduction, mongoURI, jwtSecret, stripeSecretKey, stripeWebhookSecret, stripeConnectWebhookSecret,
  platformFeeBps, clientUrl, privateUploadDir, serveClient, port
};
