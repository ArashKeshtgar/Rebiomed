import chai, { expect } from 'chai';
import chaiHttp from 'chai-http';
import app from '../app';

chai.use(chaiHttp);

describe('Service', () => {
  it('reports healthy once the database is connected', async () => {
    const res = await chai.request(app).get('/api/health');
    expect(res).to.have.status(200);
    expect(res.body).to.include({ status: 'ok', db: true });
  });

  it('answers unknown API paths with a JSON 404, not the web app', async () => {
    const res = await chai.request(app).get('/api/nope');
    expect(res).to.have.status(404);
    expect(res.body).to.deep.equal({ msg: 'Not found' });
  });
});
