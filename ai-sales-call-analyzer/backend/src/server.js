const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const env = require('./config/env');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { startScheduler } = require('./jobs/scheduler');

const authRoutes = require('./routes/auth.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const callsRoutes = require('./routes/calls.routes');
const syncRoutes = require('./routes/sync.routes');
const healthRoutes = require('./routes/health.routes');

const app = express();

app.use(helmet());
app.use(cors({ origin: env.frontendUrl }));
app.use(express.json({ limit: '1mb' }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Juda ko\'p urinish. Birozdan so\'ng qayta urinib ko\'ring.' },
});

app.use('/api/auth/login', loginLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/calls', callsRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/health', healthRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`AI Sales Call Analyzer backend ${env.port}-portda ishga tushdi.`);
  startScheduler();
});
