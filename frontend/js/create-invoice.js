let enquiryId = null;
let clientData = null;
let creditPeriod = 0;
let hasSavedInvoice = false;

/**
 * Strip the branch suffix from a client name for invoicing.
 * "Acme Corp_Mumbai" → "Acme Corp"
 * "Acme Corp_Main"   → "Acme Corp"
 * "Acme Corp"        → "Acme Corp"  (no change)
 */
function stripBranchSuffix(name) {
    if (!name) return '';
    if (name.includes('_')) return name.rsplit ? name.rsplit('_', 1)[0] : name.substring(0, name.lastIndexOf('_'));
    return name;
}

/** Customer Invoice No. is taken from Shipper Invoice No. (SI) on Upload & Track. */
function syncCustomerInvoiceFromShipper(shipperInv) {
    const el = document.getElementById('customer_invoice_no');
    if (!el) return;
    const val = (shipperInv || '').trim();
    if (el.tagName === 'INPUT') {
        el.value = val;
    } else {
        el.textContent = val || '---';
    }
}

function getBaseInvoiceNumber() {
    const invInput = document.getElementById('invoice_number');
    if (!invInput) return '';
    return (invInput.dataset.baseNumber || invInput.value || '').trim();
}

function setBaseInvoiceNumber(number) {
    const invInput = document.getElementById('invoice_number');
    if (!invInput) return;
    const base = (number || '').trim();
    invInput.dataset.baseNumber = base;
    invInput.dataset.original = base;
    applyInvoiceNumberForItemType();
}

function getInvoiceNumberForDisplay() {
    const invInput = document.getElementById('invoice_number');
    if (!invInput) return '';
    return (invInput.value || '').trim();
}

function applyInvoiceNumberForItemType() {
    const invInput = document.getElementById('invoice_number');
    const itemTypeEl = document.getElementById('invoice_item_type');
    if (!invInput) return;
    const base = getBaseInvoiceNumber();
    if (!base) {
        invInput.value = '';
        return;
    }
    if (itemTypeEl && itemTypeEl.value === 'additional') {
        invInput.value = base.includes('-ADD') ? base : `${base}-ADD-1`;
    } else {
        invInput.value = base;
    }
}

async function fetchNextInvoiceNumber() {
    if (hasSavedInvoice) return;
    const invoiceDate = document.getElementById('invoice_date')?.value;
    const params = invoiceDate ? `?invoice_date=${encodeURIComponent(invoiceDate)}` : '';
    try {
        const res = await fetch(`${CONFIG.API_URL}/api/invoice/next-number${params}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.invoice_number) {
            setBaseInvoiceNumber(data.invoice_number);
        }
    } catch (err) {
        console.error('Failed to fetch next invoice number:', err);
    }
}

function getCustomerInvoiceNo() {
    const el = document.getElementById('customer_invoice_no');
    if (!el) return '';
    if (el.tagName === 'INPUT') return (el.value || '').trim();
    const text = (el.textContent || '').trim();
    return text === '---' ? '' : text;
}

document.addEventListener('DOMContentLoaded', async function () {
    const urlParams = new URLSearchParams(window.location.search);
    enquiryId = urlParams.get('enquiry_id');

    if (!enquiryId) {
        alert('No enquiry ID found');
        window.location.href = '/#finance';
        return;
    }

    // Set default invoice date to today
    const today = new Date();
    document.getElementById('invoice_date').value = today.toISOString().split('T')[0];

    // Set default Place of Supply
    document.getElementById('place_of_supply').value = '06AAFCL3674H1ZE/Gurugram';

    await fetchAllData();

    // Listen for invoice date changes to update due date and preview invoice number
    document.getElementById('invoice_date').addEventListener('change', function () {
        calculateDueDate();
        fetchNextInvoiceNumber();
    });

    // Auto-suffix for additional invoices
    document.getElementById('invoice_item_type').addEventListener('change', applyInvoiceNumberForItemType);
});

async function fetchAllData() {
    try {
        const [enquiryRes, statusRes, clientRes, quotesRes, invoiceRes] = await Promise.all([
            fetch(`${CONFIG.API_URL}/api/enquiry/${enquiryId}`),
            fetch(`${CONFIG.API_URL}/api/tracking/status/${enquiryId}`),
            fetch(`${CONFIG.API_URL}/api/client/master/by-enquiry/${enquiryId}`),
            fetch(`${CONFIG.API_URL}/api/quotes/enquiry/${enquiryId}`),
            fetch(`${CONFIG.API_URL}/api/invoice/details/${enquiryId}`)
        ]);

        if (enquiryRes.ok) {
            const enquiry = await enquiryRes.json();
            document.getElementById('job_no_val').textContent = enquiry.enquiry_number;
            document.getElementById('job_date_val').textContent = new Date(enquiry.created_at).toLocaleDateString();
        }

        if (statusRes.ok) {
            const status = await statusRes.json();
            if (status) {
                document.getElementById('consignee_val').textContent = status.consignee || '---';
                document.getElementById('origin_val').textContent = status.port_of_origin || '---';
                document.getElementById('dest_val').textContent = status.final_destination || '---';
                document.getElementById('vessel_val').textContent = status.vessel || '---';
                document.getElementById('voyage_val').textContent = status.voyage || '---';
                document.getElementById('etd_val').textContent = status.etd ? new Date(status.etd).toLocaleDateString() : '---';
                document.getElementById('eta_val').textContent = status.eta ? new Date(status.eta).toLocaleDateString() : '---';
                const shipperInv = (status.si_number || '').trim();
                document.getElementById('shipper_inv_no').textContent = shipperInv || '---';
                document.getElementById('master_no_val').textContent = status.master_number || '---';
                syncCustomerInvoiceFromShipper(shipperInv);
            }
        }

        if (quotesRes.ok) {
            const quotes = await quotesRes.json();
            if (quotes && quotes.length > 0) {
                const acceptedQuote = quotes.find(q => q.status === 'accepted') || quotes[0];
                document.getElementById('incoterm_val').textContent = acceptedQuote.incoterm || '---';
            }
        }

        if (clientRes.ok) {
            const data = await clientRes.json();
            if (data.error) {
                console.warn('Client data warning:', data.error);
                document.getElementById('customer_info').textContent = 'Not Found';
                document.getElementById('shipper_info').textContent = 'Not Found';
            } else {
                clientData = data;
                const origin = data.origin;
                const master = data.master;

                creditPeriod = master.credit_period || 0;

                // Customer Name, Adrs & GST (Origin)
                // Use clean company name (strip branch suffix) on invoice
                const invoiceCustomerName = stripBranchSuffix(origin.unique_client_name || master.client_name);
                document.getElementById('customer_info').innerHTML = `
                    <strong>${invoiceCustomerName}</strong><br>
                    ${origin.office_address}, ${origin.office_location}<br>
                    GST: ${origin.gst_no}
                `;

                // Shipper Name & Adrs (Master branch — keeps the specific branch name)
                document.getElementById('shipper_info').innerHTML = `
                    <strong>${master.client_name}</strong><br>
                    ${master.office_address}, ${master.office_location}
                `;

                document.getElementById('customer_code_val').textContent = master.client_code;

                calculateDueDate();
            }
        }

        if (invoiceRes.ok) {
            const invData = await invoiceRes.json();
            if (invData) {
                hasSavedInvoice = true;
                if (invData.invoice_number) {
                    setBaseInvoiceNumber(invData.invoice_number);
                    const invInput = document.getElementById('invoice_number');
                    if (invInput) invInput.readOnly = true;
                }
                if (invData.customer_invoice_no && !getCustomerInvoiceNo()) {
                    syncCustomerInvoiceFromShipper(invData.customer_invoice_no);
                }
                if (invData.place_of_supply) document.getElementById('place_of_supply').value = invData.place_of_supply;
                if (invData.invoice_date) document.getElementById('invoice_date').value = invData.invoice_date;
                if (invData.payment_due_date) document.getElementById('payment_due_date').value = invData.payment_due_date;
                if (invData.irn) document.getElementById('irn_val').value = invData.irn;
            } else {
                await fetchNextInvoiceNumber();
            }
        }

    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

function calculateDueDate() {
    const invDateStr = document.getElementById('invoice_date').value;
    if (!invDateStr) return;

    const invDate = new Date(invDateStr);
    invDate.setDate(invDate.getDate() + creditPeriod);

    document.getElementById('payment_due_date').value = invDate.toISOString().split('T')[0];
}

async function generateInvoice(type = 'draft') {
    const invoiceNumber = getInvoiceNumberForDisplay();
    const invoiceData = {
        enquiry_id: enquiryId,
        place_of_supply: document.getElementById('place_of_supply').value,
        invoice_number: invoiceNumber,
        irn: document.getElementById('irn_val').value,
        invoice_date: document.getElementById('invoice_date').value,
        payment_due_date: document.getElementById('payment_due_date').value
    };

    if (!invoiceData.invoice_number) {
        if (typeof showModal === 'function') {
            showModal('Input Required', 'Invoice number is not ready yet. Please wait a moment and try again.', 'warning');
        } else {
            alert('Invoice number is not ready yet. Please wait a moment and try again.');
        }
        return;
    }

    const roeValue = parseFloat(document.getElementById('roe_val').value);
    if (!document.getElementById('roe_val').value || isNaN(roeValue) || roeValue <= 0) {
        if (typeof showModal === 'function') {
            showModal('Input Required', 'Exchange Rate (ROE) is mandatory. Please enter the Exchange Rate before generating the invoice.', 'warning');
        } else {
            alert('Exchange Rate (ROE) is mandatory. Please enter the Exchange Rate before generating the invoice.');
        }
        document.getElementById('roe_val').focus();
        return;
    }

    try {
        // Generate and download the invoice PDF
        console.log('Generating invoice with data:', invoiceData);

        // Construct URL with query parameters
        const irnValue = document.getElementById('irn_val').value.trim();
        const customerInvNo = getCustomerInvoiceNo();
        const params = new URLSearchParams({
            invoice_number: invoiceData.invoice_number,
            place_of_supply: invoiceData.place_of_supply,
            invoice_date: invoiceData.invoice_date,
            roe: document.getElementById('roe_val').value || '',
            invoice_type: type,           // 'draft' or 'tax'
            item_type: document.getElementById('invoice_item_type').value || 'all'
        });
        if (customerInvNo) params.append('customer_invoice_no', customerInvNo);
        if (irnValue) params.append('irn', irnValue);

        const pdfUrl = `${CONFIG.API_URL}/api/invoice/generate/${enquiryId}?${params.toString()}`;
        window.open(pdfUrl, '_blank');

        if (typeof showModal === 'function') {
            showModal('Success', 'Invoice generated successfully!', 'success');
        } else {
            alert('Invoice generated successfully!');
        }
    } catch (error) {
        console.error('Error generating invoice:', error);
        if (typeof showModal === 'function') {
            showModal('Error', 'Failed to generate invoice', 'error');
        } else {
            alert('Failed to generate invoice');
        }
    }
}

function handleLogout() {
    localStorage.removeItem('user');
    window.location.href = '/login';
}

function togglePdfDropdown() {
    const menu = document.getElementById('pdfDropdownMenu');
    if (menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

// Close dropdown when clicking outside
document.addEventListener('click', function (e) {
    const wrap = document.getElementById('pdfDropdownWrap');
    const menu = document.getElementById('pdfDropdownMenu');
    if (wrap && menu && !wrap.contains(e.target)) {
        menu.style.display = 'none';
    }
});

function confirmRecordInvoice() {
    const invoiceNumber = getInvoiceNumberForDisplay() || getBaseInvoiceNumber() || 'next in series';

    // Check if Enquiry ID is present
    if (!enquiryId) {
        if (typeof showModal === 'function') showModal('Error', 'Enquiry ID is missing.', 'error');
        else alert('Enquiry ID is missing.');
        return;
    }

    if (hasSavedInvoice) {
        if (typeof showModal === 'function') {
            showModal('Already Recorded', 'This invoice has already been saved to the system.', 'info');
        } else {
            alert('This invoice has already been saved to the system.');
        }
        return;
    }

    // Use showModal with confirmation callback
    if (typeof showModal === 'function') {
        showModal(
            'Confirm Recording',
            `Save this invoice? The system will assign invoice number <b>${invoiceNumber}</b> (or the next available in the LPE series).`,
            'info',
            function () {
                recordInvoice();
            }
        );
    } else {
        if (confirm(`Save this invoice? The system will assign the next invoice number in the LPE series.`)) {
            recordInvoice();
        }
    }
}

async function recordInvoice() {
    const customerInvNo = getCustomerInvoiceNo();
    const invoiceData = {
        enquiry_id: parseInt(enquiryId),
        place_of_supply: document.getElementById('place_of_supply').value,
        customer_invoice_no: customerInvNo || null,
        irn: document.getElementById('irn_val').value || null,
        invoice_date: document.getElementById('invoice_date').value,
        payment_due_date: document.getElementById('payment_due_date').value,
        item_type: document.getElementById('invoice_item_type').value || 'all'
    };

    // Ensure dates are valid
    if (!invoiceData.invoice_date) {
        if (typeof showModal === 'function') showModal('Validation Error', 'Please select Invoice Date', 'warning');
        else alert('Please select Invoice Date');
        return;
    }

    // Default due date if empty
    if (!invoiceData.payment_due_date) {
        invoiceData.payment_due_date = invoiceData.invoice_date;
    }

    try {
        const response = await fetch(`${CONFIG.API_URL}/api/invoice/record`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(invoiceData)
        });

        const data = await response.json();

        if (response.ok) {
            hasSavedInvoice = true;
            if (data.invoice_number) {
                setBaseInvoiceNumber(data.invoice_number);
                const invInput = document.getElementById('invoice_number');
                if (invInput) invInput.readOnly = true;
            }
            const hasIrn = !!(invoiceData.irn && String(invoiceData.irn).trim());
            const hasInvoiceNo = !!(data.invoice_number && String(data.invoice_number).trim());
            if (typeof notifyFinanceParentRefresh === 'function') {
                notifyFinanceParentRefresh({
                    close: true,
                    section: 'invoices',
                    moveToCompleted: hasIrn && hasInvoiceNo,
                });
            }
            const savedNo = data.invoice_number ? ` (${data.invoice_number})` : '';
            if (typeof showModal === 'function') {
                showModal('Success', `Invoice recorded successfully${savedNo}!`, 'success');
            } else {
                alert(`Invoice recorded successfully${savedNo}!`);
            }
        } else {
            const errorMsg = data.detail || 'Failed to record invoice';
            if (typeof showModal === 'function') {
                showModal('Error', errorMsg, 'error');
            } else {
                alert('Error: ' + errorMsg);
            }
        }
    } catch (error) {
        console.error('Error recording invoice:', error);
        if (typeof showModal === 'function') {
            showModal('Error', 'Network error or server unreachable', 'error');
        } else {
            alert('Error: Network error or server unreachable');
        }
    }
}
