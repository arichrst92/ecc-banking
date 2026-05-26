// PM2 process manager config untuk production deployment.
//
// Usage di VPS:
//   pm2 start ecosystem.config.cjs --env production
//   pm2 save && pm2 startup
//
// Reload zero-downtime setelah git pull + build:
//   pm2 reload ecc-finance

module.exports = {
  apps: [
    {
      name: "ecc-finance",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      cwd: "/var/www/ecc-finance",
      instances: 1, // single instance untuk single tenant. Naikkan kalau load tinggi.
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 4000,
      max_memory_restart: "800M",
      kill_timeout: 5000,
      wait_ready: false,

      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },

      // Output logs
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      out_file: "/var/log/ecc-finance/out.log",
      error_file: "/var/log/ecc-finance/error.log",
      merge_logs: true,
      log_type: "json",

      // Env vars di-load dari .env.production di project root (via Next.js automatic).
      // Jangan taruh secret di sini.
    },
  ],
};
