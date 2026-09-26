// PM2 app name respects INSTANCE_NAME so two instances can run side-by-side
// in non-Docker dev: INSTANCE_NAME=team pm2 start ecosystem.config.cjs
const instanceName = process.env.INSTANCE_NAME;
const appName = instanceName ? `outbound-os-${instanceName}` : 'outbound-os';

module.exports = {
  apps: [
    {
      name: appName,
      script: './src/index.js',
      instances: 1,
      exec_mode: 'fork', // MUST be fork — SQLite can't handle cluster mode
      autorestart: true,
      watch: false,
      max_memory_restart: '1500M',

      // Auto-restart daily at 05:00 server time to keep memory fresh
      cron_restart: '0 5 * * *',

      // Logs
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Production environment
      env: {
        NODE_ENV: 'production',
      },

      // Restart backoff on crash
      exp_backoff_restart_delay: 1000,

      // Give graceful shutdown 8s before force-kill (SIGTERM → wait → SIGKILL)
      kill_timeout: 8000,
    },
  ],
};

// To enable log rotation on VM:
//   pm2 install pm2-logrotate
//   pm2 set pm2-logrotate:max_size 50M
//   pm2 set pm2-logrotate:retain 30
