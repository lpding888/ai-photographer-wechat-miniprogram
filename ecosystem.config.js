module.exports = {
  apps: [{
    name: 'ai-photographer-api',
    script: './apps/server-api/dist/index.js',
    cwd: '/root/2.0_20251025012416',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    env: {
      NODE_ENV: 'production',
      PORT: 8888
    },
    error_file: './logs/api-error.log',
    out_file: './logs/api-out.log',
    log_file: './logs/api-combined.log',
    time: true
  }]
};