import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import path from 'path';
import fs from 'fs';
import db from './database.js';

// Routers
import adminRouter from './routes/admin.js';
import pdfRouter from './routes/pdf.js';

// Auth middleware
import { requireAdmin } from './middleware/auth.js';

const app = express();
const PORT = 3000;

// Initialize Database Table Structure
db.initDb();

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Express Session Management
const sessionSecret = process.env.SESSION_SECRET || 'vision_victory_key_secure_2026';
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  name: 'vision_session_id',
  cookie: {
    secure: false, // Set to false so it works correctly under current AI Studio development environment sandbox
    httpOnly: true, // Strictly HTTP-only cookie, preventing client-side script access (no JWT, secure session state)
    maxAge: 4 * 60 * 60 * 1000, // 4 hours session lifetime
    sameSite: 'lax'
  }
}));

// Sandbox Token Authentication Fallback Middleware
app.use((req, res, next) => {
  const authHeader = req.headers['authorization'] || '';
  const adminPassword = process.env.ADMIN_PASSWORD || 'VisionToVictory2026';
  const validToken = Buffer.from(adminPassword).toString('base64');

  let hasToken = false;
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token === validToken) {
      hasToken = true;
    }
  } else if (req.query && req.query.token === validToken) {
    hasToken = true;
  }

  if (hasToken && req.session) {
    req.session.isAdmin = true;
  }
  next();
});

// Serve static assets out of the /public folder
app.use(express.static(path.join(process.cwd(), 'public')));

// Set up public upload layout folder if not exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

/**
 * 1. VIEW ROUTING FOR FRONTEND PAGES
 */

// Student Homepage Routing
app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'views', 'index.html'));
});

// Admin Login View Routing
app.get('/admin-login', (req, res) => {
  // If already logged in, redirect directly to dashboard
  if (req.session && req.session.isAdmin) {
    return res.redirect('/admin-dashboard');
  }
  res.sendFile(path.join(process.cwd(), 'views', 'admin-login.html'));
});

// Admin Dashboard View Routing (Protected)
app.get('/admin-dashboard', (req, res) => {
  if (!req.session || !req.session.isAdmin) {
    return res.redirect('/admin-login');
  }
  res.sendFile(path.join(process.cwd(), 'views', 'admin-dashboard.html'));
});

// Customer PDF.js Viewer Routing
app.get('/viewer', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'views', 'viewer.html'));
});

/**
 * 2. API MOUNTING
 */
app.use('/api/admin', adminRouter);
app.use('/api/pdf', pdfRouter);

// Fallback error-handling middleware
app.use((err, req, res, next) => {
  console.error('Express Error Handler:', err);
  res.status(500).json({ error: 'A secure gateway application error occurred.' });
});

// Start Express server on specified port and address
app.listen(PORT, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(`🚀 VisionToVictory started successfully!`);
  console.log(`💻 Local dev server running on: http://localhost:${PORT}`);
  console.log(`===============================================`);
});
