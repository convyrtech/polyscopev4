// PM2 Ecosystem Configuration
// Run with: pm2 start ecosystem.config.js

module.exports = {
    apps: [
        {
            name: 'whalescope-api',
            cwd: './apps/api',
            script: 'dist/index.js',
            instances: 1,  // Single instance for WebSocket state
            exec_mode: 'fork',
            watch: false,
            
            // Environment
            env: {
                NODE_ENV: 'production',
                PORT: 3001,
            },
            
            // Memory Management
            max_memory_restart: '500M',  // Restart if exceeds 500MB
            
            // Logging
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            error_file: './logs/api-error.log',
            out_file: './logs/api-out.log',
            merge_logs: true,
            
            // Restart Strategy
            autorestart: true,
            max_restarts: 10,
            restart_delay: 5000,  // 5 seconds between restarts
            
            // Graceful shutdown
            kill_timeout: 10000,  // 10 seconds to gracefully shutdown
            listen_timeout: 8000,
            
            // Health monitoring (requires PM2 Plus or custom implementation)
            // exp_backoff_restart_delay: 100,
        },
        {
            name: 'whalescope-web',
            cwd: './apps/web',
            script: 'node_modules/.bin/next',
            args: 'start',
            instances: 1,
            exec_mode: 'fork',
            watch: false,
            
            env: {
                NODE_ENV: 'production',
                PORT: 3000,
            },
            
            max_memory_restart: '400M',
            
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            error_file: './logs/web-error.log',
            out_file: './logs/web-out.log',
            merge_logs: true,
            
            autorestart: true,
            max_restarts: 10,
            restart_delay: 5000,
        },
    ],
};
