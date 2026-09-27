import '../env';

import mongoose from 'mongoose';
import connectDB from '../db';
import User from '../models/User';

// Grants (or with --revoke, removes) admin rights for an existing account:
//   npm run make-admin -- someone@example.com
//   npm run make-admin -- someone@example.com --revoke
// Admin rights are deliberately not grantable through the API.
const run = async (): Promise<void> => {
  const email = process.argv[2];
  const revoke = process.argv.includes('--revoke');
  if (!email) {
    console.error('Usage: npm run make-admin -- <email> [--revoke]');
    process.exit(1);
  }

  await connectDB();
  const user = await User.findOneAndUpdate({ email }, { isAdmin: !revoke }, { new: true });
  if (!user) {
    console.error(`No user with email ${email}. Register the account first.`);
    process.exit(1);
  }
  console.log(`${user.email} is ${user.isAdmin ? 'now an admin' : 'no longer an admin'}. They need to log in again to see the admin page.`);
  await mongoose.connection.close();
  process.exit(0);
};

run().catch(err => {
  console.error(err);
  process.exit(1);
});
