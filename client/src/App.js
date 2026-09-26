import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { Provider } from 'react-redux';
import { jwtDecode } from 'jwt-decode';
import store from './store';

import setAuthToken from './utils/setAuthToken';
import { setCurrentUser, logoutUser } from './actions/authActions';

import Navbar from './components/Layout/Navbar';
import Home from './components/Home';
import Register from './components/Auth/Register';
import Login from './components/Auth/Login';
import ProductList from './components/Products/ProductList';
import ProductDetail from './components/Products/ProductDetail';
import SellProduct from './components/Products/SellProduct';
import MyListings from './components/Products/MyListings';
import OrganizationProfile from './components/Organization/OrganizationProfile';
import CartPage from './components/Cart/CartPage';
import CheckoutForm from './components/Checkout/CheckoutForm';
import OrderHistory from './components/Orders/OrderHistory';
import PrivateRoute from './components/Routing/PrivateRoute';
import NotFound from './components/NotFound';

// Rehydrate auth state from a stored JWT on page load
const token = localStorage.getItem('jwtToken');
if (token) {
  try {
    const decoded = jwtDecode(token);
    if (decoded.exp * 1000 < Date.now()) {
      store.dispatch(logoutUser());
    } else {
      setAuthToken(token);
      store.dispatch(setCurrentUser(decoded.user));
    }
  } catch {
    store.dispatch(logoutUser());
  }
}

const AppRoutes = () => (
  <>
    <Navbar />
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/register" element={<Register />} />
      <Route path="/login" element={<Login />} />
      <Route path="/products" element={<ProductList />} />
      <Route path="/products/:id" element={<ProductDetail />} />
      <Route path="/cart" element={<CartPage />} />
      <Route
        path="/checkout"
        element={
          <PrivateRoute>
            <CheckoutForm />
          </PrivateRoute>
        }
      />
      <Route
        path="/orders"
        element={
          <PrivateRoute>
            <OrderHistory />
          </PrivateRoute>
        }
      />
      <Route
        path="/sell"
        element={
          <PrivateRoute>
            <SellProduct />
          </PrivateRoute>
        }
      />
      <Route
        path="/my-listings"
        element={
          <PrivateRoute>
            <MyListings />
          </PrivateRoute>
        }
      />
      <Route
        path="/organization"
        element={
          <PrivateRoute>
            <OrganizationProfile />
          </PrivateRoute>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  </>
);

const App = () => (
  <Provider store={store}>
    <Router>
      <AppRoutes />
    </Router>
  </Provider>
);

export default App;
