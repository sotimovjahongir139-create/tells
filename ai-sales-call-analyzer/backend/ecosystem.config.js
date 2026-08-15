module.exports = {
  apps: [
    {
      name: 'ai-sales-backend',
      script: 'src/server.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
