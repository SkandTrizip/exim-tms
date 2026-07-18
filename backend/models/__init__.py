# This file makes the models directory a Python package
# Import all models to ensure they are registered with SQLAlchemy
from backend.models.enquiry import Enquiry
from backend.models.pricing import Pricing
from backend.models.quote import Quote, QuoteContainer, QuoteCharge
from backend.models.final_quote import FinalQuote, FinalQuoteContainer, FinalQuoteCharge
from backend.models.port import PortCode
from backend.models.tracking import Tracking
from backend.models.billing import Billing
from backend.models.document import ShipmentDocument
from backend.models.user import User
from backend.models.shipment_status import ShipmentStatus
from backend.models.client_master import ClientMaster
from backend.models.client_origin import ClientOrigin
from backend.models.finance import ShippingPayment, OverheadPayment
from backend.models.invoice import Invoice
from backend.models.shipping_line import ShippingLine as ShippingLineModel
from backend.models.enquiry_economics import EnquiryEconomics
from backend.models.overhead import Overhead
from backend.models.payee import Payee

__all__ = [
    "Enquiry",
    "Pricing",
    "Quote",
    "QuoteContainer",
    "QuoteCharge",
    "PortCode",
    "Tracking",
    "Billing",
    "ShipmentDocument",
    "User",
    "ShipmentStatus",
    "ClientMaster",
    "ClientOrigin",
    "ShippingPayment",
    "OverheadPayment",
    "Invoice",
    "ShippingLineModel",
    "EnquiryEconomics",
    "Overhead",
    "Payee",
]
