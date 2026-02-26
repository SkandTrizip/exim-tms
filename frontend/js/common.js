// ==========================================
// Authentication & Security
// ==========================================
if (localStorage.getItem('isLoggedIn') !== 'true' && !window.location.pathname.includes('/login')) {
    window.location.href = '/login';
}

function handleLogout() {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    window.location.href = '/login';
}

document.addEventListener('DOMContentLoaded', function () {
    const user = localStorage.getItem('user');
    if (user) {
        const userNameDisplay = document.getElementById('userNameDisplay');
        const userAvatar = document.querySelector('.user-avatar');
        if (userNameDisplay) userNameDisplay.textContent = user;
        if (userAvatar) userAvatar.textContent = user.substring(0, 2).toUpperCase();
    }
});

// ==========================================
// Central Configuration & Constants
// ==========================================


/**
 * Generic helper to populate a select element from a list
 */
function populateDropdown(selectElement, options) {
    if (!selectElement) return;

    // Keep the "Select ..." placeholder if it exists
    const placeholder = selectElement.querySelector('option[value=""]');
    selectElement.innerHTML = '';

    if (placeholder) {
        selectElement.appendChild(placeholder);
    }

    options.forEach(opt => {
        const option = document.createElement('option');
        // Use the full string as the value to ensure consistency with backend/summary displays
        option.value = opt;
        option.textContent = opt;
        selectElement.appendChild(option);
    });
}

/**
 * Navigate to a specific URL
 */
function navigateTo(url) {
    window.location.href = url;
}

/**
 * Common back button logic
 */
function goBack() {
    window.history.back();
}

/**
 * Show a custom modal Notification
 * @param {string} title - The title of the modal
 * @param {string} message - The message content
 * @param {string} type - 'success', 'error', 'info', 'warning'
 * @param {function} onConfirm - Optional callback for the primary button
 */
function showModal(title, message, type = 'info', onConfirm = null) {
    // Check if modal container exists, if not create it
    let overlay = document.querySelector('.modal-overlay');

    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-box">
                <div class="modal-header">
                    <div class="modal-title">
                        <div class="modal-icon"></div>
                        <span id="modalTitle"></span>
                    </div>
                    <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body" id="modalMessage"></div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeModal()">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    // Update content
    const iconMap = {
        'success': '<i class="fas fa-check"></i>',
        'error': '<i class="fas fa-exclamation-triangle"></i>',
        'warning': '<i class="fas fa-exclamation-circle"></i>',
        'info': '<i class="fas fa-info"></i>'
    };

    const iconEl = overlay.querySelector('.modal-icon');
    iconEl.className = `modal-icon ${type}`;
    iconEl.innerHTML = iconMap[type] || iconMap['info'];

    const titleEl = document.getElementById('modalTitle');
    if (titleEl) titleEl.textContent = title;

    const msgEl = document.getElementById('modalMessage');
    if (msgEl) msgEl.innerHTML = message; // Use innerHTML to support comparison grids, etc.

    // Handle Confirm Button
    const footer = overlay.querySelector('.modal-footer');
    // Remove any existing confirm button
    const existingConfirm = document.getElementById('modalConfirmBtn');
    if (existingConfirm) existingConfirm.remove();

    if (onConfirm) {
        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'btn btn-primary';
        confirmBtn.id = 'modalConfirmBtn';
        confirmBtn.textContent = 'OK';
        confirmBtn.onclick = () => {
            onConfirm();
            closeModal();
        };
        footer.appendChild(confirmBtn);
    }

    // Show modal
    setTimeout(() => {
        overlay.classList.add('active');
    }, 10);
}

function closeModal() {
    const overlay = document.querySelector('.modal-overlay');
    if (overlay) {
        overlay.classList.remove('active');
        // Wait for transition to finish before hiding/removing if we wanted to remove, 
        // but keeping it in DOM is fine for performance if reused.
        setTimeout(() => {
            // overlay.remove(); // Optional: remove if you want fresh state every time
        }, 300);
    }
}
