import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const heroStyle = {
  minHeight: 'calc(100vh - 56px)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  background: 'linear-gradient(135deg, #0f172a, #0ea5e9)',
  color: '#fff',
  padding: '2rem 1rem'
};

const itemColors = ['#f59e0b', '#38bdf8', '#f43f5e'];

// A simple, looping animation: three "product" squares drop one by one into
// a shopping bag — a lightweight visual metaphor for shopping online.
const ShoppingAnimation = () => (
  <svg width="220" height="200" viewBox="0 0 220 200">
    {/* bag */}
    <motion.path
      d="M55 80 L165 80 L155 180 L65 180 Z"
      fill="#1e293b"
      stroke="#38bdf8"
      strokeWidth="3"
      initial={{ y: 0 }}
      animate={{ y: [0, -4, 0] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
    />
    <motion.path
      d="M80 80 Q80 50 110 50 Q140 50 140 80"
      fill="none"
      stroke="#38bdf8"
      strokeWidth="4"
      initial={{ y: 0 }}
      animate={{ y: [0, -4, 0] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
    />

    {itemColors.map((color, i) => (
      <motion.rect
        key={i}
        x={95 + i * 4}
        width="20"
        height="20"
        rx="4"
        fill={color}
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: [-60, 95], opacity: [0, 1, 1, 0] }}
        transition={{
          duration: 1.8,
          repeat: Infinity,
          delay: i * 0.6,
          ease: 'easeIn'
        }}
      />
    ))}
  </svg>
);

const Home = () => (
  <div style={heroStyle}>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1 }}
    >
      <ShoppingAnimation />
    </motion.div>

    <motion.h1
      style={{ fontSize: '3rem', fontWeight: 'bold', margin: '1rem 0 1.5rem' }}
      initial={{ y: -30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 60, delay: 0.2 }}
    >
      <span style={{ color: '#f59e0b' }}>Volt</span>ra
    </motion.h1>
    <motion.p
      style={{ maxWidth: 520, marginBottom: '2rem', fontSize: '1.1rem' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.5, duration: 0.8 }}
    >
      Canada's marketplace for pre-owned medical equipment. Clinics, hospitals and
      dealers list patient monitors, dental units, lab and rehab equipment, with the
      Health Canada device class and service history on every listing.
      Payments are handled securely through Stripe.
    </motion.p>
    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
      <Link to="/products" className="btn btn-light btn-lg px-4 shadow">
        Browse Equipment
      </Link>
    </motion.div>
  </div>
);

export default Home;
