
let invoiceId = null;
let currentInvoice = null;

document.addEventListener('DOMContentLoaded', async function () {
    const urlParams = new URLSearchParams(window.location.search);
    invoiceId = urlParams.get('invoice_id');

    if (!invoiceId) {
        alert('No invoice ID provided');
        window.location.href = '/#finance-received';
        return;
    }

    await fetchInvoiceDetails();

    // Initialize date
    const dateInput = document.getElementById('payment_date');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
});

async function fetchInvoiceDetails() {
    try {
        const response = await fetch(`${CONFIG.API_URL}/api/invoice/list`);
        if (response.ok) {
            const invoices = await response.json();
            currentInvoice = invoices.find(inv => inv.id == invoiceId);

            if (currentInvoice) {
                document.getElementById('display_invoice_number').textContent = currentInvoice.invoice_number;
                document.getElementById('display_enquiry_number').textContent = currentInvoice.enquiry_number;
                document.getElementById('display_client_name').textContent = currentInvoice.client_name;
                document.getElementById('display_invoice_date').textContent = new Date(currentInvoice.invoice_date).toLocaleDateString();
                document.getElementById('display_payment_status').textContent = currentInvoice.is_paid ? 'Paid' : 'Pending';

                if (currentInvoice.is_paid) {
                    document.getElementById('payment_date').value = currentInvoice.payment_date;
                    document.getElementById('payment_reference').value = currentInvoice.payment_reference || '';
                    document.getElementById('received_amount').value = currentInvoice.received_amount || 0;
                }
            } else {
                alert('Invoice not found');
                window.location.href = '/#finance-received';
            }
        }
    } catch (error) {
        console.error('Error fetching invoice details:', error);
    }
}

async function savePayment() {
    const date = document.getElementById('payment_date').value;
    const ref = document.getElementById('payment_reference').value;
    const amount = parseFloat(document.getElementById('received_amount').value);

    if (isNaN(amount) || amount <= 0 || !date || !ref) {
        alert('Please fill all required details (Date, Amount, Reference)');
        return;
    }

    const payload = {
        payment_date: date,
        payment_reference: ref,
        received_amount: amount
    };

    try {
        const response = await fetch(`${CONFIG.API_URL}/api/invoice/payment/${invoiceId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            alert('Payment recorded successfully');
            window.location.href = '/#finance-received';
        } else {
            const err = await response.json();
            alert('Error: ' + (err.detail || 'Failed to save payment'));
        }
    } catch (error) {
        console.error('Error saving payment:', error);
        alert('Network error while saving payment');
    }
}

function handleLogout() {
    localStorage.removeItem('user');
    window.location.href = '/login';
}
