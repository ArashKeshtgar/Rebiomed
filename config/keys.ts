import path from 'path';

export const mongoURI: string = process.env.MONGO_URI || 'mongodb://localhost:27017/mern-store';
export const jwtSecret: string = process.env.JWT_SECRET || 'dev-only-secret-change-me';
export const stripeSecretKey: string = process.env.STRIPE_SECRET_KEY || '';
export const stripeWebhookSecret: string = process.env.STRIPE_WEBHOOK_SECRET || '';
// Verification documents live outside the public /uploads static folder.
export const privateUploadDir: string = process.env.PRIVATE_UPLOAD_DIR || path.join(process.cwd(), 'private-uploads');
export const port: number = Number(process.env.PORT) || 5000;

export default { mongoURI, jwtSecret, stripeSecretKey, stripeWebhookSecret, privateUploadDir, port };
