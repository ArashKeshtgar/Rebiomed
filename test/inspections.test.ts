import chai, { expect } from 'chai';
import chaiHttp from 'chai-http';
import { Types } from 'mongoose';
import app from '../app';
import User from '../models/User';
import Organization from '../models/Organization';
import Product from '../models/Product';
import Inspection from '../models/Inspection';
import { INSPECTION_CHECKS } from '../config/medical';

chai.use(chaiHttp);

const bearer = (t: string) => `Bearer ${t}`;

const register = async (email: string) => {
  const res = await chai.request(app).post('/api/auth/register')
    .send({ name: email.split('@')[0], email, password: 'password123' });
  return res.body.token as string;
};

const createOrg = async (token: string, name: string, type: string, verified: boolean) => {
  const res = await chai.request(app).post('/api/organizations').set('Authorization', bearer(token))
    .send({ name, type, province: 'ON', city: 'Ottawa' });
  if (verified) await Organization.updateOne({ _id: res.body._id }, { verificationStatus: 'verified' });
  return res.body._id as string;
};

const allPass = () => INSPECTION_CHECKS.map(item => ({ item, result: 'pass' }));

const today = () => new Date().toISOString().slice(0, 10);

const validReport = (overrides: Record<string, unknown> = {}) => ({
  inspectedAt: today(),
  technicianName: 'Jo Tech',
  credential: 'CET',
  serialNumber: 'SN-123',
  checks: allPass(),
  outcome: 'pass',
  summary: 'Works as specified.',
  ...overrides
});

describe('Independent inspections', () => {
  let seller: string, inspector: string, otherInspector: string, unverifiedService: string, stranger: string;
  let sellerOrg: string, inspectorOrg: string, otherInspectorOrg: string, unverifiedOrg: string, strangerOrg: string;
  let productId: string;

  const post = (token: string, path: string, body: object = {}) =>
    chai.request(app).post(`/api/inspections${path}`).set('Authorization', bearer(token)).send(body);
  const request = (token = seller, inspectorOrganizationId = inspectorOrg, pid = productId) =>
    post(token, '', { productId: pid, inspectorOrganizationId, note: 'Please test the probes' });
  const acceptedRequest = async () => {
    const id = (await request()).body._id;
    await post(inspector, `/${id}/accept`);
    return id as string;
  };

  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Organization.deleteMany({}), Product.deleteMany({}), Inspection.deleteMany({})]);
    seller = await register('seller@test.ca');
    inspector = await register('inspector@test.ca');
    otherInspector = await register('other-inspector@test.ca');
    unverifiedService = await register('unverified@test.ca');
    stranger = await register('stranger@test.ca');

    sellerOrg = await createOrg(seller, 'Seller Clinic', 'clinic', true);
    inspectorOrg = await createOrg(inspector, 'Biomed Co', 'service_provider', true);
    otherInspectorOrg = await createOrg(otherInspector, 'Other Biomed', 'service_provider', true);
    unverifiedOrg = await createOrg(unverifiedService, 'New Biomed', 'service_provider', false);
    strangerOrg = await createOrg(stranger, 'Dealer', 'dealer', true);

    productId = (await Product.create({
      title: 'Ultrasound', description: 'x', price: 10000, stock: 1, imageUrl: 'x.png',
      category: new Types.ObjectId(), seller: new Types.ObjectId(), organization: sellerOrg,
      manufacturer: 'M', deviceModel: 'U', deviceClass: 'II', condition: 'used_good',
      location: { province: 'ON', city: 'Ottawa' }
    })).id;
  });

  describe('choosing an inspector', () => {
    it('offers only verified biomedical service providers', async () => {
      const res = await chai.request(app).get('/api/inspections/inspectors');
      expect(res.body.map((o: { name: string }) => o.name).sort()).to.deep.equal(['Biomed Co', 'Other Biomed']);
    });

    it('lets the listing organization request an inspection', async () => {
      const res = await request();
      expect(res).to.have.status(200);
      expect(res.body).to.include({ status: 'requested', inspectorOrganization: inspectorOrg, sellerOrganization: sellerOrg });
      expect(res.body).not.to.have.property('openKey');
    });

    it('refuses other organizations\' listings, ineligible inspectors and self-inspection', async () => {
      expect(await request(stranger)).to.have.status(404);
      expect(await request(seller, unverifiedOrg)).to.have.status(400);
      expect(await request(seller, strangerOrg)).to.have.status(400);

      // A verified service provider can't inspect its own listing.
      const ownId = (await Product.create({
        title: 'Own', description: 'x', price: 100, imageUrl: 'x.png', category: new Types.ObjectId(),
        seller: new Types.ObjectId(), organization: inspectorOrg, manufacturer: 'M', deviceModel: 'U',
        deviceClass: 'I', condition: 'used_good', location: { province: 'ON', city: 'Ottawa' }
      })).id;
      const res = await request(inspector, inspectorOrg, ownId);
      expect(res).to.have.status(400);
      expect(res.body.msg).to.match(/other than the seller/);
    });

    it('allows one open request per listing, even when two requests race', async () => {
      const [a, b] = await Promise.all([request(), request(seller, otherInspectorOrg)]);
      expect([a.status, b.status].sort()).to.deep.equal([200, 409]);
    });

    it('allows a new request once the previous one is declined or cancelled', async () => {
      const first = (await request()).body._id;
      await post(inspector, `/${first}/decline`, { note: 'Too far away' });
      const second = await request(seller, otherInspectorOrg);
      expect(second).to.have.status(200);
      await post(seller, `/${second.body._id}/cancel`);
      expect(await request()).to.have.status(200);
    });
  });

  describe('handling a request', () => {
    it('lets only the chosen inspector accept or decline', async () => {
      const id = (await request()).body._id;
      expect(await post(otherInspector, `/${id}/accept`)).to.have.status(404);
      expect(await post(seller, `/${id}/accept`)).to.have.status(403); // a clinic isn't an inspector
      expect((await post(inspector, `/${id}/accept`)).body.status).to.equal('accepted');
      expect(await post(inspector, `/${id}/accept`)).to.have.status(409);
    });

    it('shows requests to the seller and the inspector (with the seller\'s contact) only', async () => {
      await request();
      const mine = await chai.request(app).get('/api/inspections/requested').set('Authorization', bearer(seller));
      expect(mine.body).to.have.length(1);
      expect(mine.body[0].inspectorOrganization.name).to.equal('Biomed Co');
      const assigned = await chai.request(app).get('/api/inspections/assigned').set('Authorization', bearer(inspector));
      expect(assigned.body[0].requestedBy.email).to.equal('seller@test.ca');
      const other = await chai.request(app).get('/api/inspections/assigned').set('Authorization', bearer(otherInspector));
      expect(other.body).to.have.length(0);
    });

    it('closes open requests when the listing is removed', async () => {
      const id = (await request()).body._id;
      await Product.updateOne({ _id: productId }, { seller: (await User.findOne({ email: 'seller@test.ca' }))!._id });
      await chai.request(app).delete(`/api/products/${productId}`).set('Authorization', bearer(seller));
      expect((await Inspection.findById(id))!.status).to.equal('cancelled');
    });
  });

  describe('filing the report', () => {
    const file = (id: string, body: object, token = inspector) => post(token, `/${id}/report`, body);

    it('requires every check, and notes on failed ones', async () => {
      const id = await acceptedRequest();
      const missing = await file(id, validReport({ checks: allPass().slice(1) }));
      expect(missing.body.msg).to.match(/Missing checks: visual_physical/);

      const failNoNote = allPass().map(c => c.item === 'alarms' ? { ...c, result: 'fail' } : c);
      expect((await file(id, validReport({ checks: failNoNote, outcome: 'fail' }))).body.msg).to.match(/Explain the failed check/);

      expect((await file(id, validReport({ serialNumber: '  ' }))).body.msg).to.match(/Serial number is required/);
    });

    it('keeps the outcome consistent with the checks', async () => {
      const id = await acceptedRequest();
      const withFail = (item: string) => allPass().map(c => c.item === item ? { ...c, result: 'fail', notes: 'x' } : c);
      expect((await file(id, validReport({ checks: withFail('alarms') }))).body.msg).to.match(/cannot pass outright/);
      expect((await file(id, validReport({ checks: withFail('electrical_safety'), outcome: 'pass_with_findings' }))).body.msg)
        .to.match(/must fail the inspection/);
      expect(await file(id, validReport({ checks: withFail('alarms'), outcome: 'pass_with_findings' }))).to.have.status(200);
    });

    it('rejects inspection dates in the future or before the request', async () => {
      const id = await acceptedRequest();
      const future = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
      expect((await file(id, validReport({ inspectedAt: future }))).body.msg).to.match(/future/);
      expect((await file(id, validReport({ inspectedAt: '2020-01-01' }))).body.msg).to.match(/before the inspection was requested/);
    });

    it('accepts the local date of a request made in a Canadian evening (already tomorrow in UTC)', async () => {
      const id = await acceptedRequest();
      // Requested at 20:09 in Toronto on the 27th = 00:09 UTC on the 28th.
      const utcMidnight = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
      const createdAt = new Date(utcMidnight + 9 * 60000);
      await Inspection.collection.updateOne({ _id: new Types.ObjectId(id) }, { $set: { createdAt } });
      const localDate = new Date(utcMidnight - 86400000).toISOString().slice(0, 10);
      const twoDaysBefore = new Date(utcMidnight - 2 * 86400000).toISOString().slice(0, 10);
      expect((await file(id, validReport({ inspectedAt: twoDaysBefore }))).body.msg).to.match(/before the inspection was requested/);
      expect(await file(id, validReport({ inspectedAt: localDate }))).to.have.status(200);
    });

    it('is only possible for an accepted request, by its inspector, once', async () => {
      const id = (await request()).body._id;
      expect(await file(id, validReport())).to.have.status(409); // not accepted yet
      await post(inspector, `/${id}/accept`);
      expect(await file(id, validReport(), otherInspector)).to.have.status(404);
      expect(await file(id, validReport(), seller)).to.have.status(403); // a clinic isn't an inspector
      expect(await file(id, validReport())).to.have.status(200);
      expect(await file(id, validReport())).to.have.status(409);
    });

    it('stops an inspector that lost its verification from filing', async () => {
      const id = await acceptedRequest();
      await Organization.updateOne({ _id: inspectorOrg }, { verificationStatus: 'rejected' });
      expect(await file(id, validReport())).to.have.status(403);
    });

    it('publishes the report on the listing, whatever the outcome', async () => {
      const id = await acceptedRequest();
      const checks = allPass().map(c => c.item === 'electrical_safety' ? { ...c, result: 'fail', notes: 'Leakage 900 µA' } : c);
      expect(await file(id, validReport({ checks, outcome: 'fail' }))).to.have.status(200);

      const product = await Product.findById(productId);
      expect(product!.inspection).to.include({ outcome: 'fail', inspectorName: 'Biomed Co' });
      const days = (product!.inspection!.validUntil.getTime() - product!.inspection!.inspectedAt.getTime()) / 86400000;
      expect(days).to.equal(365);

      const reports = await chai.request(app).get(`/api/inspections/product/${productId}`);
      expect(reports.body).to.have.length(1);
      expect(reports.body[0].report).to.include({ outcome: 'fail', serialNumber: 'SN-123' });
      expect(reports.body[0].report).not.to.have.property('submittedBy');
      expect(reports.body[0]).not.to.have.property('requestNote');
      expect(reports.body[0].inspectorOrganization.name).to.equal('Biomed Co');

      const inspected = await chai.request(app).get('/api/products?inspected=1');
      expect(inspected.body.map((p: { _id: string }) => p._id)).to.deep.equal([productId]);
    });

    it('does not let an older inspection replace a newer one on the listing', async () => {
      const first = await acceptedRequest();
      await file(first, validReport());
      const second = (await request(seller, otherInspectorOrg)).body._id;
      await post(otherInspector, `/${second}/accept`);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      // Backdate the request so an earlier inspection date is allowed (raw
      // driver call: Mongoose treats createdAt as immutable).
      await Inspection.collection.updateOne({ _id: new Types.ObjectId(second) }, { $set: { createdAt: new Date(Date.now() - 3 * 86400000) } });
      expect(await file(second, validReport({ inspectedAt: yesterday }), otherInspector)).to.have.status(200);
      expect((await Product.findById(productId))!.inspection!.inspectorName).to.equal('Biomed Co');
      expect((await chai.request(app).get(`/api/inspections/product/${productId}`)).body).to.have.length(2);
    });

    it('accepts a PDF attachment, served publicly without its storage name', async () => {
      const id = await acceptedRequest();
      const fields = validReport();
      const res = await chai.request(app).post(`/api/inspections/${id}/report`).set('Authorization', bearer(inspector))
        .field('inspectedAt', fields.inspectedAt).field('technicianName', fields.technicianName)
        .field('credential', fields.credential).field('serialNumber', fields.serialNumber)
        .field('checks', JSON.stringify(fields.checks)).field('outcome', fields.outcome).field('summary', fields.summary)
        .attach('attachment', Buffer.from('%PDF-1.4 test report'), 'report.pdf');
      expect(res).to.have.status(200);
      expect(res.body.report.attachment).to.include({ originalName: 'report.pdf', mimeType: 'application/pdf' });
      expect(res.body.report.attachment).not.to.have.property('storedName');

      const download = await chai.request(app).get(`/api/inspections/${id}/attachment`).buffer(true);
      expect(download).to.have.status(200);
      expect(download.header['content-type']).to.match(/application\/pdf/);
    });

    it('rejects attachments that are not PDF, PNG or JPEG', async () => {
      const id = await acceptedRequest();
      const res = await chai.request(app).post(`/api/inspections/${id}/report`).set('Authorization', bearer(inspector))
        .field('summary', 'x').attach('attachment', Buffer.from('MZ fake exe'), 'report.pdf');
      expect(res).to.have.status(400);
      expect(res.body.msg).to.match(/Only PDF, PNG and JPEG/);
      expect((await Inspection.findById(id))!.status).to.equal('accepted');
    });
  });
});
