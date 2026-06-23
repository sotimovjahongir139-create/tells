module.exports = {
  apps: [
    {
      name: 'calls',
      script: 'server.js',
      cwd: '/var/www/calls/backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 5002,
        DATABASE_URL: 'postgresql://postgres:arkon08_trello%23jg%249@db.lqdcrnxrqzccismdrwwb.supabase.co:5432/postgres',
        AMOCRM_DOMAIN: 'numbersarkon.amocrm.ru',
        AMOCRM_TOKEN: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6ImRlZjFlYzNlNDk4NWI5MDJhNDAzMjRkYzc0Zjg4YjhhZjBmYjhhOWM4MzQwNDZjNjUwOWQ3ZTVkNTMyYWJjNjdkMjkxYjM5OGIzMDJkNDU0In0.eyJhdWQiOiI2N2YyNzFkMi02M2MyLTQ3YWMtOWRlNS0zNzQzMGQxZjU5MWUiLCJqdGkiOiJkZWYxZWMzZTQ5ODViOTAyYTQwMzI0ZGM3NGY4OGI4YWYwZmI4YTljODM0MDQ2YzY1MDlkN2U1ZDUzMmFiYzY3ZDI5MWIzOThiMzAyZDQ1NCIsImlhdCI6MTc3NjY3NzA0OCwibmJmIjoxNzc2Njc3MDQ4LCJleHAiOjE5MzQ0MDk2MDAsInN1YiI6IjEwODkxNjk4IiwiZ3JhbnRfdHlwZSI6IiIsImFjY291bnRfaWQiOjMxNjc3Njc4LCJiYXNlX2RvbWFpbiI6ImFtb2NybS5ydSIsInZlcnNpb24iOjIsInNjb3BlcyI6WyJwdXNoX25vdGlmaWNhdGlvbnMiLCJmaWxlcyIsImNybSIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiXSwiaGFzaF91dWlkIjoiOTFkMzg1ODYtYjg2Ny00ODRhLWI1MGEtYzg0MTkzYTU4ZmZlIiwiYXBpX2RvbWFpbiI6ImFwaS1iLmFtb2NybS5ydSJ9.IQc6Vtl3kXI5yzT5zz1U10upheu7VHMU1zH_iTaspbfOHPEHGbQAjkX3ARXnF9IRb_udoemxyBslFSlPAgcNqZf06xDHWiIpd7z36gu4TmVJSxVcVvKT-mGrjnpMkehXE1b7yV_hjOvr_TDkBsF-Sbv8DO95zD2ywO-jtFl4e12GBgzZ-xkKaGOd_PX6on5FKbIdeMFiXy-WaweuMYWPl5zSZYnUr7o_zQMJVqRqE3Fox-YFNI9Vsk74rBge3wLo6N1bir-QQxnGVA4OR116_4t8V0Qa8_iVEnlDlc17wzEBo7JrUgkXF8qh3lHTknmH-DSjwmJ_teaLh9nzckxgcw',
      },
    },
  ],
};
