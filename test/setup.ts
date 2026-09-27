import os from 'os';
import path from 'path';

process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/mern-store-test';
process.env.PRIVATE_UPLOAD_DIR = path.join(os.tmpdir(), 'rebiomed-test-private-uploads');
