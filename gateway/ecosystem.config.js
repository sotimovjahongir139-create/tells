module.exports = {
  apps: [
    {
      name: 'gateway',
      script: 'server.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
        CALLS_TARGET: 'http://localhost:5002',
        AI_SALES_TARGET: 'http://localhost:4000',
      },
    },
  ],
};
