import React from 'react';
import { NavLink } from 'react-router-dom';

const AdminTabs = () => (
  <ul className="nav nav-tabs mb-4">
    <li className="nav-item">
      <NavLink className="nav-link" to="/admin/verifications">Seller Verification</NavLink>
    </li>
    <li className="nav-item">
      <NavLink className="nav-link" to="/admin/disputes">Disputes</NavLink>
    </li>
  </ul>
);

export default AdminTabs;
