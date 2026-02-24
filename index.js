



import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import Adminrouter from './Routes/AdminRoutes.js';
import Userrouter from './Routes/UserRoutes.js';
import databaseConnection from './utils/db.js';
import cookieParser from 'cookie-parser';
import nodeCron from 'node-cron';
import './jobs/BookingClean.js';

dotenv.config();
databaseConnection();

const app = express();
const PORT = 3000;

// ============================================
// CORS
// ============================================
app.use(cors({
    origin: function(origin, callback) {
        callback(null, true);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true
}));

// ============================================
// MIDDLEWARE
// ============================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

app.use((req, res, next) => {
  res.removeHeader("Cross-Origin-Opener-Policy");
  res.removeHeader("Cross-Origin-Embedder-Policy");
  res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
  next();
});

// Logging middleware
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// ============================================
// HEALTH & STATUS ENDPOINTS
// ============================================
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: Date.now(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    afsMode: process.env.AFS_TEST_MODE === 'true' ? 'TEST' : 'PRODUCTION',
    paymentMethod: 'Status API (No Webhooks in Test Mode)'
  });
});

app.get('/', (req, res) => {
  res.status(200).json({
    message: 'alraqy API is running',
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  });
});

// ============================================
// ROUTES
// ============================================
app.use('/api/admin', Adminrouter);
app.use('/api/user', Userrouter);

// ============================================
// ERROR HANDLERS
// ============================================
// 404 handler
app.use((req, res) => {
  console.log('❌ 404 Not Found:', req.method, req.path);
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.path
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('💥 Server Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
    console.log('🚀 ═══════════════════════════════════════');
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`🚀 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🚀 AFS Mode: ${process.env.AFS_TEST_MODE === 'true' ? 'TEST' : 'PRODUCTION'}`);
    console.log(`🚀 Payment Method: Status API (No Webhooks)`);
    console.log('🚀 ═══════════════════════════════════════');
});

process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('👋 SIGINT received, shutting down gracefully...');
  process.exit(0);
});