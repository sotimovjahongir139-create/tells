require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const env = {
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),

  amocrmDomain: process.env.AMOCRM_DOMAIN || '',
  amocrmAccessToken: process.env.AMOCRM_ACCESS_TOKEN || '',

  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',

  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  backendUrl: process.env.BACKEND_URL || 'http://localhost:4000',
  port: parseInt(process.env.PORT || '4000', 10),

  timezone: process.env.TIMEZONE || 'Asia/Tashkent',
  syncIntervalMinutes: parseInt(process.env.SYNC_INTERVAL_MINUTES || '5', 10),

  asadbekAmocrmUserId: process.env.ASADBEK_AMOCRM_USER_ID || '',
  asadbekName: process.env.ASADBEK_NAME || 'Asadbek',
};

module.exports = env;
