// ==========================================
// Upload & Track Page - JavaScript
// ==========================================

let currentEnquiryData = null;
let currentPricingData = null;
let uploadedFiles = {};

// ==========================================
// Initialization
// ==========================================
document.addEventListener('DOMContentLoaded', function () {
    console.log('📦 Upload & Track page loaded');
    loadEnquiryData();
    // After everything is populated, try to load any saved checklist state
    setTimeout(loadChecklistState, 500);
});

/**
 * Load enquiry and pricing data from URL parameters or localStorage
 */
function loadEnquiryData() {
    // Try to get enquiry ID from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const enquiryId = urlParams.get('enquiry_id');

    if (enquiryId) {
        fetchEnquiryById(enquiryId);
    } else {
        // Try to load from localStorage as fallback
        const storedEnquiry = localStorage.getItem('currentEnquiry');
        const storedPricing = localStorage.getItem('currentPricing');

        if (storedEnquiry) {
            currentEnquiryData = JSON.parse(storedEnquiry);
            populateShipmentInfo();
        }

        if (storedPricing) {
            currentPricingData = JSON.parse(storedPricing);
            populateInvoiceInfo();
        }

        if (!storedEnquiry && !storedPricing) {
            console.warn('⚠️ No enquiry data found. Please complete previous stages first.');
        }
    }
}

/**
 * Fetch enquiry data from backend by ID
 */
async function fetchEnquiryById(enquiryId) {
    try {
        const response = await fetch(`${CONFIG.API_URL}/api/enquiry/${enquiryId}`);
        if (response.ok) {
            currentEnquiryData = await response.json();
            populateShipmentInfo();

            // Fetch associated pricing data
            await fetchPricingData(enquiryId);

            // Fetch associated documents
            await fetchUploadedDocuments(enquiryId);

            // Fetch associated payments
            await fetchAdditionalPayments(enquiryId);
        } else {
            console.warn('Enquiry not found in database, trying localStorage...');
            // Fall back to localStorage
            const storedEnquiry = localStorage.getItem('currentEnquiry');
            const storedPricing = localStorage.getItem('currentPricing');

            if (storedEnquiry) {
                currentEnquiryData = JSON.parse(storedEnquiry);
                populateShipmentInfo();
            }

            if (storedPricing) {
                currentPricingData = JSON.parse(storedPricing);
                populateInvoiceInfo();
            }

            if (!storedEnquiry && !storedPricing) {
                console.error('Failed to fetch enquiry data and no localStorage data available');
                showModal('Error', 'Could not load enquiry data. Please try again.', 'error');
            }
        }
    } catch (error) {
        console.error('Error fetching enquiry:', error);
        // Try localStorage as fallback
        const storedEnquiry = localStorage.getItem('currentEnquiry');
        const storedPricing = localStorage.getItem('currentPricing');

        if (storedEnquiry) {
            currentEnquiryData = JSON.parse(storedEnquiry);
            populateShipmentInfo();
        }

        if (storedPricing) {
            currentPricingData = JSON.parse(storedPricing);
            populateInvoiceInfo();
        }

        if (!storedEnquiry && !storedPricing) {
            showModal('Response Error', 'Error connecting to server. Please ensure the backend is running.', 'error');
        }
    }
}

/**
 * Fetch pricing data for the enquiry
 */
async function fetchPricingData(enquiryId) {
    try {
        const response = await fetch(`${CONFIG.API_URL}/api/quotes/enquiry/${enquiryId}`);
        if (response.ok) {
            const pricingList = await response.json();
            if (pricingList && pricingList.length > 0) {
                // Find the quote that was actually accepted
                const acceptedQuote = pricingList.find(q => q.status === 'accepted') || pricingList[0];
                currentPricingData = acceptedQuote;
                populateInvoiceInfo();
            }
        } else {
            console.warn('No pricing data found for this enquiry');
        }
    } catch (error) {
        console.error('Error fetching pricing data:', error);
    }
}

/**
 * Fetch and display already uploaded documents
 */
async function fetchUploadedDocuments(enquiryId) {
    try {
        const response = await fetch(`${CONFIG.API_URL}/api/tracking/enquiry/${enquiryId}`);
        if (response.ok) {
            const documents = await response.json();
            console.log('📎 Existing documents found:', documents);

            documents.forEach(doc => {
                if (doc.document_type === 'additionalInvoice') {
                    const listEl = document.getElementById('additionalInvoicesList');
                    if (listEl) {
                        const filename = doc.file_path.split(/[\\\/]/).pop();
                        const fileUrl = `${CONFIG.API_URL}/uploads/${filename}`;
                        const item = document.createElement('div');
                        item.innerHTML = `
                            <div style="display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: #f8fafc; border-radius: 4px; border: 1px solid var(--border-light);">
                                <i class="fas fa-file-invoice" style="color: var(--primary);"></i>
                                <span style="flex: 1; font-weight: 500; font-size: 11px;">${doc.file_name}</span>
                                <a href="${fileUrl}" target="_blank" style="color: var(--primary); font-size: 11px; font-weight: 600;">View</a>
                            </div>
                        `;
                        listEl.appendChild(item);
                    }
                    return;
                }

                // Determine which display ID based on document_type
                let displayId = `${doc.document_type}FileName`;

                // Map of document types to their display IDs if they don't follow the pattern
                const specialMappings = {
                    'bol': 'blFileName',
                    'shippingInvoice': 'shippingInvoiceFileName',
                    'clientConfirm': 'clientConfirmFileName',
                    'booking': 'bookingFileName',
                    'draftSi': 'draftSiFileName',
                    'si': 'siFileName',
                    'shippingBill': 'shippingBillFileName',
                    'originCert': 'originCertFileName',
                    'customsDeclaration': 'customsDeclarationFileName',
                    'insuranceCert': 'insuranceCertFileName'
                };

                if (specialMappings[doc.document_type]) {
                    displayId = specialMappings[doc.document_type];
                }

                const displayElement = document.getElementById(displayId);
                if (displayElement) {
                    const filename = doc.file_path.split(/[\\\/]/).pop();
                    const fileUrl = `${CONFIG.API_URL}/uploads/${filename}`;
                    displayElement.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 8px; padding: 8px; background: white; border-radius: 4px; border: 1px solid var(--border-light); margin-top: 4px;">
                            <i class="fas fa-check-circle" style="color: var(--success);"></i>
                            <span style="flex: 1; font-weight: 500; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${doc.file_name}">${doc.file_name}</span>
                            <a href="${fileUrl}" target="_blank" style="color: var(--primary); text-decoration: none; font-size: 11px; font-weight: 600; display: flex; align-items: center; gap: 4px; padding: 2px 4px;">
                                <i class="fas fa-eye"></i> View
                            </a>
                        </div>
                    `;
                }
            });
        }
    } catch (error) {
        console.error('Error fetching documents:', error);
    }
}

// ==========================================
// Display Population Functions
// ==========================================

/**
 * Populate General Shipment Information section
 */
function populateShipmentInfo() {
    if (!currentEnquiryData) {
        console.warn('⚠️ No enquiry data available');
        return;
    }

    const setTextContent = (id, value) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = (value !== undefined && value !== null && value !== '') ? value : '-';
        }
    };

    setTextContent('display_enquiry_number', currentEnquiryData.enquiry_number);
    setTextContent('display_client_name', currentEnquiryData.client_name);
    setTextContent('display_shipment_type', currentEnquiryData.shipment_type);
    setTextContent('display_origin', currentEnquiryData.origin);
    setTextContent('display_destination', currentEnquiryData.destination);
    setTextContent('display_commodity', currentEnquiryData.commodity);

    // Container information
    if (currentEnquiryData.container_type) {
        const containerInfo = `${currentEnquiryData.container_count || 1}x ${currentEnquiryData.container_type}`;
        setTextContent('display_container_type', containerInfo);
    }

    console.log('✅ Shipment information populated');
    updateInitialStatus();
}

/**
 * Populate Invoice Summary section
 */
function populateInvoiceInfo() {
    if (!currentPricingData) {
        console.warn('⚠️ No pricing data available');
        return;
    }

    const setTextContent = (id, value) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = (value !== undefined && value !== null && value !== '') ? value : '-';
        }
    };

    setTextContent('display_quote_number', currentPricingData.quote_name || currentPricingData.id);
    setTextContent('display_shipping_line', currentPricingData.shipping_line);
    setTextContent('display_incoterm', currentPricingData.incoterm);
    setTextContent('display_currency', currentPricingData.rate_currency || 'USD');
    setTextContent('display_pol', currentPricingData.port_of_loading);
    setTextContent('display_pod', currentPricingData.port_of_discharge);

    // Transit time
    if (currentPricingData.transit_time_days) {
        setTextContent('display_transit_time', `${currentPricingData.transit_time_days} days`);
    }

    // Free days
    if (currentPricingData.destination_free_days) {
        setTextContent('display_free_days', `${currentPricingData.destination_free_days} days`);
    }

    // Financial information
    if (currentPricingData.total_origin_charges_inr) {
        setTextContent('display_origin_charges', `₹${currentPricingData.total_origin_charges_inr.toLocaleString()}`);
    }

    if (currentPricingData.total_destination_charges_usd) {
        setTextContent('display_dest_charges', `$${currentPricingData.total_destination_charges_usd.toLocaleString()}`);
    }

    if (currentPricingData.final_quote_inr) {
        setTextContent('display_final_quote', `₹${currentPricingData.final_quote_inr.toLocaleString()}`);
    }

    console.log('✅ Invoice information populated');
}

/**
 * Update the date in the status checklist when a checkbox is toggled
 * @param {HTMLInputElement} checkbox - The checkbox element
 * @param {string} dateElementId - ID of the date display element
 */
function updateStatusDate(checkbox, dateElementId) {
    const dateElement = document.getElementById(dateElementId);
    if (!dateElement) return;

    if (checkbox.checked) {
        // If it's already checked and has a value, don't override (constant time principle)
        if (dateElement.textContent !== '-' && dateElement.textContent !== '') return;

        const now = new Date();
        const dateString = now.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        dateElement.textContent = dateString;
        dateElement.style.color = 'var(--primary)';
        dateElement.style.fontWeight = '600';
    } else {
        dateElement.textContent = '-';
        dateElement.style.color = 'var(--text-secondary)';
        dateElement.style.fontWeight = 'normal';
    }

    // Save state after update
    saveChecklistState();

    // Check all dependencies
    checkAllDependencies();
}

/**
 * Toggle the SOB date picker input based on checkbox state
 * @param {HTMLInputElement} checkbox - The SOB checkbox element
 */
function toggleSobDatePicker(checkbox) {
    const dateInput = document.getElementById('date_sob');
    if (!dateInput) return;

    if (checkbox.checked) {
        // Remove disabled attribute entirely
        dateInput.removeAttribute('disabled');
        // Force all style properties to enabled state
        dateInput.style.cssText = `
            padding: 5px 8px;
            font-size: 12px;
            border: 2px solid var(--primary);
            border-radius: 6px;
            color: var(--navy-800);
            background: white;
            width: 140px;
            transition: all 0.2s;
            cursor: pointer;
            opacity: 1;
            outline: none;
        `;
        // Default to today's date if not already set
        if (!dateInput.value) {
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            dateInput.value = `${yyyy}-${mm}-${dd}`;
        }
    } else {
        // Restore disabled attribute
        dateInput.setAttribute('disabled', '');
        // Force all style properties to disabled state
        dateInput.style.cssText = `
            padding: 5px 8px;
            font-size: 12px;
            border: 1px solid var(--border-light);
            border-radius: 6px;
            color: var(--navy-800);
            background: #f8fafc;
            width: 140px;
            transition: all 0.2s;
            cursor: not-allowed;
            opacity: 0.5;
        `;
        dateInput.value = '';
    }

    saveChecklistState();
    checkAllDependencies();
}

/**
 * Enable/Disable rows based on milestones (SOB and Payment)
 */
function checkAllDependencies() {
    const sobChecked = document.getElementById('status_sob')?.checked;

    // 1. SOB Dependencies: Unlocks Shipping Invoice
    const sobDependentIds = ['status_shipping_invoice', 'btn_shipping_invoice'];
    sobDependentIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = !sobChecked;
            if (id.startsWith('status_')) el.style.cursor = sobChecked ? 'pointer' : 'not-allowed';
            else if (id.startsWith('btn_')) {
                el.style.opacity = sobChecked ? '1' : '0.6';
                el.style.cursor = sobChecked ? 'pointer' : 'not-allowed';
            }
        }
    });

    const rowShippingInv = document.getElementById('row_shipping_invoice');
    if (rowShippingInv) rowShippingInv.style.opacity = sobChecked ? '1' : '0.8';

    // 2. Payment Dependency: BL Received appears only after Payment to Shipping Line (pay_line)
    const isPaid = window.currentPaymentStatus === true;
    const isBLChecked = document.getElementById('status_bl_received')?.checked;

    const rowBL = document.getElementById('row_bl_received');
    const rowAddPayments = document.getElementById('row_additional_payments');

    if (rowBL) {
        // Show BL row if paid OR if it was already checked in a previous state
        if (isPaid || isBLChecked) {
            rowBL.style.display = 'table-row';
            document.getElementById('status_bl_received').disabled = false;
            document.getElementById('status_bl_received').style.cursor = 'pointer';
            document.getElementById('btn_bl_received').disabled = false;
            document.getElementById('btn_bl_received').style.opacity = '1';
            document.getElementById('btn_bl_received').style.cursor = 'pointer';

            // Show additional payments section once main is paid
            if (rowAddPayments) rowAddPayments.style.display = 'table-row';
        } else {
            rowBL.style.display = 'none';
            if (rowAddPayments) rowAddPayments.style.display = 'none';
        }
    }
}

/**
 * Toggle visibility of detail row if parent row is visible
 */
function toggleDetailRow(checkbox, rowId) {
    const detailRow = document.getElementById(rowId);
    if (!detailRow) return;

    // Only show if checkbox is checked AND parent row is visible (or will be shown)
    if (checkbox.checked) {
        detailRow.style.display = 'table-row';
    } else {
        detailRow.style.display = 'none';
        const inputs = detailRow.querySelectorAll('input');
        inputs.forEach(input => input.value = '');
    }

    saveChecklistState();
}

/**
 * Get the current state of all checkboxes and dates
 */
function getChecklistState() {
    const checklistItems = [
        'booking_confirmed', 'booking_placed', 'booking_finalized',
        'container_picked', 'stuffing_done', 'container_gated',
        'draft_si', 'si_submitted', 'form13', 'shipping_bill', 'sob', 'shipping_invoice', 'bl_received'
    ];

    const state = {};
    checklistItems.forEach(item => {
        const checkbox = document.getElementById(`status_${item}`);
        const dateEl = document.getElementById(`date_${item}`);

        if (checkbox) {
            // SOB uses a date input; read its value differently
            if (item === 'sob') {
                state[item] = {
                    checked: checkbox.checked,
                    date: dateEl ? (dateEl.value || '-') : '-'
                };
            } else {
                state[item] = {
                    checked: checkbox.checked,
                    date: dateEl ? dateEl.textContent : '-'
                };
            }
        }
    });

    // Add metadata fields
    state.si_number = document.getElementById('si_number')?.value || '';
    state.consignee = document.getElementById('bl_consignee')?.value || '';
    state.port_of_origin = document.getElementById('bl_port_origin')?.value || '';
    state.final_destination = document.getElementById('bl_final_dest')?.value || '';
    state.master_number = document.getElementById('bl_master_number')?.value || '';
    state.vessel = document.getElementById('bl_vessel')?.value || '';
    state.voyage = document.getElementById('bl_voyage')?.value || '';
    state.etd = document.getElementById('bl_etd')?.value || '';
    state.eta = document.getElementById('bl_eta')?.value || '';

    return state;
}

/**
 * Save the current state of all checkboxes and dates to localStorage
 */
function saveChecklistState() {
    if (!currentEnquiryData?.id) return;

    const state = getChecklistState();
    localStorage.setItem(`checklist_${currentEnquiryData.id}`, JSON.stringify(state));
    console.log('💾 Checklist state saved for enquiry:', currentEnquiryData.id);
}

/**
 * Load and apply saved checklist state from backend (Source of Truth) or localStorage (Fallback)
 */
async function loadChecklistState() {
    if (!currentEnquiryData?.id) return;

    try {
        // 1. Try fetching from backend first (Source of Truth)
        const response = await fetch(`${CONFIG.API_URL}/api/tracking/status/${currentEnquiryData.id}`);
        if (response.ok) {
            const backendStatus = await response.json();
            if (backendStatus) {
                applyChecklistState(backendStatus, true);
                console.log('🔄 Checklist state restored from backend');
                return;
            }
        }

        // 2. Fallback to localStorage if backend record doesn't exist
        const saved = localStorage.getItem(`checklist_${currentEnquiryData.id}`);
        if (saved) {
            const state = JSON.parse(saved);
            applyChecklistState(state, false);
            console.log('🔄 Checklist state restored from localStorage');
        }

        // Ensure dependencies are applied after loading state
        checkAllDependencies();
    } catch (e) {
        console.error('Error loading checklist state:', e);
    }
}

/**
 * Apply status data to the DOM
 */
function applyChecklistState(state, isBackend = false) {
    const checklistItems = [
        'booking_confirmed', 'booking_placed', 'booking_finalized',
        'container_picked', 'stuffing_done', 'container_gated',
        'draft_si', 'si_submitted', 'form13', 'shipping_bill', 'sob', 'shipping_invoice', 'bl_received'
    ];

    // Check for payment status
    window.currentPaymentStatus = !!state.pay_line;

    checklistItems.forEach(item => {
        const checkbox = document.getElementById(`status_${item}`);
        const dateEl = document.getElementById(`date_${item}`);

        if (!checkbox || item === 'booking_confirmed') return;

        let data = isBackend ? state[item] : state[item]?.checked;
        let dateValue = isBackend ? state[item] : state[item]?.date;

        if (item === 'sob') {
            // SOB uses a date input picker — restore accordingly
            checkbox.checked = !!data;
            if (dateEl) {
                if (checkbox.checked) {
                    // Enable the date picker regardless of whether a date is saved
                    dateEl.disabled = false;
                    dateEl.style.cursor = 'pointer';
                    dateEl.style.opacity = '1';
                    dateEl.style.background = 'white';
                    dateEl.style.borderColor = 'var(--primary)';

                    // Try to restore any previously saved date
                    const sobDate = isBackend ? state['sob'] : state['sob']?.date;
                    if (sobDate && sobDate !== '-') {
                        const dateOnly = typeof sobDate === 'string' && sobDate.includes('T')
                            ? sobDate.split('T')[0]
                            : sobDate;
                        if (dateOnly) dateEl.value = dateOnly;
                    }
                } else {
                    // Disable the date picker and clear value
                    dateEl.disabled = true;
                    dateEl.value = '';
                    dateEl.style.cursor = 'not-allowed';
                    dateEl.style.opacity = '0.5';
                    dateEl.style.background = '#f8fafc';
                    dateEl.style.borderColor = 'var(--border-light)';
                }
            }
        } else if (isBackend) {
            checkbox.checked = !!data;
            if (dateEl && data) {
                const date = new Date(data);
                dateEl.textContent = date.toLocaleDateString('en-GB', {
                    day: '2-digit', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                });
                dateEl.style.color = 'var(--primary)';
                dateEl.style.fontWeight = '600';
            }
        } else {
            checkbox.checked = !!data;
            if (dateEl) {
                dateEl.textContent = dateValue || '-';
                if (data && dateValue !== '-') {
                    dateEl.style.color = 'var(--primary)';
                    dateEl.style.fontWeight = '600';
                }
            }
        }

        // Handle detail row visibility
        if (checkbox.checked) {
            const detailRowId = `details_${item}`;
            const detailRow = document.getElementById(detailRowId);
            if (detailRow) detailRow.style.display = 'table-row';
        }
    });

    // Populate metadata fields
    const metadataMapping = {
        'si_number': 'si_number',
        'consignee': 'bl_consignee',
        'port_of_origin': 'bl_port_origin',
        'final_destination': 'bl_final_dest',
        'master_number': 'bl_master_number',
        'vessel': 'bl_vessel',
        'voyage': 'bl_voyage',
        'etd': 'bl_etd',
        'eta': 'bl_eta'
    };

    Object.entries(metadataMapping).forEach(([backendKey, elementId]) => {
        const el = document.getElementById(elementId);
        if (el && state[backendKey]) {
            let value = state[backendKey];
            // Format dates if necessary
            if ((backendKey === 'etd' || backendKey === 'eta') && value.includes('T')) {
                value = value.split('T')[0];
            }
            el.value = value;
        }
    });
}

// Update populateShipmentInfo to handle initial status date
function updateInitialStatus() {
    if (!currentEnquiryData) return;
    const dateBookingConfirmed = document.getElementById('date_booking_confirmed');
    if (dateBookingConfirmed) {
        // Use created_at if available, otherwise use current date
        const date = currentEnquiryData.created_at ? new Date(currentEnquiryData.created_at) : new Date();
        dateBookingConfirmed.textContent = date.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    }
}

// ==========================================
// File Upload Handling
// ==========================================

/**
 * Handle file selection and display filename
 * @param {HTMLInputElement} input - File input element
 * @param {string} displayId - ID of element to display filename
 */
function handleFileUpload(input, displayId) {
    const file = input.files[0];
    const displayElement = document.getElementById(displayId);

    if (!displayElement) return;

    const fileKey = input.id.replace('Upload', '');

    if (file) {
        // Validate file size (2MB max)
        const maxSize = 2 * 1024 * 1024; // 2MB in bytes
        if (file.size > maxSize) {
            showModal('File Validation', 'File size exceeds 2MB limit. Please choose a smaller file.', 'warning');
            input.value = '';
            displayElement.innerHTML = '';
            return;
        }

        // Validate file type
        const allowedTypes = [
            'application/pdf',
            'image/jpeg',
            'image/jpg',
            'image/png',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ];

        if (!allowedTypes.includes(file.type)) {
            showModal('File Validation', 'Invalid file type. Please upload PDF, JPG, PNG, DOC, or DOCX files only.', 'warning');
            input.value = '';
            displayElement.innerHTML = '';
            return;
        }

        // Store file reference
        uploadedFiles[fileKey] = file;

        // Automatically tick the corresponding status checkbox if it exists
        const mapping = {
            'clientConfirm': 'booking_confirmed',
            'booking': 'booking_finalized',
            'si': 'si_submitted',
            'shippingBill': 'shipping_bill',
            'shippingInvoice': 'shipping_invoice',
            'bl': 'bl_received'
        };

        const statusKey = mapping[fileKey];
        if (statusKey) {
            const checkbox = document.getElementById(`status_${statusKey}`);
            if (checkbox && !checkbox.checked) {
                checkbox.checked = true;
                updateStatusDate(checkbox, `date_${statusKey}`);

                // If it's a detail row toggle, handled inside updateStatusDate/saveChecklistState chain partially
                // or specific triggers like toggleDetailRow
                if (statusKey === 'si_submitted') toggleDetailRow(checkbox, 'details_si_submitted');
                if (statusKey === 'bl_received') toggleDetailRow(checkbox, 'details_bl_received');
            }
        }

        // Display filename with icon and size
        const fileSize = (file.size / 1024).toFixed(2); // KB
        const tempUrl = URL.createObjectURL(file);
        displayElement.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; padding: 8px; background: white; border-radius: 4px; border: 1px solid var(--border-light); margin-top: 4px;">
                <i class="fas fa-file-${getFileIcon(file.type)}" style="color: var(--primary);"></i>
                <span style="flex: 1; font-weight: 500; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${file.name}">${file.name}</span>
                <a href="${tempUrl}" target="_blank" style="color: var(--primary); text-decoration: none; font-size: 11px; font-weight: 600; display: flex; align-items: center; gap: 4px; padding: 2px 4px;">
                    <i class="fas fa-eye"></i> View
                </a>
                <button type="button" onclick="removeFile('${input.id}', '${displayId}')" 
                    style="background: none; border: none; color: var(--danger); cursor: pointer; padding: 4px;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        console.log(`✅ File selected: ${file.name} (${fileSize} KB) for ${fileKey}`);
    } else {
        displayElement.innerHTML = '';
        delete uploadedFiles[fileKey];
    }
}

/**
 * Get appropriate icon based on file type
 */
function getFileIcon(fileType) {
    if (fileType.includes('pdf')) return 'pdf';
    if (fileType.includes('image')) return 'image';
    if (fileType.includes('word') || fileType.includes('document')) return 'word';
    return 'file';
}

/**
 * Remove uploaded file
 */
function removeFile(inputId, displayId) {
    const input = document.getElementById(inputId);
    const displayElement = document.getElementById(displayId);

    if (input) input.value = '';
    if (displayElement) displayElement.innerHTML = '';

    const fileKey = inputId.replace('Upload', '');
    delete uploadedFiles[fileKey];

    // Automatically uncheck the corresponding status checkbox if it exists
    const mapping = {
        'clientConfirm': 'booking_confirmed',
        'booking': 'booking_finalized',
        'draftSi': 'draft_si',
        'si': 'si_submitted',
        'shippingBill': 'form13',
        'shippingInvoice': 'shipping_invoice',
        'bl': 'bl_received'
    };

    const statusKey = mapping[fileKey];
    if (statusKey) {
        const checkbox = document.getElementById(`status_${statusKey}`);
        if (checkbox) {
            checkbox.checked = false;
            const dateElement = document.getElementById(`date_${statusKey}`);
            if (dateElement) {
                dateElement.textContent = '-';
                dateElement.style.color = 'var(--text-secondary)';
                dateElement.style.fontWeight = 'normal';
            }

            if (statusKey === 'si_submitted') toggleDetailRow(checkbox, 'details_si_submitted');
            if (statusKey === 'bl_received') toggleDetailRow(checkbox, 'details_bl_received');

            saveChecklistState();
        }
    }

    console.log(`🗑️ File removed: ${fileKey}`);
}

// ==========================================
// Save Tracking Data
// ==========================================

/**
 * Save tracking details and uploaded documents
 */
async function saveTracking() {


    // Prepare minimal tracking data
    const trackingData = {
        enquiry_id: currentEnquiryData?.id,
        quote_id: currentPricingData?.id,
        checklist_state: getChecklistState()
    };

    console.log('📦 Tracking data to save:', trackingData);
    console.log('📎 Uploaded files:', Object.keys(uploadedFiles));

    // Create FormData for file upload
    const formData = new FormData();
    formData.append('tracking_data', JSON.stringify(trackingData));

    // Append all uploaded files
    Object.entries(uploadedFiles).forEach(([key, file]) => {
        formData.append(key, file);
    });

    try {
        // TODO: Replace with actual backend endpoint
        const response = await fetch(`${CONFIG.API_URL}/api/tracking/`, {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const result = await response.json();
            console.log('✅ Tracking data saved:', result);

            // Show Success Modal and Redirect
            showModal('Success', 'Documents uploaded successfully!', 'success');
        } else {
            const error = await response.json();
            console.error('❌ Error saving tracking data:', error);
            showModal('Error', 'Error uploading documents: ' + (error.detail || 'Unknown error'), 'error');
        }
    } catch (error) {
        console.error('❌ Error:', error);
        showModal('Connection Error', 'Error connecting to server. Data saved locally but not uploaded.', 'error');

        // Save to localStorage as backup
        localStorage.setItem('pendingTrackingData', JSON.stringify({
            trackingData,
            fileNames: Object.keys(uploadedFiles)
        }));
    }
}

// ==========================================
// Navigation
// ==========================================

/**
 * Navigate back to the previous page
 */
function goBack() {
    // Once in Stage 3 (Upload & Track), we don't allow going back to the pricing calculator 
    // as the quote is already finalized and locked.
    window.location.href = '/#dashboard';
}
/**
 * Logic for Additional Invoices
 */
function addAdditionalInvoice() {
    const input = document.createElement('input');
    input.type = 'file';
    input.style.display = 'none';
    const id = `extraInv_${Date.now()}`;
    input.id = id;

    input.onchange = async () => {
        const file = input.files[0];
        if (file) {
            // Validate file size (2MB max)
            const maxSize = 2 * 1024 * 1024;
            if (file.size > maxSize) {
                showModal('File Validation', 'File size exceeds 2MB limit. Please choose a smaller file.', 'warning');
                return;
            }
            const formData = new FormData();
            formData.append('file', file);
            formData.append('document_type', 'additionalInvoice');
            formData.append('enquiry_id', currentEnquiryData.id);

            try {
                const res = await fetch(`${CONFIG.API_URL}/api/tracking/upload-single`, {
                    method: 'POST',
                    body: formData
                });
                if (res.ok) {
                    showModal('Success', 'Additional invoice uploaded', 'success');
                    // Refresh documents
                    document.getElementById('additionalInvoicesList').innerHTML = '';
                    await fetchUploadedDocuments(currentEnquiryData.id);
                }
            } catch (e) { console.error(e); }
        }
    };

    document.body.appendChild(input);
    input.click();
}

/**
 * Additional Charges & Payments Modal Logic
 */
function openAdditionalChargeModal() {
    document.getElementById('additionalChargeModal').style.display = 'block';
    // Set default date to today
    document.getElementById('add_charge_date').value = new Date().toISOString().split('T')[0];
}

function closeAdditionalChargeModal() {
    document.getElementById('additionalChargeModal').style.display = 'none';
}

async function submitAdditionalCharge() {
    const desc = document.getElementById('add_charge_desc').value;
    const amount = parseFloat(document.getElementById('add_charge_amount').value);
    const date = document.getElementById('add_charge_date').value;
    const utr = document.getElementById('add_charge_utr').value;

    if (!desc || isNaN(amount) || !date || !utr) {
        alert('Please fill all details');
        return;
    }

    const payload = {
        enquiry_id: currentEnquiryData.id,
        utr_number: utr,
        payment_date: date,
        amount: amount,
        currency: 'INR',
        description: desc,
        payment_type: 'Additional'
    };

    try {
        const res = await fetch(`${CONFIG.API_URL}/api/finance/shipping-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            closeAdditionalChargeModal();
            showModal('Success', 'Additional payment recorded', 'success');
            await fetchAdditionalPayments(currentEnquiryData.id);
            // Reload checklist state to pick up the updated pay_line flag
            await loadChecklistState();
        }
    } catch (e) { console.error(e); }
}

async function fetchAdditionalPayments(enquiryId) {
    const list = document.getElementById('additionalPaymentsList');
    if (!list) return;

    try {
        const res = await fetch(`${CONFIG.API_URL}/api/finance/shipping-payment/${enquiryId}`);
        if (res.ok) {
            const payments = await res.json();
            list.innerHTML = '';

            payments.forEach(p => {
                const card = document.createElement('div');
                card.style.cssText = 'background: white; border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);';
                card.innerHTML = `
                    <div style="font-size: 11px; color: var(--text-tertiary); margin-bottom: 4px; display: flex; justify-content: space-between;">
                        <span>${p.payment_type} Payment</span>
                        <span style="color: var(--success); font-weight: 700;">RECORDED</span>
                    </div>
                    <div style="font-size: 13px; font-weight: 700; color: var(--navy-800); margin-bottom: 8px;">${p.description || 'Shipping Line Payment'}</div>
                    <div style="display: grid; grid-template-columns: 1fr; gap: 4px; font-size: 11px; color: var(--text-secondary);">
                        <div style="display: flex; justify-content: space-between;">
                            <span>UTR:</span> <span style="font-weight: 600; color: var(--navy-700);">${p.utr_number}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>Date:</span> <span style="font-weight: 600;">${new Date(p.payment_date).toLocaleDateString()}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-top: 4px; padding-top: 4px; border-top: 1px dashed #e2e8f0;">
                            <span>Amount:</span> <span style="font-weight: 800; color: var(--primary); font-size: 12px;">₹${p.amount.toLocaleString()}</span>
                        </div>
                    </div>
                `;
                list.appendChild(card);
            });
        }
    } catch (e) { console.error(e); }
}
