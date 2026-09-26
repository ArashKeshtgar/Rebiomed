import Stripe from 'stripe';
import keys from '../config/keys';

const stripe = new Stripe(keys.stripeSecretKey);

export default stripe;
