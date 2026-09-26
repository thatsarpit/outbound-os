module.exports = {
  apps: [
    {
      name: 'outbound-os-mcp',
      script: 'src/server.js',
      cwd: __dirname,
      node_args: '--experimental-vm-modules',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '200M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
