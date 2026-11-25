# Requirements: Zoho Payables & Receivables Integration

| | |
|---|---|
| **Document** | Zoho Books Integration — Bills & Invoices |
| **System** | Exim TMS (ShipFlow) |
| **Zoho product** | Zoho Books |
| **Version** | 1.0 |
| **Status** | Draft for review |

---

## 1. Purpose

Integrate Exim TMS with Zoho Books so that:

1. **Payables (Bills)** — After Operations or Admin approval, vendor/shipping-line bills are booked in Zoho; **UTR** (payment reference) is synced back from Zoho into TMS.
2. **Receivables (Invoices)** — After Operations or Admin approval, customer tax invoices are booked in Zoho; **IRN** is synced back from Zoho into TMS.

TMS remains the source of operational truth for shipment data and approval. Zoho remains the source of accounting truth for books, e-invoicing (IRN), and bank payment references (UTR).

---

## 2. Scope

| In scope | Out of scope (v1) |
|---|---|
| Auto-create Zoho **Bill** on payable approval | Chart of accounts redesign in Zoho |
| Auto-create Zoho **Invoice** on receivable approval | Manual bill/invoice creation *only* in Zoho (bypass TMS) |
| Sync **UTR** from Zoho payments → TMS payables | Full bank reconciliation UI in TMS |
| Sync **IRN** from Zoho e-invoice → TMS invoice | Credit notes / debit notes (phase 2) |
| Retry, status tracking, and audit of sync jobs | Multi-org Zoho (single org in v1) |
| Master mapping: Client, Vendor/Payee, Taxes, Items | Zoho Inventory / Payroll |

---

## 3. Trigger — When records are raised in Zoho

| Document | Trigger in TMS | Action in Zoho |
|---|---|---|
| **Bill (Payable)** | Operations **or** Admin approves / finalises a bill entry (shipping payment, overhead, or equivalent payable) | Create **Bill** in Zoho Books |
| **Invoice (Receivable)** | Operations **or** Admin approves / raises a tax invoice in TMS | Create **Invoice** in Zoho Books |

Rules:

- Raise in Zoho **only after** approval (or Admin direct entry that implies approval). Drafts in TMS must **not** create Zoho documents.
- One TMS payable → one Zoho Bill; one TMS invoice → one Zoho Invoice (idempotent by TMS document id).
- Failed pushes must be retriable without creating duplicates.
- Store Zoho document id / number on the TMS record for linkage and status display.

---

## 4. Payables — Bill booking & UTR sync

### 4.1 Bill booking (TMS → Zoho)

On approval, TMS pushes bill data to Zoho, including at minimum:

| Field group | Examples |
|---|---|
| Vendor / payee | Mapped Zoho contact (shipping line or payee master) |
| Reference | Enquiry / job no., TMS bill/payment id |
| Dates | Bill date, due date |
| Lines | Description, amount, currency, tax (as configured) |
| Classification | Main vs additional / overhead type where applicable |

### 4.2 UTR sync (Zoho → TMS)

| Requirement | Detail |
|---|---|
| Source | Zoho Books payment / bill payment recorded against the Bill |
| Target | TMS payable fields (`utr_number`, `payment_date`, amount where applicable) |
| Timing | Near real-time via webhook **or** scheduled poll (≤ 15 min) |
| Behaviour | Update TMS when UTR appears or changes; support multiple UTRs if Zoho records partial payments |
| UI | Show sync status (Pending in Zoho / Paid – UTR synced / Sync failed) |

---

## 5. Receivables — Invoice booking & IRN sync

### 5.1 Invoice booking (TMS → Zoho)

On approval / raise of tax invoice in TMS, push to Zoho including at minimum:

| Field group | Examples |
|---|---|
| Customer | Mapped Zoho contact (client master) |
| Invoice no. / date | Align with TMS numbering policy where possible |
| Place of supply, due date | As on TMS invoice |
| Line items | Charge lines, HSN/SAC, tax treatment (FCM/RCM as applicable) |
| Currency | INR / USD modes already used in TMS |

Zoho (or connected e-invoicing) generates / registers the e-invoice and produces the **IRN**.

### 5.2 IRN sync (Zoho → TMS)

| Requirement | Detail |
|---|---|
| Source | Zoho Invoice e-invoice / IRN field after successful generation |
| Target | TMS `invoices.irn` (and any PDF / display that already uses IRN) |
| Timing | Near real-time via webhook **or** scheduled poll (≤ 15 min) |
| Behaviour | Write IRN once available; do not overwrite a manually locked IRN without audit |
| UI | Show sync status (Booked in Zoho / IRN pending / IRN synced / Sync failed) |
| Constraint | Once IRN is synced, treat related taxable lines as locked for edit (consistent with current TMS behaviour) |

---

## 6. Functional requirements (summary)

| ID | Requirement |
|---|---|
| FR-01 | On Ops/Admin approval of a payable, create a Zoho Bill automatically |
| FR-02 | Persist Zoho Bill id/number on the TMS payable; show sync status |
| FR-03 | Sync UTR (and payment date) from Zoho bill payments into TMS |
| FR-04 | On Ops/Admin approval of a receivable invoice, create a Zoho Invoice automatically |
| FR-05 | Persist Zoho Invoice id/number on the TMS invoice; show sync status |
| FR-06 | Sync IRN from Zoho into TMS invoice record |
| FR-07 | All pushes must be idempotent (no duplicate Zoho docs on retry) |
| FR-08 | Failures logged with reason; Admin can retry from TMS |
| FR-09 | Maintain mapping masters: Client ↔ Zoho Contact, Payee/Vendor ↔ Zoho Contact, Tax & Item codes |

---

## 7. Non-functional requirements

| Area | Requirement |
|---|---|
| Auth | OAuth / Zoho API credentials via env/secrets; no secrets in code |
| Reliability | Retry with backoff; dead-letter / failed queue for ops visibility |
| Audit | Log who approved, when pushed, Zoho response ids, UTR/IRN sync timestamps |
| Performance | Sync jobs must not block user approval UI; run async |
| Security | Least-privilege Zoho scopes; encrypt tokens at rest |

---

## 8. Acceptance criteria

1. Approving a payable in TMS creates exactly one corresponding Bill in Zoho within the async window.
2. When payment with UTR is recorded in Zoho against that Bill, TMS shows the same UTR (and date) without manual re-entry.
3. Approving/raising an invoice in TMS creates exactly one corresponding Invoice in Zoho within the async window.
4. When IRN is available in Zoho for that Invoice, TMS stores and displays the IRN (including on invoice PDF where applicable).
5. Retry of a failed sync does not create a second Zoho document.
6. Sync status is visible to Operations/Admin for every bill and invoice in scope.

---

## 9. Open points (to confirm before build)

1. Exact approval events in TMS that count as “raise in Zoho” (button names / statuses).
2. Zoho org, tax templates, and item/account mapping ownership (Finance vs IT).
3. Webhook vs polling for UTR/IRN (prefer webhooks if Zoho org allows).
4. Handling of amendments, cancellations, and credit notes (recommend Phase 2).
5. Whether Zoho or TMS owns final invoice number series for GST e-invoice.

---

*End of document — target length ≤ 2 pages when exported to PDF/Word (≈11 pt).*
