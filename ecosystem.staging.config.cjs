module.exports = {
  apps: [
    {
      name: 'prismastore-staging',
      script: 'server/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      time: true,
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PRISMASTORE_DEV_WHATSAPP_ONLY: 'true',
        PRISMASTORE_DEV_WHATSAPP_PHONE: process.env.PRISMASTORE_DEV_WHATSAPP_PHONE || '',
      },
    },
  ],
};
