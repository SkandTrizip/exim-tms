from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from typing import List
from backend.database import get_db
from backend.services.pricing_service import calculate_pricing
from backend.models.enquiry import Enquiry
from backend.models.quote import Quote, QuoteCharge
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
import io
from backend.utils.logger import logger

router = APIRouter()

@router.post("/calculate")
async def get_price_quote(pricing_params: dict, db: Session = Depends(get_db)):
    logger.info(f"Calculating pricing for params: {pricing_params.get('enquiry_id', 'Unknown Enquiry')}")
    return calculate_pricing(db, pricing_params)

@router.get("/pdf/{enquiry_id}")
async def generate_quote_pdf(enquiry_id: int, db: Session = Depends(get_db)):
    # Fetch Enquiry
    logger.info(f"Generating PDF quote for enquiry ID {enquiry_id}")
    enquiry = db.query(Enquiry).filter(Enquiry.id == enquiry_id).first()
    if not enquiry:
        logger.warning(f"PDF generation failed: Enquiry {enquiry_id} not found")
        raise HTTPException(status_code=404, detail="Enquiry not found")

    # Fetch Latest Quote for this Enquiry
    quote = db.query(Quote).filter(Quote.enquiry_id == enquiry_id).order_by(Quote.created_at.desc()).first()
    
    # Create PDF buffer
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    elements = []
    
    # Styles
    styles = getSampleStyleSheet()
    title_style = styles["Heading1"]
    normal_style = styles["Normal"]
    
    # Header
    elements.append(Paragraph(f"Price Quote", title_style))
    elements.append(Spacer(1, 12))
    
    # Client Info
    elements.append(Paragraph(f"<b>To:</b> {enquiry.client_name or 'Valued Client'}", normal_style))
    elements.append(Paragraph(f"<b>Date:</b> {quote.created_at.strftime('%Y-%m-%d') if quote else 'N/A'}", normal_style))
    elements.append(Spacer(1, 12))
    
    # Shipment Details
    data = [
        ["Origin", enquiry.origin],
        ["Destination", enquiry.destination],
        ["Commodity", enquiry.commodity],
        ["Container", enquiry.container_type]
    ]
    t = Table(data, colWidths=[2*inch, 4*inch])
    t.setStyle(TableStyle([
        ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
        ('GRID', (0,0), (-1,-1), 1, colors.black),
        ('BACKGROUND', (0,0), (0,-1), colors.lightgrey),
    ]))
    elements.append(t)
    elements.append(Spacer(1, 24))
    
    # Charges Tables
    grand_total = 0.0
    
    if quote:
        for container in sorted(quote.containers, key=lambda c: c.container_sequence):
            # Container Header
            elements.append(Paragraph(f"<b>Container: {container.container_type}</b>", styles["Heading3"]))
            elements.append(Spacer(1, 6))

            # Charges Data for this container
            container_charges_data = [["Description", "Amount (INR)"]]
            container_total = 0.0
            has_charges = False

            for charge in sorted(container.charges, key=lambda ch: (ch.charge_sequence, ch.id)):
                # Filter for "On Your Account" only
                if charge.account_type == "On Your Account":
                    container_charges_data.append([
                        charge.charge_description, 
                        f"{charge.final_inr_amount:.2f}"
                    ])
                    container_total += charge.final_inr_amount
                    has_charges = True
            
            if has_charges:
                # Add Subtotal for container
                container_charges_data.append(["Subtotal", f"{container_total:.2f}"])
                grand_total += container_total

                # Create Table
                t_container = Table(container_charges_data, colWidths=[4*inch, 2*inch])
                t_container.setStyle(TableStyle([
                    ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'), # Header bold
                    ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#2E4053')), # Header color
                    ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke), # Header text
                    ('ALIGN', (0,0), (-1,-1), 'LEFT'),
                    ('ALIGN', (1,1), (-1,-1), 'RIGHT'), # Amount right aligned
                    ('GRID', (0,0), (-1,-1), 1, colors.black),
                    ('FONTNAME', (0,-1), (-1,-1), 'Helvetica-Bold'), # Subtotal row bold
                    ('BACKGROUND', (0,-1), (-1,-1), colors.lightgrey), # Subtotal bg
                ]))
                elements.append(t_container)
                elements.append(Spacer(1, 12))
            else:
                elements.append(Paragraph("No charges on your account for this container.", normal_style))
                elements.append(Spacer(1, 12))

    # Grand Total
    elements.append(Spacer(1, 12))
    grand_total_data = [["Grand Total (INR)", f"{grand_total:.2f}"]]
    t_grand = Table(grand_total_data, colWidths=[4*inch, 2*inch])
    t_grand.setStyle(TableStyle([
        ('FONTNAME', (0,0), (-1,-1), 'Helvetica-Bold'),
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#1F618D')),
        ('TEXTCOLOR', (0,0), (-1,-1), colors.whitesmoke),
        ('ALIGN', (0,0), (0,0), 'LEFT'),
        ('ALIGN', (1,0), (1,0), 'RIGHT'),
        ('GRID', (0,0), (-1,-1), 1, colors.black),
        ('BOX', (0,0), (-1,-1), 2, colors.black),
    ]))
    elements.append(t_grand)
    
    # Build PDF
    doc.build(elements)
    
    # Return PDF
    buffer.seek(0)
    logger.info(f"Successfully generated PDF for enquiry {enquiry_id}")
    return Response(content=buffer.getvalue(), media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=quote_{enquiry.enquiry_number}.pdf"})
