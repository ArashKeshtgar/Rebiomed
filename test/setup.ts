import os from 'os';
import path from 'path';
import mongoose from 'mongoose';

process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/mern-store-test';
process.env.PRIVATE_UPLOAD_DIR = path.join(os.tmpdir(), 'rebiomed-test-private-uploads');
// Tests never reach Stripe (stripeOps is stubbed), but payment routes need a
// key to be considered configured. Fixed here so CI, with no .env, matches local.
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_for_tests';
// Lets tests sign Connect webhook events with Stripe's own test-header helper.
process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_test_connect_secret';
process.env.PLATFORM_FEE_BPS = '800';

// Root hooks (mocha loads this file with --require). On a fresh database, as in
// CI, Mongoose builds indexes in the background; the race tests rely on unique
// indexes, so wait until every model's indexes exist.
export const mochaHooks = {
  async beforeAll(this: Mocha.Context) {
    this.timeout(30000);
    await mongoose.connection.asPromise();
    await Promise.all(Object.values(mongoose.models).map(m => m.init()));
  }
};
