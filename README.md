# ReBiomed

A Canadian marketplace for pre-owned medical equipment, built with MongoDB, Express, React, and Node — TypeScript on the backend, a `framer-motion`-animated frontend, and a Stripe test-mode checkout in CAD.

Clinics, hospitals, equipment dealers and biomedical service companies list equipment on behalf of their organization. Every listing carries the Health Canada device class, condition, usage hours and service/calibration history.

## Features

- **Organizations:** users buy and sell on behalf of a clinic, hospital, dealer or biomedical service provider (province, city, Health Canada MDEL number)
- **Seller verification:** organizations upload supporting documents (MDEL licence, business registration...) and request review; an admin verifies or rejects with a reason, and every decision is kept in an audit history. Documents are stored outside the public uploads folder, identified by their file signature rather than their name, and downloadable only by the owner and admins. Changing identity details (name, type, location, MDEL) after review resets verification, and admin rights are re-checked in the database on every admin request
- **Medical listings:** manufacturer, model, year, Health Canada device class (I–IV), MDL number, condition, usage hours, last service/calibration dates and a service history. Class I and II are open to every seller, Class III only to verified sellers, and Class IV is not accepted yet. If a seller loses verification, its Class III listings are hidden from browsing and checkout until it is verified again
- Browse and filter by category, device class, condition and province; listings show the seller organization and its verification status
- Product detail pages with a specification table, service history, and reviews
- JWT-based authentication (register/login)
- Client-side cart persisted to `localStorage`
- Checkout via Stripe (test/sandbox mode) using Stripe Elements
- Server-side order pricing and payment verification: the client only sends product ids and quantities; totals come from the database, orders become `paid` only after the server confirms the PaymentIntent with Stripe (client confirm call or signed webhook), and stock is decremented atomically with automatic refund if an item sells out mid-checkout
- **Escrow-style payouts with Stripe Connect:** the buyer pays the platform; each seller's part of the order is tracked separately (a cart can span several sellers) and its money is held until the buyer confirms delivery. Only then is it transferred to the seller's Stripe Express account, minus the platform fee (`PLATFORM_FEE_BPS`, default 8%). Sellers onboard through Stripe's hosted flow; ReBiomed never sees their bank details. If a seller has not finished onboarding, the payout waits and is released automatically when they do (`account.updated` webhook or the refresh endpoint)
- **Fulfillment and disputes:** sellers see the buyer's contact to arrange freight and mark their part shipped (carrier, tracking); they can cancel before shipping, which refunds that part and restocks it. Buyers confirm delivery or report a problem, which freezes the payment until an admin refunds the buyer or rules for the seller (an unshipped order then simply continues; nothing is paid out for equipment never shipped). Every transition is a single conditional update, and every refund and transfer carries an idempotency key, so double clicks and webhook retries can't move money twice
- **Offers:** buyers can offer less than the listed price; the seller accepts, declines, or counters once, and the buyer can accept the counter. Unanswered offers lapse after 7 days; an agreed price can be checked out for 72 hours, by that buyer only, for one unit. The price is taken from the offer on the server, never from the cart, and the offer is marked used when the order is paid, so it can't be redeemed twice (a second order paying with it at the same time is refunded). One open offer per buyer and listing is enforced by a unique index, so racing requests can't open two
- Order history with per-seller status for buyers, a sales page for sellers
- Animated UI (page transitions, hover effects, cart badge) built with `framer-motion`

## Tech stack

- **Frontend:** React, React Router, Redux, Bootstrap, Framer Motion, Stripe.js
- **Backend:** Node.js, **TypeScript**, Express, MongoDB/Mongoose, JWT, bcrypt, Multer
- **Payments:** Stripe (test mode)

## Setup

### 1. Install dependencies

```bash
npm install
cd client && npm install && cd ..
```

### 2. Configure environment variables

Copy the placeholders in `.env` (backend, project root) and `client/.env` (frontend) and fill in real values:

- `MONGO_URI` — your MongoDB connection string (defaults to a local instance)
- `JWT_SECRET` — any long random string
- `STRIPE_SECRET_KEY` — from your [Stripe test-mode dashboard](https://dashboard.stripe.com/test/apikeys)
- `STRIPE_WEBHOOK_SECRET` — optional; the `whsec_...` secret printed by `stripe listen --forward-to localhost:5000/api/payment/webhook`. Without it checkout still works (the client asks the server to verify the payment with Stripe); the webhook endpoint just returns 503
- `STRIPE_CONNECT_WEBHOOK_SECRET` — optional; signing secret of a **Connect** webhook endpoint pointed at the same URL (for `account.updated`). Without it, sellers' payout status is still refreshed when they return from Stripe onboarding
- `PLATFORM_FEE_BPS` — optional; platform commission in basis points (default `800` = 8%)
- `CLIENT_URL` — where Stripe sends sellers back after onboarding (default `http://localhost:3000`)
- `client/.env`: `REACT_APP_STRIPE_PUBLISHABLE_KEY` — the matching publishable test key

To test payouts you also need [Connect enabled](https://dashboard.stripe.com/test/connect/accounts/overview) on the Stripe test account.

### 3. Seed sample product data

```bash
npm run seed
```

Inserts 7 medical-equipment categories, 4 organizations and 12 listings with real photos from Unsplash. All organizations, manufacturers and models in the seed data are fictional.

### 4. Run

```bash
# terminal 1 — backend (port 5000), runs server.ts directly via tsx
npm run dev

# terminal 2 — frontend (port 3000)
cd client && npm start
```

To run the compiled production build instead: `npm run build` (emits to `dist/`) then `npm start`.

### 5. Try the checkout flow

Register/log in, add some equipment to the cart, and pay with the Stripe test card. To sell, create an organization under **My Organization** first.

```
4242 4242 4242 4242 — any future expiry date — any CVC
```

### 6. Review sellers as an admin

Admin rights can't be granted through the API. Register an account, then:

```bash
npm run make-admin -- you@example.com
```

Log in again and open **Admin** in the navbar to see organizations awaiting verification. `--revoke` removes admin rights. Verification documents are saved to `private-uploads/` (override with `PRIVATE_UPLOAD_DIR`).

## Project structure

```
├── app.ts            Express app (routes, middleware) — no listen()
├── server.ts         Entry point: imports app, calls app.listen()
├── models/           Mongoose schemas + TS interfaces (User, Organization, Product, Category, Review, Order, Offer)
├── routes/           Express routes (auth, organizations, admin, payouts, sales, offers, products, categories, reviews, payment, webhook, orders)
├── services/         Checkout, offers, fulfillment/escrow payouts, seller verification, and the Stripe client + ops layer
├── config/           Env-backed keys and medical domain constants (provinces, device classes, conditions, document kinds)
├── middleware/       JWT auth and admin middleware
├── types/            Shared TS type declarations (Express Request augmentation)
├── seed/             Sample data seeding and make-admin scripts
├── test/             Mocha/Chai integration tests
├── client/           React frontend (Redux, Stripe Elements, framer-motion)
```
