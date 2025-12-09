// API Base URL
const API_URL = window.location.origin;

// Get device ID from URL
const urlParams = new URLSearchParams(window.location.search);
const currentDeviceId = urlParams.get('device');

// Load forms on page load
document.addEventListener('DOMContentLoaded', () => {
    if (!currentDeviceId) {
        window.location.href = 'index.html';
        return;
    }
    
    loadForms();
    
    // Auto-refresh every 2 seconds
    setInterval(loadForms, 2000);
});

// Load form submissions
async function loadForms() {
    try {
        const response = await fetch(`${API_URL}/api/device/${currentDeviceId}/forms`);
        const forms = await response.json();
        
        const formList = document.getElementById('formList');
        
        if (forms.length === 0) {
            formList.innerHTML = '<p class="text-center" style="color: var(--text-secondary);">No form submissions yet</p>';
            return;
        }
        
        formList.innerHTML = forms.map(form => `
            <div class="form-card">
                <div class="form-data">${form.custom_data}</div>
                <div class="form-time">Submitted: ${new Date(form.submitted_at).toLocaleString()}</div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading forms:', error);
    }
}

// Go back to device control
function goBack() {
    window.location.href = `device-control.html?device=${currentDeviceId}`;
}