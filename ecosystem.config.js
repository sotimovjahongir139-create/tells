module.exports = {
  apps: [
    {
      name: 'calls',
      script: 'node_modules/.bin/next',
      args: 'start',
      cwd: '/root/calls',
      env: {
        NODE_ENV: 'production',
        PORT: 5002,
        DATABASE_URL: 'postgresql://postgres.lqdcrnxrqzccismdrwwb:arkon08_trello%23jg%249@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres',
        AMOCRM_DOMAIN: 'numbersarkon.amocrm.ru',
        AMOCRM_TOKEN: 'REPLACE_WITH_YOUR_TOKEN',
        TARGET_MANAGERS: 'Asadbek',
        SYNC_SECRET: 'arkon_sync_secret_2024_x7k9',
      },
    },
  ],
};
