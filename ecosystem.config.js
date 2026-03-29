module.exports = {
  apps: [
    {
      name: "binance-p2p-api",
      script: "index.js",
      cwd: "/opt/binance-p2p-api",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "400M",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "/var/log/binance-p2p-api/error.log",
      out_file: "/var/log/binance-p2p-api/out.log",
      merge_logs: true,
    },
  ],
};
