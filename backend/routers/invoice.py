from fastapi import APIRouter, Depends, HTTPException, Response, Query
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models.enquiry import Enquiry
from backend.models.quote import Quote
from backend.models.shipment_status import ShipmentStatus
from backend.models.client_master import ClientMaster
from backend.models.invoice import Invoice
from pydantic import BaseModel

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, mm
import io
import datetime
import os
from backend.utils.logger import logger

router = APIRouter(prefix="/invoice", tags=["Invoice"])

from typing import Optional


def _client_rate_for_invoice(charge) -> Optional[float]:
    """
    Client rate (vendor_rate) only — no shipping-line fallback.
    Returns None when rate is empty/zero (charge not billed on client invoice).
    """
    if charge.vendor_rate is None:
        return None
    try:
        rate = float(charge.vendor_rate)
    except (TypeError, ValueError):
        return None
    if rate <= 0:
        return None
    return rate

class InvoiceCreate(BaseModel):
    enquiry_id: int
    invoice_number: str
    invoice_date: datetime.date
    payment_due_date: datetime.date
    place_of_supply: str
    customer_invoice_no: Optional[str] = None
    irn: Optional[str] = None
    item_type: str = "all"

class InvoicePayment(BaseModel):
    payment_date: datetime.date
    payment_type: str = "NEFT"
    payment_reference: str
    received_amount: float

@router.post("/record")
def record_invoice(invoice: InvoiceCreate, db: Session = Depends(get_db)):
    logger.info(f"Recording invoice {invoice.invoice_number} for enquiry ID {invoice.enquiry_id}")
    try:
        # Check if invoice number already exists
        existing_inv = db.query(Invoice).filter(Invoice.invoice_number == invoice.invoice_number).first()
        if existing_inv:
            logger.warning(f"Failed to record invoice: Number {invoice.invoice_number} already exists")
            raise HTTPException(status_code=400, detail="Invoice number already exists")

        # Only pass fields that exist on the SQLAlchemy model.
        # This avoids 500s if the Pydantic schema has extra keys (e.g. `item_type`)
        # while the DB/model doesn't.
        allowed_fields = set(Invoice.__table__.columns.keys())
        payload = {k: v for k, v in invoice.dict().items() if k in allowed_fields}

        new_invoice = Invoice(**payload)
        db.add(new_invoice)
        db.commit()
        db.refresh(new_invoice)
        logger.info(f"Successfully recorded invoice {invoice.invoice_number} with ID {new_invoice.id}")
        return {"message": "Invoice recorded successfully", "id": new_invoice.id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.exception(
            "Error recording invoice",
            extra={"enquiry_id": invoice.enquiry_id, "invoice_number": invoice.invoice_number},
        )
        # Return JSON error (so the frontend doesn't fail JSON.parse on plain-text 500 responses)
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/details/{enquiry_id}")
def get_invoice_details(enquiry_id: int, db: Session = Depends(get_db)):
    invoice = db.query(Invoice).filter(Invoice.enquiry_id == enquiry_id).first()
    if not invoice:
        # Return empty or 404? 
        # Better to return null so frontend knows to show empty form
        return None
    return invoice

@router.get("/list")
def list_all_invoices(db: Session = Depends(get_db)):
    """List all recorded invoices for payment tracking"""
    invoices = db.query(
            Invoice,
            Enquiry.enquiry_number,
            Enquiry.client_name,
            Enquiry.origin,
            Enquiry.destination,
        )\
        .join(Enquiry, Invoice.enquiry_id == Enquiry.id)\
        .order_by(Invoice.created_at.desc()).all()
    
    result = []
    for inv, enq_num, client, origin, destination in invoices:
        inv_dict = {
            "id": inv.id,
            "enquiry_id": inv.enquiry_id,
            "invoice_number": inv.invoice_number,
            "invoice_date": inv.invoice_date,
            "payment_due_date": inv.payment_due_date,
            "place_of_supply": inv.place_of_supply,
            "enquiry_number": enq_num,
            "client_name": client,
            "origin": origin or "",
            "destination": destination or "",
            "is_paid": inv.is_paid,
            "payment_date": inv.payment_date,
            "payment_type": inv.payment_type,
            "payment_reference": inv.payment_reference,
            "received_amount": inv.received_amount,
            "status": inv.status,
            "item_type": getattr(inv, "item_type", "all")
        }
        result.append(inv_dict)
    return result

@router.put("/payment/{invoice_id}")
def record_invoice_payment(invoice_id: int, payment: InvoicePayment, db: Session = Depends(get_db)):
    """Record payment for a specific invoice"""
    db_invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not db_invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    db_invoice.is_paid = True
    db_invoice.payment_date = payment.payment_date
    db_invoice.payment_type = payment.payment_type
    db_invoice.payment_reference = payment.payment_reference
    db_invoice.received_amount = payment.received_amount
    
    # Also update shipment status if exists
    status = db.query(ShipmentStatus).filter(ShipmentStatus.enquiry_id == db_invoice.enquiry_id).first()
    if status:
        status.pay_client = datetime.datetime.combine(payment.payment_date, datetime.time.min)
        status.utr_number = payment.payment_reference
        status.payment_amount = int(payment.received_amount)
    
    db.commit()
    logger.info(f"Payment recorded for invoice {db_invoice.invoice_number}")
    return {"message": "Payment recorded successfully"}


@router.get("/generate/{enquiry_id}")
async def generate_invoice_pdf(
    enquiry_id: int, 
    invoice_number: str,
    invoice_date: str,
    invoice_type: str = "draft",  # 'draft' or 'tax'
    place_of_supply: str = "06AAFCL3674H1ZE/Gurugram",
    roe: float = Query(...),
    irn: str = None,
    customer_invoice_no: Optional[str] = None,
    item_type: str = "all",      # 'all', 'main', or 'additional'
    db: Session = Depends(get_db)
):
    # 1. Validate mandatory fields
    if roe is None or roe <= 0:
        logger.warning(f"Invoice generation blocked: Exchange Rate (ROE) is mandatory but was not provided or is invalid (enquiry_id={enquiry_id})")
        raise HTTPException(
            status_code=422,
            detail="Exchange Rate (ROE) is mandatory and must be a positive number. Please enter the Exchange Rate before generating the invoice."
        )

    # 2. Fetch Data
    logger.info(f"Generating invoice PDF for enquiry ID {enquiry_id}")
    enquiry = db.query(Enquiry).filter(Enquiry.id == enquiry_id).first()
    if not enquiry:
        logger.warning(f"Failed to generate invoice PDF: Enquiry {enquiry_id} not found")
        raise HTTPException(status_code=404, detail="Enquiry not found")

    # Fetch accepted quote or latest quote
    quote = db.query(Quote).filter(Quote.enquiry_id == enquiry_id, Quote.status == 'accepted').first()
    if not quote:
         quote = db.query(Quote).filter(Quote.enquiry_id == enquiry_id).order_by(Quote.created_at.desc()).first()
    
    if not quote:
        raise HTTPException(status_code=404, detail="No accepted quote found for this enquiry")

    # Fetch Shipment Status for Invoice Details (Invoice No, Date, etc.)
    status = db.query(ShipmentStatus).filter(ShipmentStatus.enquiry_id == enquiry_id).first()

    # If IRN not passed as query param, try fetching from saved Invoice record
    if not irn:
        saved_inv = db.query(Invoice).filter(Invoice.enquiry_id == enquiry_id).first()
        if saved_inv and saved_inv.irn:
            irn = saved_inv.irn

    # Fetch Client Data
    # Assuming ClientMaster is linked via enquiry.client_name or similar? 
    # For now, use enquiry details.

    # 3. PDF Setup
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=15, leftMargin=15, topMargin=20, bottomMargin=20)
    elements = []
    styles = getSampleStyleSheet()
    
    # Custom Styles
    header_style = ParagraphStyle(
        'HeaderStyle',
        parent=styles['Normal'],
        fontSize=10,
        leading=12,
        alignment=0, # Left
        textColor=colors.black
    )
    
    title_style = ParagraphStyle(
        'TitleStyle',
        parent=styles['Heading1'],
        fontSize=14,
        alignment=1, # Center
        spaceAfter=10
    )

    # 3. Header
    # Left Column: Logo
    logo_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "logipod_logo.jpg")
    header_logo_elements = []
    if os.path.exists(logo_path):
        img = Image(logo_path)
        img.drawHeight = 0.8*inch 
        img.drawWidth = 1.6*inch # Aspect ratio
        img.hAlign = 'LEFT'
        header_logo_elements.append(img)

    # Right Column: Company Details
    header_text_elements = []
    header_text_elements.append(Paragraph("<b>LOGIPOD LOGISTICS PRIVATE LIMITED</b>", 
                              ParagraphStyle('HeaderBold', parent=header_style, fontSize=12, spaceAfter=2)))
    header_text_elements.append(Paragraph("<b>HEAD-OFFICE ADDRESS:</b>", 
                              ParagraphStyle('HeaderBold', parent=header_style, fontSize=8, spaceAfter=1)))
    header_text_elements.append(Paragraph("LOGIPOD LOGISTICS PRIVATE LIMITED, ENKAY SQUARE, 3rd FLOOR, 448A,UDYOG VIHAR PHASE 5,GURUGRAM, HARYANA, PIN:122016", 
                              ParagraphStyle('HeaderNormal', parent=header_style, fontSize=8, leading=10)))
    header_text_elements.append(Paragraph("[Contact Phone: +91 9988553772] GSTIN: 06AAFCL3674H1ZE", 
                              ParagraphStyle('HeaderNormal', parent=header_style, fontSize=8, leading=10)))
    
    # Header Table
    header_data = [[header_logo_elements, header_text_elements]]
    t_header = Table(header_data, colWidths=[2.0*inch, 5.5*inch])
    t_header.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
    ]))
    elements.append(t_header)

    elements.append(Spacer(1, 10))
    
    # ... Imports ...
    from backend.models.client_origin import ClientOrigin
    from backend.models.client_master import ClientMaster
    from backend.utils.client_utils import strip_branch_suffix

    # Strip branch suffix before lookup: "Acme_Mumbai" → "Acme"
    base_client_name = strip_branch_suffix(enquiry.client_name)
    client_origin = db.query(ClientOrigin).filter(ClientOrigin.unique_client_name == base_client_name).first()
    client_master = None
    if client_origin:
        # Try to find the specific branch that matches the stored client_name
        client_master = db.query(ClientMaster).filter(
            ClientMaster.origin_id == client_origin.id,
            ClientMaster.client_name == enquiry.client_name
        ).first()
        if not client_master:
            # Fallback to first/main branch
            client_master = db.query(ClientMaster).filter(ClientMaster.origin_id == client_origin.id).first()
    
    # Always use the clean company name (without branch suffix) on the invoice
    cust_name = client_origin.unique_client_name if client_origin else base_client_name
    cust_addr = client_origin.office_address if client_origin else "Address specific to client..."
    cust_gst = client_origin.gst_no if client_origin else "N/A"
    cust_code = client_master.client_code if client_master else "N/A"

    cust_invoice_no = (customer_invoice_no or "").strip()
    if not cust_invoice_no:
        saved_inv = db.query(Invoice).filter(Invoice.enquiry_id == enquiry_id).first()
        if saved_inv and getattr(saved_inv, "customer_invoice_no", None):
            cust_invoice_no = (saved_inv.customer_invoice_no or "").strip()
    if not cust_invoice_no:
        cust_invoice_no = "N/A"
    
    shipper_val = "N/A"
    if client_master:
        shipper_val = f"{client_master.client_name}<br/>{client_master.office_address}"
    elif client_origin:
        shipper_val = f"{client_origin.unique_client_name}<br/>{client_origin.office_address}"
        
    consignee_val = status.consignee if (status and status.consignee) else "N/A"
    por = status.port_of_origin if status else "N/A"
    pod = status.final_destination if status else "N/A"
    vessel = status.vessel if status else "N/A"
    voyage = status.voyage if status else "N/A"
    etd = status.etd.strftime("%d-%b-%y") if (status and status.etd) else "N/A"
    eta = status.eta.strftime("%d-%b-%y") if (status and status.eta) else "N/A"
    master_no = status.master_number if status else "N/A"
    reverse_charge = "No"
    
    job_no = enquiry.enquiry_number or "N/A"
    job_date = enquiry.created_at.strftime("%d-%b-%y")
    # When HBL is required, House Number on invoice = Job Number (sale/enquiry no.)
    if getattr(enquiry, "hbl_required", False) and job_no != "N/A":
        house_no = job_no
    else:
        house_no = "N/A"
    
    inv_no_val = invoice_number if invoice_number else "INV-DRAFT"
    inv_date_val = invoice_date if invoice_date else datetime.date.today().strftime("%d-%b-%y")
    try:
        if "-" in inv_date_val and len(inv_date_val) == 10: 
             inv_date_val = datetime.datetime.strptime(inv_date_val, "%Y-%m-%d").strftime("%d-%b-%y")
    except:
        pass
        
    due_date_val = "N/A"
    if client_master and client_master.credit_period:
        try:
             d = datetime.datetime.strptime(inv_date_val, "%d-%b-%y")
             due = d + datetime.timedelta(days=client_master.credit_period)
             due_date_val = due.strftime("%d-%b-%y")
        except:
             pass
    
    # --- Layout Construction ---
    
    # DRAFT - INVOICE or TAX INVOICE Header
    is_tax = invoice_type and invoice_type.lower() == "tax"
    title_text = "<b>TAX INVOICE</b>" if is_tax else "<b>DRAFT - INVOICE</b>"
    title_color = colors.HexColor('#1a3a5c') if is_tax else colors.black
    title_box = Table([[Paragraph(title_text, ParagraphStyle('TitleBox', parent=styles['Heading3'], alignment=1, fontSize=11, textColor=title_color))]], colWidths=[7.5*inch])
    title_box.setStyle(TableStyle([
        ('BOX', (0,0), (-1,-1), 1, colors.black),
        ('TOPPADDING', (0,0), (-1,-1), 2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
    ]))
    elements.append(title_box)
    elements.append(Spacer(1, 5))
    
    # Styles for details
    label_style = ParagraphStyle('LabelStyle', parent=styles['Normal'], fontSize=7, leading=8, fontName='Helvetica-Bold')
    value_style = ParagraphStyle('ValueStyle', parent=styles['Normal'], fontSize=7, leading=8, fontName='Helvetica')
    # firstLineIndent keeps wrap lines aligned with the first character of the value text
    value_wrap_style = ParagraphStyle('ValueWrap', parent=styles['Normal'], fontSize=7, leading=8,
                                      fontName='Helvetica', leftIndent=0)

    def kv_row(label, value):
        """Label column gets the colon; value column is plain text so word-wrap aligns cleanly."""
        return [Paragraph(f"{label} :", label_style), Paragraph(str(value), value_wrap_style)]

    # Left Column Data
    left_col_data = []
    left_col_data.append(kv_row("Customer", f"{cust_name}<br/>{cust_addr}<br/>GST ID: {cust_gst}"))
    left_col_data.append([Spacer(1, 2), Spacer(1, 2)])
    left_col_data.append(kv_row("Shipper", shipper_val))
    left_col_data.append([Spacer(1, 2), Spacer(1, 2)])
    left_col_data.append(kv_row("Consignee", consignee_val))
    left_col_data.append([Spacer(1, 2), Spacer(1, 2)])
    left_col_data.append(kv_row("Port of Origin", por))
    left_col_data.append(kv_row("Final Destination", pod))
    left_col_data.append(kv_row("Vessel", vessel))
    left_col_data.append(kv_row("Voyage Number", voyage))
    container_no = (status.container_number or "").strip() if status else ""
    if container_no:
        left_col_data.append(kv_row("Container No.", container_no))
    
    # Right Column Data
    right_col_data = []
    right_col_data.append(kv_row("Customer Code", cust_code))
    right_col_data.append(kv_row("Customer Invoice No.", cust_invoice_no))
    right_col_data.append([Spacer(1, 2), Spacer(1, 2)])
    right_col_data.append(kv_row("Invoice Number", inv_no_val))
    # IRN: 64-char hash — same font size as other fields, wraps naturally in the column
    irn_display = irn if irn else ""
    right_col_data.append(kv_row("IRN", irn_display))
    right_col_data.append([Spacer(1, 2), Spacer(1, 2)])
    right_col_data.append(kv_row("Date", inv_date_val))
    right_col_data.append(kv_row("Payment Due Date", due_date_val))
    right_col_data.append(kv_row("Job Number", job_no))
    right_col_data.append(kv_row("Job Date", job_date))
    right_col_data.append(kv_row("Master Number", master_no))
    right_col_data.append(kv_row("House Number", house_no))
    right_col_data.append(kv_row("Reverse Charge", reverse_charge))
    right_col_data.append(kv_row("Place of Supply", place_of_supply if place_of_supply else "GUJARAT"))
    
    left_table = Table(left_col_data, colWidths=[1.35*inch, 2.65*inch])
    left_table.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'TOP')]))

    right_table = Table(right_col_data, colWidths=[1.35*inch, 1.85*inch])
    right_table.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'TOP')]))
    
    main_details_table = Table([[left_table, right_table]], colWidths=[4.0*inch, 3.5*inch])
    main_details_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
    ]))
    elements.append(main_details_table)
    elements.append(Spacer(1, 10))
    
    # Charge Details Table
    col_widths = [0.4*inch, 1.3*inch, 0.6*inch, 0.4*inch, 0.7*inch, 0.4*inch, 0.7*inch, 0.45*inch, 0.75*inch, 0.4*inch, 0.65*inch, 0.85*inch]
    headers = ["SNo.", "Charge Details", "HSN/SAC", "Curr.", "Rate / Unit", "Unit", "Curr. Amt", "ROE", "Taxable Amt", "Rate", "IGST", "Amt in INR"]
    
    table_data = [headers]
    grand_total_inr = 0.0
    sn = 1
    
    # Styles for table
    t_style_header = ParagraphStyle('THeader', parent=styles['Normal'], fontSize=6, fontName='Helvetica-Bold', alignment=1)
    t_style_row = ParagraphStyle('TRow', parent=styles['Normal'], fontSize=6, fontName='Helvetica', alignment=1)
    t_style_row_left = ParagraphStyle('TRowLeft', parent=styles['Normal'], fontSize=6, fontName='Helvetica', alignment=0)
    
    # Re-map headers to Paragraphs
    table_data[0] = [Paragraph(h, t_style_header) for h in headers]

    # ROE is validated as mandatory at the start — use it directly
    current_roe = roe
    
    if item_type in ["all", "main"]:
        for container in sorted(quote.containers, key=lambda c: c.container_sequence):
            for charge in sorted(container.charges, key=lambda ch: (ch.charge_sequence, ch.id)):
                if charge.account_type != "On Your Account":
                    continue

                vendor_rate_per_unit = _client_rate_for_invoice(charge)
                if vendor_rate_per_unit is None:
                    continue

                desc_lower = charge.charge_description.lower()

                # Determine SAC and GST pct
                sac_code = "996511"  # Default
                if "ocean freight" in desc_lower or "freight" in desc_lower:
                    sac_code = "996521"
                    gst_pct = 5.0
                elif "bl fee" in desc_lower or "bl charge" in desc_lower:
                    sac_code = "996799"
                    gst_pct = 18.0
                elif "origin thc" in desc_lower or "origin terminal" in desc_lower:
                    sac_code = "996711"
                    gst_pct = 18.0
                elif "seal charge" in desc_lower or "seal fee" in desc_lower:
                    sac_code = "996799"
                    gst_pct = 18.0
                elif "facilitation" in desc_lower:
                    sac_code = "996711"
                    gst_pct = 18.0
                else:
                    gst_pct = 18.0

                qty = charge.quantity
                curr = charge.currency

                unit_val = f"{qty:.2f}"
                rate_val = f"{vendor_rate_per_unit:.2f}"

                # Vendor Total = vendor_rate × qty × ex_rate  (same formula as shipping line)
                curr_amt = vendor_rate_per_unit * qty
                if curr == "USD":
                    roe_display = current_roe
                    taxable_amt = curr_amt * roe_display
                else:
                    roe_display = 1.0
                    taxable_amt = curr_amt

                igst_amt = taxable_amt * (gst_pct / 100.0)
                total_inr = taxable_amt + igst_amt
                grand_total_inr += total_inr

                row = [
                    Paragraph(str(sn), t_style_row),
                    Paragraph(charge.charge_description, t_style_row_left),
                    Paragraph(sac_code, t_style_row),
                    Paragraph(curr, t_style_row),
                    Paragraph(rate_val, t_style_row),
                    Paragraph(unit_val, t_style_row),
                    Paragraph(f"{curr_amt:.2f}", t_style_row),
                    Paragraph(f"{roe_display:.2f}", t_style_row),
                    Paragraph(f"{taxable_amt:.2f}", t_style_row),
                    Paragraph(f"{gst_pct:.0f}%", t_style_row),
                    Paragraph(f"{igst_amt:.2f}", t_style_row),
                    Paragraph(f"{total_inr:.2f}", t_style_row),
                ]
                table_data.append(row)
                sn += 1
            
    # --- Add Additional Shipping Line Invoices (from tracking info metadata) ---
    if item_type in ["all", "additional"]:
        from backend.models.document import ShipmentDocument
        additional_docs = db.query(ShipmentDocument).filter(
            ShipmentDocument.enquiry_id == enquiry_id,
            ShipmentDocument.document_type == "additionalInvoice"
        ).all()

        for add_doc in additional_docs:
            metadata = add_doc.metadata_info or {}
            desc_val = metadata.get("charge_details", "Additional Charge")
            desc_lower = desc_val.lower()
            
            # Determine SAC and GST
            sac_code = metadata.get("hsn_sac", "996511")
            if "ocean freight" in desc_lower or "freight" in desc_lower:
                gst_pct = 5.0
            elif "bl fee" in desc_lower or "bl charge" in desc_lower:
                gst_pct = 18.0
            elif "origin thc" in desc_lower or "origin terminal" in desc_lower:
                gst_pct = 18.0
            elif "seal charge" in desc_lower or "seal fee" in desc_lower:
                gst_pct = 18.0
            elif "facilitation" in desc_lower:
                gst_pct = 18.0
            else:
                gst_pct = 18.0

            try:
                curr_amt = float(metadata.get("amount", 0))
            except (ValueError, TypeError):
                curr_amt = 0.0
                
            curr = "INR"
            
            if curr == "USD":
                roe_display = current_roe
                taxable_amt = curr_amt * roe_display
            else:
                roe_display = 1.0
                taxable_amt = curr_amt

            igst_amt = taxable_amt * (gst_pct / 100.0)
            total_inr = taxable_amt + igst_amt
            grand_total_inr += total_inr

            table_data.append([
                Paragraph(str(sn), t_style_row),
                Paragraph(desc_val, t_style_row_left),
                Paragraph(sac_code, t_style_row),
                Paragraph(curr, t_style_row),
                Paragraph(f"{curr_amt:.2f}", t_style_row), # Rate
                Paragraph("1.00", t_style_row),           # Qty
                Paragraph(f"{curr_amt:.2f}", t_style_row), # Curr Amt
                Paragraph(f"{roe_display:.2f}", t_style_row),
                Paragraph(f"{taxable_amt:.2f}", t_style_row),
                Paragraph(f"{gst_pct:.0f}%", t_style_row),
                Paragraph(f"{igst_amt:.2f}", t_style_row),
                Paragraph(f"{total_inr:.2f}", t_style_row),
            ])
            sn += 1
            
    # Total Row
    total_val = Paragraph(f"<b>{grand_total_inr:.2f}</b>", t_style_row)
    table_data.append(['', 'Total', '', '', '', '', '', '', '', '', '', total_val])

    t_charges = Table(table_data, colWidths=col_widths, repeatRows=1)
    t_charges.setStyle(TableStyle([
        ('GRID', (0,0), (-1,-1), 0.5, colors.black),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('SPAN', (1,-1), (10,-1)), 
        ('ALIGN', (1,-1), (10,-1), 'RIGHT'), 
        ('FONTNAME', (0,-1), (-1,-1), 'Helvetica-Bold'),
        ('TOPPADDING', (0,0), (-1,-1), 2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
    ]))
    
    elements.append(t_charges)
    elements.append(Spacer(1, 10))

    # 7. Terms and Conditions & Bank Details
    
    # Terms
    terms_text = """
    <b>Terms and Conditions:</b><br/>
    1. DD should be made out to <b>LOGIPOD LOGISTICS PRIVATE LIMITED</b>. The company is not responsible for any cash settlement without an official receipt.<br/>
    2. Any discrepancy should be notified to us in writing within 7 days from the invoice date, otherwise it will be presumed that the amount reflected on the bill is correct and have been verified at your end. Payment must be received within the agreed credit period, failing which interest @24% per annum will be charged on overdue invoices. All Objections/Claims are subject to Gurugram Jurisdiction.
    """
    elements.append(Paragraph(terms_text, ParagraphStyle('TermsStyle', parent=styles['Normal'], fontSize=6, leading=8)))
    elements.append(Spacer(1, 5))

    # Bank Details Table (Single Account)
    bank_style = ParagraphStyle('BankStyle', parent=styles['Normal'], fontSize=7, leading=9)
    
    bank_info = """<b><u>Bank Details for Payment</u></b><br/>
    <b>Account Name:</b> LOGIPOD LOGISTICS PRIVATE LIMITED<br/>
    <b>Bank Name:</b> STATE BANK OF INDIA<br/>
    <b>Account Number:</b> 44327943415<br/>
    <b>IFSC Code:</b> SBIN0050933<br/>
    <b>Branch:</b> GURGAON - MID CORPORATE<br/>
    <b>Branch Address:</b> Plot No. 91, IDC, 1st Floor, MG Road, Gurgaon 122001
    """
    
    bank_data = [[Paragraph(bank_info, bank_style)]]
    
    t_bank = Table(bank_data, colWidths=[7.0*inch])
    t_bank.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
        ('PADDING', (0,0), (-1,-1), 5),
    ]))
    
    elements.append(t_bank)
    elements.append(Spacer(1, 10))
    
    # 8. Signature Area
    sig_data = [
        ["", "For LOGIPOD LOGISTICS PRIVATE LIMITED"],
        ["", ""],
        ["", ""],
        ["", "Authorized Signatory"]
    ]
    t_sig = Table(sig_data, colWidths=[4*inch, 3*inch])
    t_sig.setStyle(TableStyle([
        ('ALIGN', (1,0), (1,-1), 'CENTER'),
        ('FONTNAME', (1,0), (1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (1,0), (1,0), 8),
    ]))
    elements.append(t_sig)

    # Build PDF
    doc.build(elements)
    buffer.seek(0)
    
    filename = f"INV_{enquiry.enquiry_number}.pdf"
    logger.info(f"Successfully generated invoice PDF {filename} for enquiry {enquiry_id}")
    return Response(content=buffer.getvalue(), media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename={filename}"})
