import axios from 'axios';
import {
  GET_PRODUCTS_SUCCESS,
  GET_PRODUCT_SUCCESS,
  PRODUCTS_LOADING,
  GET_MY_PRODUCTS_SUCCESS,
  DELETE_PRODUCT_SUCCESS,
  GET_ERRORS
} from './types';

// filters: { category, deviceClass, condition, province } — empty values are ignored
export const getProducts = (filters = {}) => async dispatch => {
  dispatch({ type: PRODUCTS_LOADING });
  try {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    const res = await axios.get('/api/products', { params });
    dispatch({ type: GET_PRODUCTS_SUCCESS, payload: res.data });
  } catch (err) {
    dispatch({ type: GET_ERRORS, payload: err.response ? err.response.data : {} });
  }
};

export const getProduct = (id) => async dispatch => {
  dispatch({ type: PRODUCTS_LOADING });
  try {
    const res = await axios.get(`/api/products/${id}`);
    dispatch({ type: GET_PRODUCT_SUCCESS, payload: res.data });
  } catch (err) {
    dispatch({ type: GET_ERRORS, payload: err.response ? err.response.data : {} });
  }
};

export const getMyProducts = () => async dispatch => {
  dispatch({ type: PRODUCTS_LOADING });
  try {
    const res = await axios.get('/api/products/mine');
    dispatch({ type: GET_MY_PRODUCTS_SUCCESS, payload: res.data });
  } catch (err) {
    dispatch({ type: GET_ERRORS, payload: err.response ? err.response.data : {} });
  }
};

export const createProduct = (formData) => async dispatch => {
  try {
    const res = await axios.post('/api/products', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return res.data;
  } catch (err) {
    dispatch({ type: GET_ERRORS, payload: err.response ? err.response.data : {} });
    throw err;
  }
};

export const deleteProduct = (id) => async dispatch => {
  try {
    await axios.delete(`/api/products/${id}`);
    dispatch({ type: DELETE_PRODUCT_SUCCESS, payload: id });
  } catch (err) {
    dispatch({ type: GET_ERRORS, payload: err.response ? err.response.data : {} });
  }
};
