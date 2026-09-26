import chai, { expect } from 'chai';
import chaiHttp from 'chai-http';
import app from '../app';
import User from '../models/User';
import Organization from '../models/Organization';
import Product from '../models/Product';
import Category from '../models/Category';

chai.use(chaiHttp);

const register = async (email: string): Promise<string> => {
  const res = await chai.request(app)
    .post('/api/auth/register')
    .send({ name: 'Test', email, password: 'password123' });
  return res.body.token;
};

const validOrg = { name: 'Test Clinic', type: 'clinic', province: 'ON', city: 'Ottawa' };

describe('Marketplace', () => {
  let token: string;
  let categoryId: string;

  const validListing = () => ({
    title: 'Vital signs monitor',
    description: 'Works well',
    price: '1500',
    category: categoryId,
    manufacturer: 'Test Medical',
    deviceModel: 'VS-1',
    deviceClass: 'II',
    condition: 'used_good',
    imageUrl: 'x.png'
  });

  beforeEach(async () => {
    await Promise.all([
      User.deleteMany({}), Organization.deleteMany({}), Product.deleteMany({}), Category.deleteMany({})
    ]);
    token = await register('seller@test.ca');
    categoryId = (await Category.create({ name: 'Patient Monitoring' })).id;
  });

  describe('organizations', () => {
    it('creates an organization and links it to the user', async () => {
      const res = await chai.request(app).post('/api/organizations')
        .set('Authorization', `Bearer ${token}`).send(validOrg);
      expect(res).to.have.status(200);
      expect(res.body.verificationStatus).to.equal('unverified');

      const mine = await chai.request(app).get('/api/organizations/mine').set('Authorization', `Bearer ${token}`);
      expect(mine.body.name).to.equal('Test Clinic');
    });

    it('rejects a second organization for the same user', async () => {
      await chai.request(app).post('/api/organizations').set('Authorization', `Bearer ${token}`).send(validOrg);
      const res = await chai.request(app).post('/api/organizations')
        .set('Authorization', `Bearer ${token}`).send(validOrg);
      expect(res).to.have.status(400);
    });

    it('rejects a province that is not Canadian', async () => {
      const res = await chai.request(app).post('/api/organizations')
        .set('Authorization', `Bearer ${token}`).send({ ...validOrg, province: 'NY' });
      expect(res).to.have.status(400);
    });

    it('does not let the owner verify their own organization', async () => {
      await chai.request(app).post('/api/organizations')
        .set('Authorization', `Bearer ${token}`).send({ ...validOrg, verificationStatus: 'verified' });
      const put = await chai.request(app).put('/api/organizations/mine')
        .set('Authorization', `Bearer ${token}`).send({ ...validOrg, verificationStatus: 'verified' });
      expect(put.body.verificationStatus).to.equal('unverified');
    });
  });

  describe('listings', () => {
    const createOrg = () => chai.request(app).post('/api/organizations')
      .set('Authorization', `Bearer ${token}`).send(validOrg);
    const list = (body: object) => chai.request(app).post('/api/products')
      .set('Authorization', `Bearer ${token}`).send(body);

    it('requires an organization before listing', async () => {
      const res = await list(validListing());
      expect(res).to.have.status(403);
    });

    it('creates a listing located at the organization by default', async () => {
      await createOrg();
      const res = await list({
        ...validListing(),
        serviceHistory: JSON.stringify([{ date: '2026-01-15', type: 'calibration', performedBy: 'Biomed Co' }])
      });
      expect(res).to.have.status(200);
      expect(res.body.location).to.deep.equal({ province: 'ON', city: 'Ottawa' });
      expect(res.body.serviceHistory).to.have.length(1);
      expect(res.body.stock).to.equal(1);
    });

    it('refuses Class III and IV devices', async () => {
      await createOrg();
      for (const deviceClass of ['III', 'IV']) {
        const res = await list({ ...validListing(), deviceClass });
        expect(res).to.have.status(400);
        expect(res.body.errors[0].msg).to.match(/cannot be listed yet/);
      }
    });

    it('rejects missing medical fields and bad service records', async () => {
      await createOrg();
      const { manufacturer: _m, ...noManufacturer } = validListing();
      expect(await list(noManufacturer)).to.have.status(400);
      expect(await list({ ...validListing(), condition: 'like new' })).to.have.status(400);
      expect(await list({ ...validListing(), price: '0' })).to.have.status(400);
      expect(await list({
        ...validListing(),
        serviceHistory: JSON.stringify([{ date: '2026-01-15', type: 'teleport', performedBy: 'X' }])
      })).to.have.status(400);
    });

    it('filters by device class, condition and province', async () => {
      await createOrg();
      await list(validListing());
      await list({ ...validListing(), deviceClass: 'I', condition: 'refurbished', province: 'BC', city: 'Victoria' });

      const byClass = await chai.request(app).get('/api/products?deviceClass=I');
      expect(byClass.body).to.have.length(1);
      const byProvince = await chai.request(app).get('/api/products?province=ON');
      expect(byProvince.body).to.have.length(1);
      expect(byProvince.body[0].organization.name).to.equal('Test Clinic');
      const byCondition = await chai.request(app).get('/api/products?condition=refurbished');
      expect(byCondition.body[0].location.city).to.equal('Victoria');
    });
  });
});
