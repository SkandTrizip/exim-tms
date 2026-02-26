
let enquiryId = null;
let currentEnquiry = null;

document.addEventListener('DOMContentLoaded', async function () {
    const urlParams = new URLSearchParams(window.location.search);
    enquiryId = urlParams.get('enquiry_id');

    if (!enquiryId) {
        alert('No enquiry ID provided');
        window.location.href = '/#finance';
        return;
    }

    await fetchEnquiryDetails();
    await fetchUploadedDocuments();
    await fetchFinanceStatus();

    // Initialize quick entry date
    const dateInput = document.getElementById('quick_pay_date');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
});

async function fetchEnquiryDetails() {
    try {
        const response = await fetch(`${CONFIG.API_URL}/api/enquiry/${enquiryId}`);
        if (response.ok) {
            currentEnquiry = await response.json();
            document.getElementById('display_enquiry_number').textContent = currentEnquiry.enquiry_number;
            document.getElementById('display_client_name').textContent = currentEnquiry.client_name;

            // Fetch quote info for price and shipping line
            const quoteRes = await fetch(`${CONFIG.API_URL}/api/quotes/enquiry/${enquiryId}`);
            if (quoteRes.ok) {
                const quotes = await quoteRes.json();
                const accepted = quotes.find(q => q.status === 'accepted') || quotes[0];
                if (accepted) {
                    document.getElementById('display_shipping_line').textContent = accepted.shipping_line || '---';

                    // Compute Shipping Line Total (what we pay = qty × rate × ex_rate)
                    // Compute Vendor Total (what we charge client = vendor_rate × qty × ex_rate)
                    let shippingLineTotal = 0;
                    let vendorTotal = 0;
                    (accepted.containers || []).forEach(c => {
                        (c.charges || []).forEach(ch => {
                            if (ch.account_type === 'On Your Account') {
                                shippingLineTotal += (ch.final_inr_amount || 0);
                                // vendor total: vendor_rate × qty × ex_rate (same formula)
                                const vRate = ch.vendor_rate || 0;
                                const qty = ch.quantity || 0;
                                const ex = ch.exchange_rate || 1;
                                const vTot = qty * vRate;
                                const vInr = ch.charged_on === 'Per BL' ? vTot : (ch.currency === 'USD' ? vTot * ex : vTot);
                                vendorTotal += vInr;
                            }
                        });
                    });

                    // Show Shipping Line total (payment to line)
                    const slEl = document.getElementById('display_final_quote');
                    if (slEl) slEl.textContent = `₹${Math.round(shippingLineTotal).toLocaleString()}`;

                    // Show Vendor total (invoice to client) if element exists
                    const vendorEl = document.getElementById('display_vendor_total');
                    if (vendorEl) vendorEl.textContent = `₹${Math.round(vendorTotal).toLocaleString()}`;

                    // Pre-fill payment amount with shipping line total
                    const payAmtEl = document.getElementById('quick_pay_amount');
                    if (payAmtEl && !payAmtEl.value) payAmtEl.value = Math.round(shippingLineTotal);
                }
            }
        }
    } catch (error) {
        console.error('Error fetching enquiry details:', error);
    }
}

async function fetchUploadedDocuments() {
    try {
        const response = await fetch(`${CONFIG.API_URL}/api/tracking/enquiry/${enquiryId}`);
        const listElement = document.getElementById('referenceDocumentsList');

        if (response.ok) {
            const documents = await response.json();

            if (documents && documents.length > 0) {
                listElement.innerHTML = '';
                documents.forEach(doc => {
                    const filename = doc.file_path.split(/[\\\/]/).pop();
                    const fileUrl = `${CONFIG.API_URL}/uploads/${filename}`;
                    const card = document.createElement('div');
                    card.style.cssText = 'padding: 12px; background: #f8fafc; border: 1px solid var(--border-light); border-radius: 6px; display: flex; align-items: center; gap: 12px;';

                    // Human readable type
                    const typeLabels = {
                        'bol': 'Bill of Lading',
                        'commercialInvoice': 'Commercial Invoice',
                        'packingList': 'Packing List',
                        'shippingInvoice': 'Shipping Invoice',
                        'shippingBill': 'Shipping Bill',
                        'originCert': 'Certificate of Origin',
                        'customsDeclaration': 'Customs Declaration',
                        'insuranceCert': 'Insurance Certificate',
                        'clientConfirm': 'Client Confirmation',
                        'booking': 'Booking Confirmation',
                        'draftSi': 'Draft SI',
                        'si': 'Shipping Instruction'
                    };

                    const label = typeLabels[doc.document_type] || doc.document_type;

                    card.innerHTML = `
                        <div style="width: 32px; height: 32px; background: white; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: var(--primary);">
                            <i class="fas fa-file-pdf"></i>
                        </div>
                        <div style="flex: 1; overflow: hidden;">
                            <div style="font-size: 11px; color: var(--text-tertiary); margin-bottom: 2px;">${label}</div>
                            <div style="font-size: 13px; font-weight: 600; color: var(--navy-800); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${doc.file_name}">${doc.file_name}</div>
                        </div>
                        <a href="${fileUrl}" target="_blank" class="btn btn-outline" style="padding: 4px 8px; font-size: 11px; white-space: nowrap;">
                            <i class="fas fa-eye"></i> View
                        </a>
                    `;
                    listElement.appendChild(card);
                });
            } else {
                listElement.innerHTML = '<p style="color: var(--text-tertiary); font-size: 14px;">No documents uploaded yet.</p>';
            }
        }
    } catch (error) {
        console.error('Error fetching documents:', error);
    }
}

async function fetchFinanceStatus() {
    try {
        const payRes = await fetch(`${CONFIG.API_URL}/api/finance/shipping-payment/${enquiryId}`);
        if (payRes.ok) {
            const payments = await payRes.json();
            populatePaymentsTable(payments);
        }
    } catch (error) {
        console.error('Error fetching finance status:', error);
    }
}

function populatePaymentsTable(payments) {
    const tbody = document.getElementById('paymentsTableBody');
    const totalEl = document.getElementById('totalPaymentsAmount');
    if (!tbody) return;

    if (!payments || payments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="padding: 24px; text-align: center; color: var(--text-tertiary);">No payments recorded yet.</td></tr>';
        totalEl.textContent = '₹0.00';
        return;
    }

    tbody.innerHTML = '';
    let total = 0;

    payments.forEach(p => {
        total += p.amount;
        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid #f1f5f9';
        row.innerHTML = `
            <td style="padding: 12px;">
                <span style="padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: ${p.payment_type === 'Main' ? '#ecfdf5; color: #059669;' : '#eff6ff; color: #2563eb;'}">
                    ${p.payment_type}
                </span>
            </td>
            <td style="padding: 12px; color: var(--navy-700);">${p.description || 'Main Payment'}</td>
            <td style="padding: 12px; font-family: monospace; font-weight: 600;">${p.utr_number}</td>
            <td style="padding: 12px;">${new Date(p.payment_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
            <td style="padding: 12px; text-align: right; font-weight: 700; color: var(--navy-800);">₹${p.amount.toLocaleString()}</td>
        `;
        tbody.appendChild(row);
    });

    totalEl.textContent = `₹${total.toLocaleString()}`;
}

/**
 * Modal Logic for Finance Details
 */
function openAdditionalChargeModal() {
    document.getElementById('additionalChargeModal').style.display = 'block';
    document.getElementById('add_charge_date').value = new Date().toISOString().split('T')[0];
}

function closeAdditionalChargeModal() {
    document.getElementById('additionalChargeModal').style.display = 'none';
    // Clear fields
    document.getElementById('add_charge_amount').value = '';
    document.getElementById('add_charge_desc').value = '';
}

function toggleDescription() {
    const type = document.getElementById('add_charge_type').value;
    document.getElementById('desc_group').style.display = type === 'Additional' ? 'block' : 'none';
}

function toggleQuickDesc() {
    const type = document.getElementById('quick_pay_type').value;
    document.getElementById('quick_desc_group').style.display = type === 'Additional' ? 'block' : 'none';
}

async function submitQuickPayment() {
    const type = document.getElementById('quick_pay_type').value;
    const desc = document.getElementById('quick_pay_desc').value;
    const amount = parseFloat(document.getElementById('quick_pay_amount').value);
    const date = document.getElementById('quick_pay_date').value;
    const utr = document.getElementById('quick_pay_utr').value;

    if (isNaN(amount) || amount <= 0 || !date || !utr) {
        alert('Please fill all required details correctly (Amount, Date, UTR)');
        return;
    }

    const payload = {
        enquiry_id: parseInt(enquiryId),
        utr_number: utr,
        payment_date: date,
        amount: amount,
        currency: 'INR',
        description: type === 'Main' ? 'Main Shipping Line Payment' : (desc || 'Additional Payment'),
        payment_type: type
    };

    try {
        const res = await fetch(`${CONFIG.API_URL}/api/finance/shipping-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            // Success!
            // Clear inputs
            document.getElementById('quick_pay_amount').value = '';
            document.getElementById('quick_pay_desc').value = '';
            document.getElementById('quick_pay_utr').value = '';

            // Refresh table
            await fetchFinanceStatus();
        } else {
            const err = await res.json();
            alert('Error: ' + (err.detail || 'Failed to save record'));
        }
    } catch (e) {
        console.error(e);
        alert('Network error while saving payment');
    }
}

async function submitFinancialPayment() {
    const type = document.getElementById('add_charge_type').value;
    const desc = document.getElementById('add_charge_desc').value;
    const amount = parseFloat(document.getElementById('add_charge_amount').value);
    const date = document.getElementById('add_charge_date').value;
    const utr = document.getElementById('add_charge_utr').value;

    if (isNaN(amount) || amount <= 0 || !date || !utr) {
        alert('Please fill all required details correctly');
        return;
    }

    const payload = {
        enquiry_id: parseInt(enquiryId),
        utr_number: utr,
        payment_date: date,
        amount: amount,
        currency: 'INR',
        description: type === 'Main' ? 'Main Shipping Line Payment' : desc,
        payment_type: type
    };

    try {
        const res = await fetch(`${CONFIG.API_URL}/api/finance/shipping-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            closeAdditionalChargeModal();
            // Refresh table
            await fetchFinanceStatus();
        } else {
            const err = await res.json();
            alert('Error: ' + (err.detail || 'Failed to save'));
        }
    } catch (e) {
        console.error(e);
        alert('Network error');
    }
}

function applyFinanceState(state) {
    const mapping = {
        'pay_line': { check: 'fin_payment_line', date: 'date_payment_line' },
        'inv_raised': { check: 'fin_invoice_raised', date: 'date_invoice_raised' },
        'pay_client': { check: 'fin_payment_client', date: 'date_payment_client' }
    };

    Object.entries(mapping).forEach(([key, fields]) => {
        if (state[key]) {
            document.getElementById(fields.check).checked = true;
            document.getElementById(fields.date).textContent = new Date(state[key]).toLocaleDateString();
        }
    });

    // Handle payment details
    if (state.utr_number) document.getElementById('pay_utr_number').value = state.utr_number;
    if (state.payment_date) {
        // Convert to YYYY-MM-DD for date input
        const d = new Date(state.payment_date);
        const dateStr = d.toISOString().split('T')[0];
        document.getElementById('pay_date').value = dateStr;
    }
    if (state.payment_amount) document.getElementById('pay_amount').value = state.payment_amount;

    // Handle invoice file preview if exists (logic would go here)
}

function updateFinDate(checkbox, dateId) {
    const dateEl = document.getElementById(dateId);
    if (checkbox.checked) {
        dateEl.textContent = new Date().toLocaleDateString();
    } else {
        dateEl.textContent = '-';
    }
}

function handleFileUpload(input, fileNameId) {
    if (input.files && input.files[0]) {
        document.getElementById(fileNameId).textContent = input.files[0].name;
    }
}


function handleLogout() {
    localStorage.removeItem('user');
    window.location.href = '/login';
}
