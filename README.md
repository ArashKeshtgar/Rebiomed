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
- Order history for logged-in users
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
- `client/.env`: `REACT_APP_STRIPE_PUBLISHABLE_KEY` — the matching publishable test key

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
├── models/           Mongoose schemas + TS interfaces (User, Organization, Product, Category, Review, Order)
├── routes/           Express routes (auth, organizations, admin, products, categories, reviews, payment, webhook, orders)
├── services/         Checkout (server-side pricing, order finalization), seller verification, and the Stripe client
├── config/           Env-backed keys and medical domain constants (provinces, device classes, conditions, document kinds)
├── middleware/       JWT auth and admin middleware
├── types/            Shared TS type declarations (Express Request augmentation)
├── seed/             Sample data seeding and make-admin scripts
├── test/             Mocha/Chai integration tests
├── client/           React frontend (Redux, Stripe Elements, framer-motion)
```
