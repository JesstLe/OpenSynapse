module.exports = {
  apps: [{
    name: 'opensynapse',
    script: 'server.ts',
    interpreter: 'tsx',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    // 日志配置
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    // 合并日志
    merge_logs: true,
    // 自动重启配置
    min_uptime: '10s',
    max_restarts: 5,
    // 优雅关闭
    kill_timeout: 5000,
    listen_timeout: 10000,
    // 集群模式 (可选，如果有多个 CPU 核心)
    // instances: 'max',
    // exec_mode: 'cluster'
  }]
};