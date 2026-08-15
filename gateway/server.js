'use strict';
require('dotenv').config();

const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

const CALLS_TARGET = process.env.CALLS_TARGET || 'http://localhost:5002';
const AI_SALES_TARGET = process.env.AI_SALES_TARGET || 'http://localhost:4000';
const AI_SALES_FRONTEND_DIST = process.env.AI_SALES_FRONTEND_DIST
  || path.join(__dirname, '..', 'ai-sales-call-analyzer', 'frontend', 'dist');

// Selection page.
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// CALLS' own frontend calls fetch('/api/...') with root-relative paths — those
// requests never carry a /calls prefix regardless of which page issued them, so
// they're proxied straight through, unmodified, to the existing CALLS app.
app.use(
  '/api',
  createProxyMiddleware({ target: CALLS_TARGET, changeOrigin: true })
);

// /calls -> /calls/ so CALLS' relative asset hrefs (style.css, app.js) resolve
// under the /calls/ path instead of root. Express's default (non-strict)
// routing treats app.get('/calls', ...) as matching '/calls/' too, so this
// needs a manual req.path check rather than a route pattern.
app.use((req, res, next) => {
  if (req.path === '/calls') return res.redirect(302, '/calls/');
  next();
});

// Strip the /calls prefix before forwarding — CALLS itself is untouched and
// still only ever sees the paths it already expects (/, /style.css, /app.js...).
app.use(
  '/calls',
  createProxyMiddleware({
    target: CALLS_TARGET,
    changeOrigin: true,
    pathRewrite: { '^/calls': '' },
  })
);

// AI Sales backend API, reachable under /ai-sales/api/* — prefix stripped so
// the AI Sales backend itself needs no changes.
app.use(
  '/ai-sales/api',
  createProxyMiddleware({
    target: AI_SALES_TARGET,
    changeOrigin: true,
    pathRewrite: { '^/ai-sales/api': '/api' },
  })
);

// AI Sales frontend production build — built with base: '/ai-sales/', so its
// own asset references are already absolute under that path.
app.use('/ai-sales', express.static(AI_SALES_FRONTEND_DIST));
app.get('/ai-sales/*', (_req, res) => {
  res.sendFile(path.join(AI_SALES_FRONTEND_DIST, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Gateway ${PORT}-portda ishga tushdi.`);
  console.log(`  /calls    -> ${CALLS_TARGET}`);
  console.log(`  /ai-sales -> ${AI_SALES_TARGET} (+ static build)`);
});
