import axios from 'axios';

// Verification documents need the auth header, so a plain <a href> won't do:
// fetch the file with axios, then hand the browser a temporary object URL.
export const downloadDocument = async (orgId, doc) => {
  const res = await axios.get(`/api/organizations/${orgId}/documents/${doc._id}`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = doc.originalName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};
