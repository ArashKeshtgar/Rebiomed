import os from 'os';
import path from 'path';

process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/mern-store-test';
process.env.PRIVATE_UPLOAD_DIR = path.join(os.tmpdir(), 'rebiomed-test-private-uploads');
// Lets tests sign Connect webhook events with Stripe's own test-header helper.
process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_test_connect_secret';
process.env.PLATFORM_FEE_BPS = '800';
