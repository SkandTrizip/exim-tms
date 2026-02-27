let enquiryId = null;
let clientData = null;
let creditPeriod = 0;

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

    // Listen for invoice date changes to update due date
    document.getElementById('invoice_date').addEventListener('change', calculateDueDate);

    // Auto-suffix for additional invoices
    document.getElementById('invoice_item_type').addEventListener('change', function () {
        const invInput = document.getElementById('invoice_number');
        const originalVal = invInput.dataset.original || invInput.value;
        if (!invInput.dataset.original) invInput.dataset.original = originalVal;

        if (this.value === 'additional') {
            if (!invInput.value.includes('-ADD')) {
                invInput.value = originalVal + '-ADD-1';
            }
        } else {
            invInput.value = originalVal;
        }
    });
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
                document.getElementById('shipper_inv_no').textContent = status.si_number || '---';
                document.getElementById('master_no_val').textContent = status.master_number || '---';
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
                document.getElementById('customer_info').innerHTML = `
                    <strong>${origin.unique_client_name}</strong><br>
                    ${origin.office_address}, ${origin.office_location}<br>
                    GST: ${origin.gst_no}
                `;

                // Shipper Name & Adrs (Master)
                document.getElementById('shipper_info').innerHTML = `
                    <strong>${master.client_name}</strong><br>
                    ${master.office_address}, ${master.office_location}
                `;

                document.getElementById('customer_code_val').textContent = master.client_code;
                document.getElementById('customer_pan_val').textContent = master.pan_no || '---';

                calculateDueDate();
            }
        }

        if (invoiceRes.ok) {
            const invData = await invoiceRes.json();
            if (invData) {
                if (invData.invoice_number) document.getElementById('invoice_number').value = invData.invoice_number;
                if (invData.place_of_supply) document.getElementById('place_of_supply').value = invData.place_of_supply;
                if (invData.invoice_date) document.getElementById('invoice_date').value = invData.invoice_date;
                if (invData.payment_due_date) document.getElementById('payment_due_date').value = invData.payment_due_date;
                if (invData.irn) document.getElementById('irn_val').value = invData.irn;
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
    const invoiceData = {
        enquiry_id: enquiryId,
        place_of_supply: document.getElementById('place_of_supply').value,
        invoice_number: document.getElementById('invoice_number').value,
        irn: document.getElementById('irn_val').value,
        invoice_date: document.getElementById('invoice_date').value,
        payment_due_date: document.getElementById('payment_due_date').value
    };

    if (!invoiceData.invoice_number) {
        if (typeof showModal === 'function') {
            showModal('Input Required', 'Please enter Invoice Number', 'warning');
        } else {
            alert('Please enter Invoice Number');
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
        const params = new URLSearchParams({
            invoice_number: invoiceData.invoice_number,
            place_of_supply: invoiceData.place_of_supply,
            invoice_date: invoiceData.invoice_date,
            roe: document.getElementById('roe_val').value || '',
            invoice_type: type,           // 'draft' or 'tax'
            item_type: document.getElementById('invoice_item_type').value || 'all'
        });
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
    const invoiceNumber = document.getElementById('invoice_number').value;

    // Check if Enquiry ID is present
    if (!enquiryId) {
        if (typeof showModal === 'function') showModal('Error', 'Enquiry ID is missing.', 'error');
        else alert('Enquiry ID is missing.');
        return;
    }

    if (!invoiceNumber) {
        if (typeof showModal === 'function') {
            showModal('Validation Error', 'Please enter Invoice Number before recording.', 'warning');
        } else {
            alert('Please enter Invoice Number before recording.');
        }
        return;
    }

    // Use showModal with confirmation callback
    if (typeof showModal === 'function') {
        showModal(
            'Confirm Recording',
            `Are you sure you want to record Invoice <b>${invoiceNumber}</b>? This action will save the invoice to the system.`,
            'info',
            function () {
                recordInvoice();
            }
        );
    } else {
        if (confirm(`Are you sure you want to record Invoice ${invoiceNumber}?`)) {
            recordInvoice();
        }
    }
}

async function recordInvoice() {
    const invoiceData = {
        enquiry_id: parseInt(enquiryId),
        place_of_supply: document.getElementById('place_of_supply').value,
        invoice_number: document.getElementById('invoice_number').value,
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
            if (typeof showModal === 'function') {
                showModal('Success', 'Invoice recorded successfully!', 'success');
            } else {
                alert('Invoice recorded successfully!');
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
