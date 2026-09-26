import { ADD_TO_CART, REMOVE_FROM_CART, UPDATE_CART_QTY, CLEAR_CART } from '../actions/types';

const loadCart = () => {
  try {
    const raw = localStorage.getItem('cartItems');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const initialState = {
  items: loadCart()
};

export default function cartReducer(state = initialState, action) {
  switch (action.type) {
    case ADD_TO_CART: {
      const { product, quantity } = action.payload;
      const existing = state.items.find(i => i.productId === product._id);
      const cap = qty => Math.min(qty, product.stock);
      let items;
      if (existing) {
        items = state.items.map(i =>
          i.productId === product._id ? { ...i, stock: product.stock, quantity: cap(i.quantity + quantity) } : i
        );
      } else {
        items = [
          ...state.items,
          {
            productId: product._id,
            title: product.title,
            price: product.price,
            imageUrl: product.imageUrl,
            stock: product.stock,
            quantity: cap(quantity)
          }
        ];
      }
      return { ...state, items };
    }
    case REMOVE_FROM_CART:
      return { ...state, items: state.items.filter(i => i.productId !== action.payload) };
    case UPDATE_CART_QTY:
      return {
        ...state,
        items: state.items.map(i =>
          i.productId === action.payload.productId
            ? { ...i, quantity: Math.max(1, Math.min(action.payload.quantity, i.stock ?? Infinity)) }
            : i
        )
      };
    case CLEAR_CART:
      return { ...state, items: [] };
    default:
      return state;
  }
}
