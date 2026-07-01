// ==========================================
// Upload & Track Page - JavaScript
// ==========================================

let currentEnquiryData = null;
let currentPricingData = null;
let uploadedFiles = {};

// ==========================================
// Initialization
// ==========================================
document.addEventListener('DOMContentLoaded', async function () {
    if (new URLSearchParams(window.location.search).get('embedded') === '1') {
        document.documentElement.classList.add('embedded-mode');
        document.body.classList.add('embedded-mode');
    }
    console.log('📦 Upload & Track page loaded');
    await loadEnquiryData();
    // Run after enquiry + documents load so BL View link and checklist stay in sync
    await loadChecklistState();

    // Attach autosave to metadata fields
    const metadataFields = [
        'si_number', 'bl_consignee', 'bl_port_origin', 'bl_final_dest', 'bl_master_number',
        'bl_vessel', 'bl_voyage', 'bl_etd', 'bl_eta', 'bl_container_number'
    ];
    metadataFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', saveChecklistState);
            el.addEventListener('input', saveChecklistState);
        }
    });
});

/**
 * Load enquiry and pricing data from URL parameters or localStorage
 */
async function loadEnquiryData() {
    // Try to get enquiry ID from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const enquiryId = urlParams.get('enquiry_id');

    if (enquiryId) {
        await fetchEnquiryById(enquiryId);
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
 * Map API document_type / aliases → DOM element id suffix (…FileName), incl. BL → blFileName.
 */
function getTrackingDocDisplayId(documentType) {
    const raw = (documentType || '').toString().trim();
    if (!raw) return 'unknownFileName';
    const norm = raw.toLowerCase().replace(/[\s_-]/g, '');
    const byNorm = {
        bol: 'blFileName',
        billoflading: 'blFileName',
        housebilloflading: 'blFileName',
        masterbilloflading: 'blFileName',
        bl: 'blFileName',
        blreceived: 'blFileName',
        mbl: 'blFileName',
        hbl: 'blFileName',
        shippinginvoice: 'shippingInvoiceFileName',
        clientconfirm: 'clientConfirmFileName',
        booking: 'bookingFileName',
        draftsi: 'draftSiFileName',
        si: 'siFileName',
        shippingbill: 'shippingBillFileName',
        origincert: 'originCertFileName',
        customsdeclaration: 'customsDeclarationFileName',
        insurancecert: 'insuranceCertFileName',
        commercialinvoice: 'commercialInvoiceFileName',
        packinglist: 'packingListFileName'
    };
    if (byNorm[norm]) return byNorm[norm];
    // e.g. bl_received, BL_copy → normalize underscores away above; catch remaining *bl* doc labels
    if (norm.includes('billoflading') || norm === 'masterbl' || norm === 'housebl') {
        return 'blFileName';
    }
    return `${raw}FileName`;
}

function setBlReceivedViewLink(fileUrl) {
    const link = document.getElementById('link_view_bl_received');
    if (!link || !fileUrl) return;
    link.href = fileUrl;
    link.style.display = 'inline-flex';
}

function hideBlReceivedViewLink() {
    const link = document.getElementById('link_view_bl_received');
    if (!link) return;
    link.style.display = 'none';
    link.removeAttribute('href');
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

            hideBlReceivedViewLink();

            documents.forEach(doc => {
                const filename = (doc.file_path || '').split(/[/\\]/).pop();
                const fileUrl = `${CONFIG.API_URL}/uploads/${encodeURIComponent(filename)}`;
                const metadata = doc.metadata_info || {};

                // 1. Handling for Additional Invoices
                if (doc.document_type === 'additionalInvoice') {
                    const listEl = document.getElementById('additionalInvoicesList');
                    if (listEl) {
                        let metaHtml = "";
                        if (metadata.amount || metadata.charge_details) {
                            metaHtml = `
                                <div style="margin-top: 4px; padding-top: 4px; border-top: 1px dashed #e2e8f0; display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; font-size: 10px; color: #64748b;">
                                    <span><strong>Desc:</strong> ${metadata.charge_details || '-'}</span>
                                    <span><strong>HSN:</strong> ${metadata.hsn_sac || '-'}</span>
                                    <span style="text-align: right; font-weight: 700; color: var(--navy-800);">₹${parseFloat(metadata.amount || 0).toLocaleString()}</span>
                                </div>
                            `;
                        }

                        const item = document.createElement('div');
                        item.innerHTML = `
                            <div style="display: flex; flex-direction: column; gap: 4px; padding: 8px 12px; background: #f8fafc; border-radius: 6px; border: 1px solid var(--border-light);">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <i class="fas fa-file-invoice" style="color: var(--primary);"></i>
                                    <span style="flex: 1; font-weight: 600; font-size: 11px;">${doc.file_name}</span>
                                    <a href="${fileUrl}" target="_blank" style="color: var(--primary); font-size: 11px; font-weight: 600; text-decoration: none;">View</a>
                                </div>
                                ${metaHtml}
                            </div>
                        `;
                        listEl.appendChild(item);
                        return; // Return for forEach callback (like continue)
                    }
                }

                // 2. Mapping for all other documents (including Main Shipping Invoice)
                const displayId = getTrackingDocDisplayId(doc.document_type);
                const isBlDoc = displayId === 'blFileName';

                const displayElement = document.getElementById(displayId);
                if (displayElement) {
                    displayElement.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 8px; padding: 8px; background: white; border-radius: 4px; border: 1px solid var(--border-light); margin-top: 4px;">
                            <i class="fas fa-check-circle" style="color: var(--success);"></i>
                            <span style="flex: 1; font-weight: 500; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${doc.file_name}">${doc.file_name}</span>
                            <a href="${fileUrl}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); text-decoration: none; font-size: 11px; font-weight: 600; display: flex; align-items: center; gap: 4px; padding: 2px 4px;">
                                <i class="fas fa-eye"></i> View
                            </a>
                        </div>
                    `;
                }
                if (isBlDoc) {
                    setBlReceivedViewLink(fileUrl);
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
    updateGenerateHblRowVisibility();
}

function updateGenerateHblRowVisibility() {
    const row = document.getElementById('row_generate_hbl');
    if (!row) return;
    const siChecked = !!document.getElementById('status_si_submitted')?.checked;
    const hblRequired = !!currentEnquiryData?.hbl_required;
    row.style.display = siChecked && hblRequired ? 'table-row' : 'none';
}

function openGenerateHblFromTracking() {
    if (!currentEnquiryData?.id) {
        showModal('Error', 'Enquiry not loaded. Please refresh the page.', 'error');
        return;
    }
    if (!currentEnquiryData.hbl_required) {
        showModal('HBL Not Required', 'This sale does not have HBL required.', 'info');
        return;
    }
    const siChecked = !!document.getElementById('status_si_submitted')?.checked;
    if (!siChecked) {
        showModal('SI Required', 'Upload SI and mark SI Submitted before generating HBL.', 'warning');
        return;
    }
    const url = `/hbl-document?enquiry_id=${currentEnquiryData.id}`;
    const target = window.parent !== window ? window.parent : window;
    target.location.href = url;
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

    // 2. Payment Dependency: BL Received appears only after Payment to Shipping Line (pay_line) OR after SOB
    const isPaid = window.currentPaymentStatus === true;
    const isBLChecked = document.getElementById('status_bl_received')?.checked;

    const rowBL = document.getElementById('row_bl_received');
    const rowAddInvoices = document.getElementById('row_additional_invoices');

    if (rowBL) {
        // Show BL row if paid OR if it was already checked OR if SOB is done
        if (isPaid || isBLChecked || sobChecked) {
            rowBL.style.display = 'block';
            document.getElementById('status_bl_received').disabled = false;
            document.getElementById('status_bl_received').style.cursor = 'pointer';
            document.getElementById('btn_bl_received').disabled = false;
            document.getElementById('btn_bl_received').style.opacity = '1';
            document.getElementById('btn_bl_received').style.cursor = 'pointer';

            if (rowAddInvoices) rowAddInvoices.style.display = 'table-row';
        } else {
            rowBL.style.display = 'none';
            if (rowAddInvoices) rowAddInvoices.style.display = 'none';
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
        // If it's a <tr> use table-row, else use block
        detailRow.style.display = detailRow.tagName === 'TR' ? 'table-row' : 'block';
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
        'container_picked', 'stuffing_done',
        'draft_si', 'si_submitted', 'shipping_bill', 'container_gated',
        'sob', 'shipping_invoice', 'bl_received'
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
    state.container_number = document.getElementById('bl_container_number')?.value || '';

    return state;
}

/**
 * Save the current state of all checkboxes and dates to localStorage and Backend
 */
async function saveChecklistState() {
    if (!currentEnquiryData?.id) return;

    const state = getChecklistState();
    localStorage.setItem(`checklist_${currentEnquiryData.id}`, JSON.stringify(state));
    console.log('💾 Checklist state saved to localStorage');

    try {
        const response = await fetch(`${CONFIG.API_URL}/api/tracking/status/${currentEnquiryData.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state)
        });
        if (response.ok) {
            console.log('✅ Checklist state synced with backend');
        }
    } catch (e) {
        console.error('❌ Failed to sync checklist state with backend:', e);
    }
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
    } catch (e) {
        console.warn('Backend status fetch failed, falling back to localStorage:', e);
    }

    // 2. Fallback to localStorage
    const savedState = localStorage.getItem(`checklist_${currentEnquiryData.id}`);
    if (savedState) {
        try {
            const state = JSON.parse(savedState);
            applyChecklistState(state, false);
            console.log('🔄 Checklist state restored from localStorage');
        } catch (e) {
            console.error('Error parsing localStorage state:', e);
        }
    } else {
        // Even if no state found, ensure dependencies are checked once
        checkAllDependencies();
    }
}

/**
 * Apply status data to the DOM
 */
function applyChecklistState(state, isBackend = false) {
    if (!state) return;

    const checklistItems = [
        'booking_confirmed', 'booking_placed', 'booking_finalized',
        'container_picked', 'stuffing_done',
        'draft_si', 'si_submitted', 'shipping_bill', 'container_gated',
        'sob', 'shipping_invoice', 'bl_received'
    ];

    // Check for payment status
    window.currentPaymentStatus = !!state.pay_line;

    checklistItems.forEach(item => {
        const checkbox = document.getElementById(`status_${item}`);
        const dateEl = document.getElementById(`date_${item}`);

        if (!checkbox || item === 'booking_confirmed') return;

        let isChecked = isBackend ? !!state[item] : !!state[item]?.checked;
        let dateValue = isBackend ? state[item] : state[item]?.date;

        if (item === 'sob') {
            // SOB uses a date input picker — restore accordingly
            checkbox.checked = isChecked;
            const dateInput = document.getElementById('date_sob');
            if (dateInput) {
                if (isChecked) {
                    dateInput.disabled = false;
                    dateInput.style.cursor = 'pointer';
                    dateInput.style.opacity = '1';
                    dateInput.style.background = 'white';
                    dateInput.style.borderColor = 'var(--primary)';

                    // Restore date from backend ISO or local string
                    if (dateValue && dateValue !== '-') {
                        const dateOnly = typeof dateValue === 'string' && dateValue.includes('T')
                            ? dateValue.split('T')[0]
                            : dateValue;
                        if (dateOnly) dateInput.value = dateOnly;
                    }
                } else {
                    dateInput.disabled = true;
                    dateInput.style.opacity = '0.5';
                    dateInput.style.cursor = 'not-allowed';
                    dateInput.value = '';
                }
            }
        } else {
            // Default restoration
            checkbox.checked = isChecked;
            if (dateEl) {
                // Formatting for display
                if (isBackend && dateValue && typeof dateValue === 'string' && dateValue.includes('T')) {
                    const d = new Date(dateValue);
                    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    dateEl.textContent = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear().toString().slice(-2)}, ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
                } else {
                    dateEl.textContent = dateValue || '-';
                }

                if (isChecked && dateEl.textContent !== '-') {
                    dateEl.style.color = 'var(--primary)';
                    dateEl.style.fontWeight = '600';
                }
            }
        }

        // Handle detail row visibility
        if (checkbox.checked) {
            const detailRowId = `details_${item}`;
            const detailRow = document.getElementById(detailRowId);
            if (detailRow) {
                detailRow.style.display = (item === 'bl_received') ? 'block' : 'table-row';
            }
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
        'eta': 'bl_eta',
        'container_number': 'bl_container_number'
    };

    Object.entries(metadataMapping).forEach(([backendKey, elementId]) => {
        const el = document.getElementById(elementId);
        if (!el || !Object.prototype.hasOwnProperty.call(state, backendKey)) return;
        let value = state[backendKey];
        if (value == null) value = '';
        if ((backendKey === 'etd' || backendKey === 'eta') && typeof value === 'string' && value.includes('T')) {
            value = value.split('T')[0];
        }
        el.value = value;
    });

    // Ensure dependencies are applied AFTER applying state
    checkAllDependencies();
    updateGenerateHblRowVisibility();
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

        updateGenerateHblRowVisibility();

        // Display filename with icon and size
        const fileSize = (file.size / 1024).toFixed(2); // KB
        const tempUrl = URL.createObjectURL(file);
        displayElement.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; padding: 8px; background: white; border-radius: 4px; border: 1px solid var(--border-light); margin-top: 4px;">
                <i class="fas fa-file-${getFileIcon(file.type)}" style="color: var(--primary);"></i>
                <span style="flex: 1; font-weight: 500; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${file.name}">${file.name}</span>
                <a href="${tempUrl}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); text-decoration: none; font-size: 11px; font-weight: 600; display: flex; align-items: center; gap: 4px; padding: 2px 4px;">
                    <i class="fas fa-eye"></i> View
                </a>
                <button type="button" onclick="removeFile('${input.id}', '${displayId}')" 
                    style="background: none; border: none; color: var(--danger); cursor: pointer; padding: 4px;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        if (displayId === 'blFileName') {
            setBlReceivedViewLink(tempUrl);
        }

        console.log(`✅ File selected: ${file.name} (${fileSize} KB) for ${fileKey}`);
    } else {
        displayElement.innerHTML = '';
        delete uploadedFiles[fileKey];
        if (displayId === 'blFileName') {
            hideBlReceivedViewLink();
        }
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

    if (fileKey === 'bl') {
        hideBlReceivedViewLink();
    }

    // Automatically uncheck the corresponding status checkbox if it exists
    const mapping = {
        'clientConfirm': 'booking_confirmed',
        'booking': 'booking_finalized',
        'draftSi': 'draft_si',
        'si': 'si_submitted',
        'shippingBill': 'shipping_bill',
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

    updateGenerateHblRowVisibility();

    console.log(`🗑️ File removed: ${fileKey}`);
}

// ==========================================
// Save Tracking Data
// ==========================================

/**
 * Save tracking details and uploaded documents
 */
async function saveTracking() {
    if (!currentEnquiryData?.id) {
        showModal('Error', 'Enquiry not loaded. Please refresh the page.', 'error');
        return;
    }

    // Persist checklist/metadata (container no., BL fields, SI number) before file upload
    await saveChecklistState();

    const trackingData = {
        enquiry_id: currentEnquiryData.id,
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
        // Backend expects `bol` for Bill of Lading; file input key from blUpload is `bl`.
        const formKey = key === 'bl' ? 'bol' : key;
        formData.append(formKey, file);
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

            await saveChecklistState();
            await loadChecklistState();

            showModal('Success', 'Tracking saved successfully!', 'success');
        } else {
            const error = await response.json();
            console.error('❌ Error saving tracking data:', error);
            showModal('Error', 'Error saving tracking: ' + (error.detail || 'Unknown error'), 'error');
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

function handleAdditionalInvoiceUpload(input) {
    if (input.files && input.files[0]) {
        // Show file name
        document.getElementById('additionalInvoiceFileName').innerText = input.files[0].name;

        // Visual feedback for upload button
        const btn = document.getElementById('btn_additional_invoice');
        if (btn) {
            btn.innerHTML = '<i class="fas fa-check" style="color: var(--success); font-size: 11px;"></i> Document Selected';
        }
    }
}


async function saveAdditionalInvoiceDetails() {
    const chargeDetails = document.getElementById('add_inv_charge_details')?.value;
    const hsnSac = document.getElementById('add_inv_hsn_sac')?.value;
    const amount = document.getElementById('add_inv_amount')?.value;
    const fileInput = document.getElementById('additionalInvoiceUpload');

    if (!chargeDetails || !hsnSac || !amount) {
        alert("Please fill in Charge Details, HSN/SAC Code, and Amount");
        return;
    }

    if (!fileInput.files || !fileInput.files[0]) {
        alert("Please upload a file first");
        return;
    }

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);
    formData.append('document_type', 'additionalInvoice');
    formData.append('enquiry_id', currentEnquiryData.id);

    // Pass metadata
    const metadataObj = {
        charge_details: chargeDetails,
        hsn_sac: hsnSac,
        amount: amount
    };
    formData.append('metadata', JSON.stringify(metadataObj));

    try {
        const res = await fetch(`${CONFIG.API_URL}/api/tracking/upload-single`, {
            method: 'POST',
            body: formData
        });

        if (res.ok) {
            showModal('Success', 'Additional invoice uploaded and saved', 'success');

            // Basic UI reset/feedback
            const detailsForm = document.getElementById('details_additional_invoice');
            if (detailsForm) {
                detailsForm.style.display = 'none';
            }

            // Reset upload button
            const btn = document.getElementById('btn_additional_invoice');
            if (btn) {
                btn.classList.remove('uploaded');
                btn.innerHTML = '<i class="fas fa-file-upload"></i> Select Document';
                btn.style.cssText = 'padding: 6px 12px; font-size: 12px; font-weight: 600; border-radius: 6px; border: 1px solid #e2e8f0; color: #334155; background: white; display: flex; align-items: center; gap: 6px;';
            }
            const nameDiv = document.getElementById('additionalInvoiceFileName');
            if (nameDiv) nameDiv.innerText = 'No file chosen';

            fileInput.value = '';
            document.getElementById('add_inv_charge_details').value = '';
            document.getElementById('add_inv_hsn_sac').value = '';
            document.getElementById('add_inv_amount').value = '';

            // Refresh documents list
            document.getElementById('additionalInvoicesList').innerHTML = '';
            await fetchUploadedDocuments(currentEnquiryData.id);
        } else {
            const error = await res.json();
            showModal('Error', 'Failed to upload: ' + (error.detail || 'Unknown error'), 'error');
        }
    } catch (e) {
        console.error(e);
        showModal('Error', 'Failed to save additional invoice details', 'error');
    }
}
