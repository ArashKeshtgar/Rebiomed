import chai, { expect } from 'chai';
import chaiHttp from 'chai-http';
import fs from 'fs';
import app from '../app';
import keys from '../config/keys';
import User from '../models/User';
import Organization from '../models/Organization';
import Product from '../models/Product';
import Category from '../models/Category';

chai.use(chaiHttp);

const PDF = Buffer.from('%PDF-1.4\n% test document\n');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const register = async (email: string): Promise<string> => {
  const res = await chai.request(app).post('/api/auth/register')
    .send({ name: email.split('@')[0], email, password: 'password123' });
  return res.body.token;
};

const bearer = (token: string) => `Bearer ${token}`;

describe('Seller verification', () => {
  let seller: string;
  let adminToken: string;
  let outsider: string;
  let orgId: string;
  let categoryId: string;

  const upload = (token: string, content: Buffer, filename = 'licence.pdf', kind = 'mdel_licence') =>
    chai.request(app).post('/api/organizations/mine/documents')
      .set('Authorization', bearer(token))
      .field('kind', kind)
      .attach('document', content, filename);

  const requestReview = (token = seller) => chai.request(app)
    .post('/api/organizations/mine/verification-request').set('Authorization', bearer(token));
  const verify = (token = adminToken) => chai.request(app)
    .post(`/api/admin/organizations/${orgId}/verify`).set('Authorization', bearer(token));
  const reject = (note?: string) => chai.request(app)
    .post(`/api/admin/organizations/${orgId}/reject`).set('Authorization', bearer(adminToken)).send({ note });
  const listClassIII = () => chai.request(app).post('/api/products').set('Authorization', bearer(seller)).send({
    title: 'Infusion pump', description: 'x', price: '900', category: categoryId, imageUrl: 'x.png',
    manufacturer: 'Test', deviceModel: 'IP-1', deviceClass: 'III', condition: 'refurbished'
  });

  beforeEach(async () => {
    await Promise.all([
      User.deleteMany({}), Organization.deleteMany({}), Product.deleteMany({}), Category.deleteMany({})
    ]);
    fs.rmSync(keys.privateUploadDir, { recursive: true, force: true });
    fs.mkdirSync(keys.privateUploadDir, { recursive: true });

    seller = await register('seller@test.ca');
    outsider = await register('outsider@test.ca');
    adminToken = await register('admin@test.ca');
    await User.updateOne({ email: 'admin@test.ca' }, { isAdmin: true });
    categoryId = (await Category.create({ name: 'Patient Monitoring' })).id;

    const org = await chai.request(app).post('/api/organizations').set('Authorization', bearer(seller))
      .send({ name: 'North Clinic', type: 'clinic', province: 'MB', city: 'Winnipeg' });
    orgId = org.body._id;
  });

  describe('documents', () => {
    it('stores a PDF privately and hides the storage name', async () => {
      const res = await upload(seller, PDF);
      expect(res).to.have.status(200);
      const doc = res.body.documents[0];
      expect(doc).to.include({ kind: 'mdel_licence', originalName: 'licence.pdf', mimeType: 'application/pdf' });
      expect(doc).to.not.have.property('storedName');
      expect(fs.readdirSync(keys.privateUploadDir)).to.have.length(1);
    });

    it('identifies files by content, not by name or declared type', async () => {
      const fake = await upload(seller, Buffer.from('MZ not really a pdf'), 'licence.pdf');
      expect(fake).to.have.status(400);
      expect(fs.readdirSync(keys.privateUploadDir)).to.have.length(0);

      const png = await upload(seller, PNG, 'scan.pdf');
      expect(png.body.documents[0].mimeType).to.equal('image/png');
    });

    it('rejects an unknown document kind', async () => {
      expect(await upload(seller, PDF, 'a.pdf', 'selfie')).to.have.status(400);
    });

    it('lets the owner and admins download, and nobody else', async () => {
      const docId = (await upload(seller, PDF)).body.documents[0]._id;
      const url = `/api/organizations/${orgId}/documents/${docId}`;

      const owner = await chai.request(app).get(url).set('Authorization', bearer(seller)).buffer();
      expect(owner).to.have.status(200);
      expect(owner.header['content-type']).to.match(/application\/pdf/);

      expect(await chai.request(app).get(url).set('Authorization', bearer(adminToken))).to.have.status(200);
      expect(await chai.request(app).get(url).set('Authorization', bearer(outsider))).to.have.status(404);
      expect(await chai.request(app).get(url)).to.have.status(401);
    });

    it('does not serve private documents from the public uploads folder', async () => {
      await upload(seller, PDF);
      const stored = fs.readdirSync(keys.privateUploadDir)[0];
      expect(await chai.request(app).get(`/uploads/${stored}`)).to.have.status(404);
    });
  });

  describe('review flow', () => {
    it('requires a document before a review can be requested', async () => {
      expect(await requestReview()).to.have.status(400);
      await upload(seller, PDF);
      const res = await requestReview();
      expect(res).to.have.status(200);
      expect(res.body.verificationStatus).to.equal('pending');
    });

    it('requires dealers to give an MDEL number', async () => {
      await chai.request(app).put('/api/organizations/mine').set('Authorization', bearer(seller))
        .send({ name: 'North Clinic', type: 'dealer', province: 'MB', city: 'Winnipeg' });
      await upload(seller, PDF);
      const res = await requestReview();
      expect(res).to.have.status(400);
      expect(res.body.msg).to.match(/MDEL/);
    });

    it('keeps the admin queue and decisions away from non-admins', async () => {
      await upload(seller, PDF);
      await requestReview();
      const queue = await chai.request(app).get('/api/admin/organizations').set('Authorization', bearer(seller));
      expect(queue).to.have.status(403);
      expect(await verify(seller)).to.have.status(403);
    });

    it('re-checks admin rights in the database, not just the token', async () => {
      await upload(seller, PDF);
      await requestReview();
      await User.updateOne({ email: 'admin@test.ca' }, { isAdmin: false });
      expect(await verify()).to.have.status(403);
    });

    it('lists pending organizations for admins and records who verified them', async () => {
      await upload(seller, PDF);
      await requestReview();
      const queue = await chai.request(app).get('/api/admin/organizations').set('Authorization', bearer(adminToken));
      expect(queue.body.map((o: { name: string }) => o.name)).to.deep.equal(['North Clinic']);
      expect(queue.body[0].owner.email).to.equal('seller@test.ca');

      const res = await verify();
      expect(res.body.verificationStatus).to.equal('verified');
      expect(res.body.verificationHistory.map((e: { status: string }) => e.status)).to.deep.equal(['pending', 'verified']);
    });

    it('only verifies organizations that asked for review', async () => {
      expect(await verify()).to.have.status(409);
    });

    it('requires a reason to reject, and lets the seller try again', async () => {
      await upload(seller, PDF);
      await requestReview();
      expect(await reject('')).to.have.status(400);
      const res = await reject('Licence scan is unreadable');
      expect(res.body.verificationStatus).to.equal('rejected');
      expect(res.body.verificationNote).to.equal('Licence scan is unreadable');
      expect(await requestReview()).to.have.status(200);
    });

    it('does not allow removing documents during review', async () => {
      const docId = (await upload(seller, PDF)).body.documents[0]._id;
      await requestReview();
      const res = await chai.request(app).delete(`/api/organizations/mine/documents/${docId}`)
        .set('Authorization', bearer(seller));
      expect(res).to.have.status(409);
    });
  });

  describe('what verification unlocks', () => {
    const becomeVerified = async () => {
      await upload(seller, PDF);
      await requestReview();
      await verify();
    };

    it('lets verified sellers list Class III devices, but never Class IV', async () => {
      expect(await listClassIII()).to.have.status(403);
      await becomeVerified();
      expect(await listClassIII()).to.have.status(200);

      const classIV = await chai.request(app).post('/api/products').set('Authorization', bearer(seller)).send({
        title: 'Ventilator', description: 'x', price: '900', category: categoryId, imageUrl: 'x.png',
        manufacturer: 'Test', deviceModel: 'V-1', deviceClass: 'IV', condition: 'refurbished'
      });
      expect(classIV).to.have.status(403);
    });

    it('suspends Class III listings when verification is revoked, and restores them on re-verification', async () => {
      await becomeVerified();
      const productId = (await listClassIII()).body._id;

      await reject('MDEL licence expired');
      const browse = await chai.request(app).get('/api/products');
      expect(browse.body.map((p: { _id: string }) => p._id)).to.not.include(productId);
      expect(await chai.request(app).get(`/api/products/${productId}`)).to.have.status(404);

      const checkout = await chai.request(app).post('/api/payment/create-payment-intent')
        .set('Authorization', bearer(outsider)).send({ items: [{ productId, quantity: 1 }] });
      expect(checkout).to.have.status(400);

      await requestReview();
      await verify();
      expect(await chai.request(app).get(`/api/products/${productId}`)).to.have.status(200);
    });

    it('resets verification when the organization changes its identity details', async () => {
      await becomeVerified();
      await listClassIII();

      const phoneOnly = await chai.request(app).put('/api/organizations/mine').set('Authorization', bearer(seller))
        .send({ name: 'North Clinic', type: 'clinic', province: 'MB', city: 'Winnipeg', phone: '204-555-0100' });
      expect(phoneOnly.body.verificationStatus).to.equal('verified');

      const renamed = await chai.request(app).put('/api/organizations/mine').set('Authorization', bearer(seller))
        .send({ name: 'Totally Different Dealer', type: 'clinic', province: 'MB', city: 'Winnipeg' });
      expect(renamed.body.verificationStatus).to.equal('unverified');
      expect((await Product.findOne({ deviceClass: 'III' }))!.suspended).to.equal(true);
    });
  });
});
