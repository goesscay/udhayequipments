export const DOCUMENT_TYPES = [
  'REQUIREMENT',
  'MEASUREMENT',
  'SITE_PHOTO',
  'QUOTATION',
  'BOQ',
  'SOFT_DRAWING',
  'CUSTOMER_APPROVAL',
  'CAD',
  'QC_REPORT',
  'DELIVERY_CHALLAN',
  'POD',
  'INSTALLATION_PHOTO',
  'HANDOVER_CERT',
  'OTHER',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  REQUIREMENT: 'Requirement sheet',
  MEASUREMENT: 'Measurement sheet',
  SITE_PHOTO: 'Site photo',
  QUOTATION: 'Quotation',
  BOQ: 'BOQ',
  SOFT_DRAWING: 'Soft drawing',
  CUSTOMER_APPROVAL: 'Customer approval',
  CAD: 'CAD drawing',
  QC_REPORT: 'QC report',
  DELIVERY_CHALLAN: 'Delivery challan',
  POD: 'Proof of delivery',
  INSTALLATION_PHOTO: 'Installation photo',
  HANDOVER_CERT: 'Handover certificate',
  OTHER: 'Other',
};

export const ALLOWED_UPLOAD_EXTENSIONS = [
  '.pdf', '.jpg', '.jpeg', '.png', '.webp', '.heic',
  '.dwg', '.dxf', '.xlsx', '.xls', '.docx', '.doc', '.zip',
] as const;

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
