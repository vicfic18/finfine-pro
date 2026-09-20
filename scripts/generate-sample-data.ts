import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';

export interface BaseDocOptions {
  businessName?: string;
  outputPath?: string;
}

/**
 * 1. Generates HDFC Current Account Statement PDF
 */
export async function generateHdfcBankStatementPdf(options?: BaseDocOptions): Promise<Buffer> {
  const businessName = (options?.businessName || 'MY BUSINESS ENTERPRISES').toUpperCase();
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const primaryColor = rgb(0.06, 0.22, 0.44); // Navy Blue
  const darkTextColor = rgb(0.12, 0.12, 0.12);
  const grayColor = rgb(0.45, 0.45, 0.45);
  const lightBgColor = rgb(0.96, 0.97, 0.98);
  const borderLineColor = rgb(0.82, 0.84, 0.88);

  // Header Banner
  page.drawRectangle({
    x: 30,
    y: height - 85,
    width: width - 60,
    height: 55,
    color: primaryColor,
  });

  page.drawText('HDFC BANK', {
    x: 45,
    y: height - 55,
    size: 20,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  page.drawText('CURRENT ACCOUNT STATEMENT OF ACCOUNT', {
    x: 45,
    y: height - 72,
    size: 9,
    font: fontRegular,
    color: rgb(0.85, 0.9, 0.98),
  });

  page.drawText('Branch: MG Road, Bengaluru - 560001\nIFSC: HDFC0001234 | MICR: 560240002', {
    x: width - 230,
    y: height - 58,
    size: 8,
    font: fontRegular,
    color: rgb(0.9, 0.93, 0.98),
    lineHeight: 12,
  });

  // Account Details Box
  page.drawRectangle({
    x: 30,
    y: height - 195,
    width: width - 60,
    height: 100,
    color: lightBgColor,
    borderColor: borderLineColor,
    borderWidth: 1,
  });

  let yPos = height - 110;
  page.drawText('Account Name:', { x: 45, y: yPos, size: 8, font: fontRegular, color: grayColor });
  page.drawText(businessName, { x: 130, y: yPos, size: 9, font: fontBold, color: darkTextColor });

  yPos -= 16;
  page.drawText('Address:', { x: 45, y: yPos, size: 8, font: fontRegular, color: grayColor });
  page.drawText('#42/B, Market Yard Road, Bengaluru - 560002', { x: 130, y: yPos, size: 8, font: fontRegular, color: darkTextColor });

  yPos -= 16;
  page.drawText('GSTIN:', { x: 45, y: yPos, size: 8, font: fontRegular, color: grayColor });
  page.drawText('27AABCS1429B1Z5', { x: 130, y: yPos, size: 8, font: fontBold, color: primaryColor });

  yPos -= 16;
  page.drawText('PAN:', { x: 45, y: yPos, size: 8, font: fontRegular, color: grayColor });
  page.drawText('AABCS1429B', { x: 130, y: yPos, size: 8, font: fontBold, color: darkTextColor });

  // Right details
  yPos = height - 110;
  page.drawText('Account Number:', { x: 330, y: yPos, size: 8, font: fontRegular, color: grayColor });
  page.drawText('50200083921045', { x: 425, y: yPos, size: 9, font: fontBold, color: darkTextColor });

  yPos -= 16;
  page.drawText('Statement Period:', { x: 330, y: yPos, size: 8, font: fontRegular, color: grayColor });
  page.drawText('01/10/2026 to 07/10/2026', { x: 425, y: yPos, size: 8, font: fontRegular, color: darkTextColor });

  yPos -= 16;
  page.drawText('Opening Balance:', { x: 330, y: yPos, size: 8, font: fontRegular, color: grayColor });
  page.drawText('INR 84,500.00', { x: 425, y: yPos, size: 8, font: fontBold, color: darkTextColor });

  yPos -= 16;
  page.drawText('Closing Balance:', { x: 330, y: yPos, size: 8, font: fontRegular, color: grayColor });
  page.drawText('INR 1,42,850.00', { x: 425, y: yPos, size: 8, font: fontBold, color: primaryColor });

  // Table Headers
  const tableY = height - 215;
  page.drawRectangle({
    x: 30,
    y: tableY - 18,
    width: width - 60,
    height: 18,
    color: lightBgColor,
  });

  const cols = {
    date: 45,
    narration: 110,
    ref: 330,
    withdrawal: 410,
    deposit: 475,
    balance: 535,
  };

  page.drawText('Date', { x: cols.date, y: tableY - 12, size: 7.5, font: fontBold, color: darkTextColor });
  page.drawText('Narration / Description', { x: cols.narration, y: tableY - 12, size: 7.5, font: fontBold, color: darkTextColor });
  page.drawText('Ref / Chq No', { x: cols.ref, y: tableY - 12, size: 7.5, font: fontBold, color: darkTextColor });
  page.drawText('Debit (Dr)', { x: cols.withdrawal, y: tableY - 12, size: 7.5, font: fontBold, color: rgb(0.7, 0.1, 0.1) });
  page.drawText('Credit (Cr)', { x: cols.deposit, y: tableY - 12, size: 7.5, font: fontBold, color: rgb(0.1, 0.5, 0.2) });
  page.drawText('Balance', { x: cols.balance, y: tableY - 12, size: 7.5, font: fontBold, color: darkTextColor });

  // Transactions
  const txns = [
    { date: '01/10/2026', narration: 'UPI/CR/407812938192/Customer_Rohan@okaxis/Counter', ref: '407812938192', credit: '14,250.00', balance: '98,750.00' },
    { date: '02/10/2026', narration: 'UPI/CR/407812948293/PhonePeMerchant/Store_Sales_Settlement', ref: '407812948293', credit: '32,800.00', balance: '1,31,550.00' },
    { date: '03/10/2026', narration: 'UPI/DR/407812999888/Aggarwal_Wholesale_Suppliers_Material', ref: '407812999888', debit: '24,500.00', balance: '1,07,050.00' },
    { date: '04/10/2026', narration: 'UPI/DR/407813010101/BESCOM_Commercial_Electricity_BillDesk', ref: '407813010101', debit: '3,450.00', balance: '1,03,600.00' },
    { date: '05/10/2026', narration: 'UPI/CR/407813019922/Paytm_Retail_Counter_QR_Settlement', ref: '407813019922', credit: '28,200.00', balance: '1,31,800.00' },
    { date: '06/10/2026', narration: 'NEFT/CR/407813020202/Apex_Retail_Consignment_Clearance', ref: '407813020202', credit: '40,000.00', balance: '1,71,800.00' },
    { date: '06/10/2026', narration: 'UPI/NEFT/DR/407813020202/GSTN_CPIN_TAX_DEPOSIT_GSTR3B', ref: '407813020202', debit: '15,000.00', balance: '1,56,800.00' },
    { date: '07/10/2026', narration: 'NEFT/DR/407813028833/Sharma_Distributors_Fabrics_Payment', ref: '407813028833', debit: '20,000.00', balance: '1,36,800.00' },
    { date: '07/10/2026', narration: 'UPI/CR/407813029944/Walkin_Cash_Counter_Deposit_UPI_QR', ref: '407813029944', credit: '6,050.00', balance: '1,42,850.00' },
  ];

  let currentY = tableY - 34;
  txns.forEach((tx) => {
    page.drawText(tx.date, { x: cols.date, y: currentY, size: 7.5, font: fontRegular, color: darkTextColor });
    page.drawText(tx.narration.substring(0, 48), { x: cols.narration, y: currentY, size: 7, font: fontRegular, color: darkTextColor });
    page.drawText(tx.ref, { x: cols.ref, y: currentY, size: 7, font: fontRegular, color: grayColor });
    if (tx.debit) {
      page.drawText(tx.debit, { x: cols.withdrawal, y: currentY, size: 7.5, font: fontBold, color: rgb(0.7, 0.1, 0.1) });
    }
    if (tx.credit) {
      page.drawText(tx.credit, { x: cols.deposit, y: currentY, size: 7.5, font: fontBold, color: rgb(0.1, 0.5, 0.2) });
    }
    page.drawText(tx.balance, { x: cols.balance, y: currentY, size: 7.5, font: fontBold, color: darkTextColor });

    page.drawLine({
      start: { x: 30, y: currentY - 6 },
      end: { x: width - 30, y: currentY - 6 },
      color: borderLineColor,
      thickness: 0.5,
    });

    currentY -= 22;
  });

  // Statement Summary Box
  const summaryBoxY = currentY - 25;
  page.drawRectangle({
    x: 30,
    y: summaryBoxY - 45,
    width: width - 60,
    height: 50,
    color: lightBgColor,
    borderColor: primaryColor,
    borderWidth: 1,
  });

  page.drawText('STATEMENT SUMMARY', { x: 45, y: summaryBoxY - 12, size: 9, font: fontBold, color: primaryColor });
  page.drawText('Total Credits (5 Inflows): INR 1,21,300.00', { x: 45, y: summaryBoxY - 30, size: 8, font: fontRegular, color: rgb(0.1, 0.5, 0.2) });
  page.drawText('Total Debits (4 Outflows): INR 62,950.00', { x: 230, y: summaryBoxY - 30, size: 8, font: fontRegular, color: rgb(0.7, 0.1, 0.1) });
  page.drawText('Closing Balance (07/10/2026): INR 1,42,850.00', { x: 400, y: summaryBoxY - 30, size: 8, font: fontBold, color: primaryColor });

  // Disclaimer
  page.drawText(`* Computer-generated statement for ${businessName}. Verified bank reconciliation document.`, {
    x: 30,
    y: 35,
    size: 7,
    font: fontRegular,
    color: grayColor,
  });

  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);
  if (options?.outputPath) fs.writeFileSync(options.outputPath, pdfBuffer);
  return pdfBuffer;
}

/**
 * 2. Generates Vendor Bill (Sharma Textiles & Fabrics - ₹35,000, due 2026-10-16)
 */
export async function generateVendorInvoicePdf(options?: BaseDocOptions): Promise<Buffer> {
  const businessName = (options?.businessName || 'MY BUSINESS ENTERPRISES').toUpperCase();
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const primaryColor = rgb(0.15, 0.25, 0.35);
  const darkTextColor = rgb(0.1, 0.1, 0.1);
  const grayColor = rgb(0.4, 0.4, 0.4);

  page.drawText('TAX INVOICE', { x: 30, y: height - 50, size: 18, font: fontBold, color: primaryColor });
  page.drawText('Original for Recipient | MSME Vendor Purchase Bill', { x: 30, y: height - 65, size: 8, font: fontRegular, color: grayColor });

  page.drawText('SHARMA TEXTILES & FABRICS', { x: 30, y: height - 100, size: 12, font: fontBold, color: darkTextColor });
  page.drawText('Plot 14, Textile Hub, Surat, Gujarat - 395002\nGSTIN: 27AABCS9921D1Z2 | PAN: AABCS9921D\nEmail: accounts@sharmatextiles.com', {
    x: 30,
    y: height - 115,
    size: 8,
    font: fontRegular,
    color: grayColor,
    lineHeight: 12,
  });

  page.drawText('Invoice Number: INV-8821', { x: 360, y: height - 100, size: 9, font: fontBold, color: darkTextColor });
  page.drawText('Invoice Date: 2026-10-02', { x: 360, y: height - 115, size: 8, font: fontRegular, color: darkTextColor });
  page.drawText('Payment Due Date: 2026-10-16', { x: 360, y: height - 130, size: 8, font: fontBold, color: rgb(0.8, 0.2, 0.1) });
  page.drawText('Terms: Net 15 Days | Early Pay: 2% cash discount if paid in 5 days', { x: 360, y: height - 145, size: 7.5, font: fontRegular, color: grayColor });

  page.drawRectangle({ x: 30, y: height - 230, width: width - 60, height: 60, color: rgb(0.97, 0.98, 0.99) });
  page.drawText('BILLED TO (BUYER):', { x: 45, y: height - 185, size: 8, font: fontBold, color: grayColor });
  page.drawText(businessName, { x: 45, y: height - 200, size: 10, font: fontBold, color: darkTextColor });
  page.drawText('GSTIN: 27AABCS1429B1Z5 | Market Yard Road, Bengaluru', { x: 45, y: height - 215, size: 8, font: fontRegular, color: grayColor });

  const tableY = height - 260;
  page.drawText('Item Description', { x: 45, y: tableY, size: 8, font: fontBold, color: darkTextColor });
  page.drawText('Qty', { x: 280, y: tableY, size: 8, font: fontBold, color: darkTextColor });
  page.drawText('Unit', { x: 330, y: tableY, size: 8, font: fontBold, color: darkTextColor });
  page.drawText('Rate (INR)', { x: 380, y: tableY, size: 8, font: fontBold, color: darkTextColor });
  page.drawText('Amount (INR)', { x: 480, y: tableY, size: 8, font: fontBold, color: darkTextColor });

  const items = [
    { desc: 'Premium Spun Cotton 60s Count Yarn', qty: '200', unit: 'kg', rate: '120.00', total: '24,000.00' },
    { desc: 'Linen Blend Fabric Rolls Autumn Grade', qty: '50', unit: 'rolls', rate: '113.24', total: '5,662.00' },
  ];

  let itemY = tableY - 25;
  items.forEach((item) => {
    page.drawText(item.desc, { x: 45, y: itemY, size: 8, font: fontRegular, color: darkTextColor });
    page.drawText(item.qty, { x: 280, y: itemY, size: 8, font: fontRegular, color: darkTextColor });
    page.drawText(item.unit, { x: 330, y: itemY, size: 8, font: fontRegular, color: darkTextColor });
    page.drawText(item.rate, { x: 380, y: itemY, size: 8, font: fontRegular, color: darkTextColor });
    page.drawText(item.total, { x: 480, y: itemY, size: 8, font: fontBold, color: darkTextColor });
    itemY -= 20;
  });

  itemY -= 20;
  page.drawText('Subtotal: INR 29,662.00', { x: 380, y: itemY, size: 8, font: fontRegular, color: darkTextColor });
  itemY -= 15;
  page.drawText('CGST (9%): INR 2,669.00', { x: 380, y: itemY, size: 8, font: fontRegular, color: darkTextColor });
  itemY -= 15;
  page.drawText('SGST (9%): INR 2,669.00', { x: 380, y: itemY, size: 8, font: fontRegular, color: darkTextColor });
  itemY -= 20;
  page.drawText('Total Amount: INR 35,000.00', { x: 340, y: itemY, size: 11, font: fontBold, color: primaryColor });

  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);
  if (options?.outputPath) fs.writeFileSync(options.outputPath, pdfBuffer);
  return pdfBuffer;
}

/**
 * 3. Generates Vendor Bill (Aggarwal Wholesale - ₹48,000, due 2026-10-22)
 */
export async function generateAggarwalVendorPdf(options?: BaseDocOptions): Promise<Buffer> {
  const businessName = (options?.businessName || 'MY BUSINESS ENTERPRISES').toUpperCase();
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const primaryColor = rgb(0.12, 0.28, 0.35);
  const darkTextColor = rgb(0.1, 0.1, 0.1);
  const grayColor = rgb(0.4, 0.4, 0.4);

  page.drawText('TAX INVOICE', { x: 30, y: height - 50, size: 18, font: fontBold, color: primaryColor });
  page.drawText('Wholesale Raw Materials Purchase Bill', { x: 30, y: height - 65, size: 8, font: fontRegular, color: grayColor });

  page.drawText('AGGARWAL WHOLESALE TRADERS', { x: 30, y: height - 100, size: 12, font: fontBold, color: darkTextColor });
  page.drawText('Sector 18, Gandhinagar Industrial Area, Gujarat\nGSTIN: 27AABCS3321A1Z9 | PAN: AABCS3321A', {
    x: 30,
    y: height - 115,
    size: 8,
    font: fontRegular,
    color: grayColor,
    lineHeight: 12,
  });

  page.drawText('Invoice Number: INV-3321', { x: 360, y: height - 100, size: 9, font: fontBold, color: darkTextColor });
  page.drawText('Invoice Date: 2026-10-01', { x: 360, y: height - 115, size: 8, font: fontRegular, color: darkTextColor });
  page.drawText('Payment Due Date: 2026-10-22', { x: 360, y: height - 130, size: 8, font: fontBold, color: rgb(0.8, 0.2, 0.1) });
  page.drawText('Terms: Net 21 Days | Cash Discount: 2% if paid in 5 days', { x: 360, y: height - 145, size: 7.5, font: fontRegular, color: grayColor });

  page.drawRectangle({ x: 30, y: height - 230, width: width - 60, height: 60, color: rgb(0.97, 0.98, 0.99) });
  page.drawText('BILLED TO (BUYER):', { x: 45, y: height - 185, size: 8, font: fontBold, color: grayColor });
  page.drawText(businessName, { x: 45, y: height - 200, size: 10, font: fontBold, color: darkTextColor });
  page.drawText('GSTIN: 27AABCS1429B1Z5', { x: 45, y: height - 215, size: 8, font: fontRegular, color: grayColor });

  const tableY = height - 260;
  page.drawText('Raw Materials Batch Cotton Yarn Combed', { x: 45, y: tableY, size: 9, font: fontRegular, color: darkTextColor });
  page.drawText('400 kg @ INR 120.00 = INR 48,000.00', { x: 45, y: tableY - 18, size: 8, font: fontBold, color: darkTextColor });

  page.drawText('Total Amount: INR 48,000.00', { x: 340, y: tableY - 50, size: 11, font: fontBold, color: primaryColor });

  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);
  if (options?.outputPath) fs.writeFileSync(options.outputPath, pdfBuffer);
  return pdfBuffer;
}

/**
 * 4. Generates Customer Invoice (Apex Retail Mart - ₹40,000, due 2026-10-14)
 */
export async function generateCustomerInvoicePdf(options?: BaseDocOptions): Promise<Buffer> {
  const businessName = (options?.businessName || 'MY BUSINESS ENTERPRISES').toUpperCase();
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  page.drawText('SALES INVOICE / RECEIVABLE', { x: 30, y: height - 50, size: 18, font: fontBold, color: rgb(0.1, 0.4, 0.2) });

  page.drawText(businessName, { x: 30, y: height - 90, size: 12, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('Market Yard Commercial Complex, Bengaluru\nGSTIN: 27AABCS1429B1Z5', {
    x: 30,
    y: height - 105,
    size: 8,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.4),
    lineHeight: 12,
  });

  page.drawText('Invoice Number: INV-412', { x: 360, y: height - 90, size: 9, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('Invoice Date: 2026-09-14', { x: 360, y: height - 105, size: 8, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('Payment Due Date: 2026-10-14', { x: 360, y: height - 120, size: 8, font: fontBold, color: rgb(0.1, 0.5, 0.2) });

  page.drawRectangle({ x: 30, y: height - 210, width: width - 60, height: 55, color: rgb(0.96, 0.98, 0.96) });
  page.drawText('CUSTOMER (BUYER):', { x: 45, y: height - 175, size: 8, font: fontBold, color: rgb(0.4, 0.4, 0.4) });
  page.drawText('APEX RETAIL MART PVT LTD', { x: 45, y: height - 190, size: 10, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('GSTIN: 29AABCA8912E1Z4 | Indiranagar, Bengaluru', { x: 45, y: height - 202, size: 8, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });

  const tableY = height - 245;
  page.drawText('Festive Wholesale Garments Consignment Batch 412', { x: 45, y: tableY, size: 9, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('80 pcs @ INR 500.00 = INR 40,000.00', { x: 45, y: tableY - 18, size: 8, font: fontBold, color: rgb(0.2, 0.2, 0.2) });

  page.drawText('Total Amount: INR 40,000.00', { x: 330, y: tableY - 50, size: 11, font: fontBold, color: rgb(0.1, 0.4, 0.2) });

  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);
  if (options?.outputPath) fs.writeFileSync(options.outputPath, pdfBuffer);
  return pdfBuffer;
}

/**
 * 5. Generates Customer Invoice (City Fashion Hub - ₹55,000, due 2026-10-19)
 */
export async function generateCityFashionCustomerPdf(options?: BaseDocOptions): Promise<Buffer> {
  const businessName = (options?.businessName || 'MY BUSINESS ENTERPRISES').toUpperCase();
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  page.drawText('SALES INVOICE / RECEIVABLE', { x: 30, y: height - 50, size: 18, font: fontBold, color: rgb(0.1, 0.4, 0.2) });

  page.drawText(businessName, { x: 30, y: height - 90, size: 12, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('Market Yard Commercial Complex, Bengaluru\nGSTIN: 27AABCS1429B1Z5', {
    x: 30,
    y: height - 105,
    size: 8,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.4),
    lineHeight: 12,
  });

  page.drawText('Invoice Number: INV-504', { x: 360, y: height - 90, size: 9, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('Invoice Date: 2026-09-19', { x: 360, y: height - 105, size: 8, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('Payment Due Date: 2026-10-19', { x: 360, y: height - 120, size: 8, font: fontBold, color: rgb(0.1, 0.5, 0.2) });

  page.drawRectangle({ x: 30, y: height - 210, width: width - 60, height: 55, color: rgb(0.96, 0.98, 0.96) });
  page.drawText('CUSTOMER (BUYER):', { x: 45, y: height - 175, size: 8, font: fontBold, color: rgb(0.4, 0.4, 0.4) });
  page.drawText('CITY FASHION HUB', { x: 45, y: height - 190, size: 10, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('GSTIN: 29AABCD1122F1Z7 | Commercial Street, Bengaluru', { x: 45, y: height - 202, size: 8, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });

  const tableY = height - 245;
  page.drawText('Festive Kurtas Wholesale Consignment Batch 504', { x: 45, y: tableY, size: 9, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('110 pcs @ INR 500.00 = INR 55,000.00', { x: 45, y: tableY - 18, size: 8, font: fontBold, color: rgb(0.2, 0.2, 0.2) });

  page.drawText('Total Amount: INR 55,000.00', { x: 330, y: tableY - 50, size: 11, font: fontBold, color: rgb(0.1, 0.4, 0.2) });

  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);
  if (options?.outputPath) fs.writeFileSync(options.outputPath, pdfBuffer);
  return pdfBuffer;
}

/**
 * 6. Generates Customer Invoice (Balaji Supermarket - ₹28,000, due 2026-10-25)
 */
export async function generateBalajiCustomerPdf(options?: BaseDocOptions): Promise<Buffer> {
  const businessName = (options?.businessName || 'MY BUSINESS ENTERPRISES').toUpperCase();
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  page.drawText('SALES INVOICE / RECEIVABLE', { x: 30, y: height - 50, size: 18, font: fontBold, color: rgb(0.1, 0.4, 0.2) });

  page.drawText(businessName, { x: 30, y: height - 90, size: 12, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('Market Yard Commercial Complex, Bengaluru\nGSTIN: 27AABCS1429B1Z5', {
    x: 30,
    y: height - 105,
    size: 8,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.4),
    lineHeight: 12,
  });

  page.drawText('Invoice Number: INV-208', { x: 360, y: height - 90, size: 9, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('Invoice Date: 2026-09-25', { x: 360, y: height - 105, size: 8, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('Payment Due Date: 2026-10-25', { x: 360, y: height - 120, size: 8, font: fontBold, color: rgb(0.1, 0.5, 0.2) });

  page.drawRectangle({ x: 30, y: height - 210, width: width - 60, height: 55, color: rgb(0.96, 0.98, 0.96) });
  page.drawText('CUSTOMER (BUYER):', { x: 45, y: height - 175, size: 8, font: fontBold, color: rgb(0.4, 0.4, 0.4) });
  page.drawText('BALAJI SUPERMARKET', { x: 45, y: height - 190, size: 10, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('GSTIN: 29AABCB3344G1Z8 | Jayanagar, Bengaluru', { x: 45, y: height - 202, size: 8, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });

  const tableY = height - 245;
  page.drawText('Counter Sales Apparel Consignment Batch 208', { x: 45, y: tableY, size: 9, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('56 pcs @ INR 500.00 = INR 28,000.00', { x: 45, y: tableY - 18, size: 8, font: fontBold, color: rgb(0.2, 0.2, 0.2) });

  page.drawText('Total Amount: INR 28,000.00', { x: 330, y: tableY - 50, size: 11, font: fontBold, color: rgb(0.1, 0.4, 0.2) });

  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);
  if (options?.outputPath) fs.writeFileSync(options.outputPath, pdfBuffer);
  return pdfBuffer;
}

/**
 * 7. Generates Customer Invoice (Royal Traders - ₹22,000, due 2026-09-28 OVERDUE)
 */
export async function generateRoyalTradersCustomerPdf(options?: BaseDocOptions): Promise<Buffer> {
  const businessName = (options?.businessName || 'MY BUSINESS ENTERPRISES').toUpperCase();
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  page.drawText('SALES INVOICE / RECEIVABLE', { x: 30, y: height - 50, size: 18, font: fontBold, color: rgb(0.7, 0.2, 0.1) });
  page.drawText('STATUS: OVERDUE (FOLLOW-UP REQUIRED)', { x: 30, y: height - 65, size: 8, font: fontBold, color: rgb(0.8, 0.1, 0.1) });

  page.drawText(businessName, { x: 30, y: height - 95, size: 12, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('Market Yard Commercial Complex, Bengaluru\nGSTIN: 27AABCS1429B1Z5', {
    x: 30,
    y: height - 110,
    size: 8,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.4),
    lineHeight: 12,
  });

  page.drawText('Invoice Number: INV-190', { x: 360, y: height - 95, size: 9, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('Invoice Date: 2026-08-28', { x: 360, y: height - 110, size: 8, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('Payment Due Date: 2026-09-28', { x: 360, y: height - 125, size: 8, font: fontBold, color: rgb(0.8, 0.1, 0.1) });

  page.drawRectangle({ x: 30, y: height - 215, width: width - 60, height: 55, color: rgb(0.99, 0.96, 0.96) });
  page.drawText('CUSTOMER (BUYER):', { x: 45, y: height - 180, size: 8, font: fontBold, color: rgb(0.4, 0.4, 0.4) });
  page.drawText('ROYAL TRADERS', { x: 45, y: height - 195, size: 10, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('GSTIN: 29AABCX7788H1Z1 | Mysore Road, Bengaluru', { x: 45, y: height - 207, size: 8, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });

  const tableY = height - 250;
  page.drawText('Monsoon Inventory Clearance Batch 190', { x: 45, y: tableY, size: 9, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('44 pcs @ INR 500.00 = INR 22,000.00', { x: 45, y: tableY - 18, size: 8, font: fontBold, color: rgb(0.2, 0.2, 0.2) });

  page.drawText('Total Amount: INR 22,000.00', { x: 330, y: tableY - 50, size: 11, font: fontBold, color: rgb(0.8, 0.1, 0.1) });

  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);
  if (options?.outputPath) fs.writeFileSync(options.outputPath, pdfBuffer);
  return pdfBuffer;
}

/**
 * 8. Generates GST PMT-06 Tax Payment Challan (₹42,000, due 2026-10-20)
 */
export async function generateGstChallanPdf(options?: BaseDocOptions): Promise<Buffer> {
  const businessName = (options?.businessName || 'MY BUSINESS ENTERPRISES').toUpperCase();
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  page.drawText('GOODS AND SERVICES TAX NETWORK', { x: 30, y: height - 50, size: 16, font: fontBold, color: rgb(0.4, 0.1, 0.4) });
  page.drawText('GST PMT-06 / GSTR-3B CHALLAN FOR PAYMENT OF TAX', { x: 30, y: height - 68, size: 8, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });

  page.drawText('CPIN: 26102700819201', { x: 30, y: height - 105, size: 9, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(`Taxpayer: ${businessName}`, { x: 30, y: height - 120, size: 9, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('GSTIN: 27AABCS1429B1Z5', { x: 30, y: height - 135, size: 8, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });

  page.drawText('Tax Period: September 2026', { x: 360, y: height - 105, size: 8, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('Payment Due Date: 2026-10-20', { x: 360, y: height - 120, size: 8, font: fontBold, color: rgb(0.8, 0.1, 0.1) });
  page.drawText('Statutory Requirement: Section 39 CGST Act', { x: 360, y: height - 135, size: 8, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });

  page.drawRectangle({ x: 30, y: height - 220, width: width - 60, height: 60, color: rgb(0.98, 0.96, 0.99) });
  page.drawText('Total GST Challan Payable: INR 42,000.00', { x: 45, y: height - 190, size: 12, font: fontBold, color: rgb(0.4, 0.1, 0.4) });
  page.drawText('CGST: INR 21,000.00 | SGST: INR 21,000.00 | Penalty if missed: 18% per annum', { x: 45, y: height - 208, size: 8, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });

  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);
  if (options?.outputPath) fs.writeFileSync(options.outputPath, pdfBuffer);
  return pdfBuffer;
}

/**
 * 9. Generates TDS Challan 281 (₹14,500, due 2026-10-07)
 */
export async function generateTdsChallanPdf(options?: BaseDocOptions): Promise<Buffer> {
  const businessName = (options?.businessName || 'MY BUSINESS ENTERPRISES').toUpperCase();
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  page.drawText('INCOME TAX DEPARTMENT - GOVT OF INDIA', { x: 30, y: height - 50, size: 15, font: fontBold, color: rgb(0.1, 0.3, 0.5) });
  page.drawText('TAX DEDUCTED AT SOURCE (TDS) - CHALLAN NO. / ITNS 281', { x: 30, y: height - 68, size: 8, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });

  page.drawText('Challan Ref / BSR: 0210088 / 2026-09', { x: 30, y: height - 105, size: 9, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(`Deductor: ${businessName}`, { x: 30, y: height - 120, size: 9, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('TAN: BLRE12345F | PAN: AABCS1429B', { x: 30, y: height - 135, size: 8, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });

  page.drawText('Nature of Payment: 194C / 194J Contracts & Professional', { x: 330, y: height - 105, size: 7.5, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('Payment Due Date: 2026-10-07', { x: 330, y: height - 120, size: 8, font: fontBold, color: rgb(0.8, 0.1, 0.1) });
  page.drawText('Assessment Year: 2027-28', { x: 330, y: height - 135, size: 8, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });

  page.drawRectangle({ x: 30, y: height - 220, width: width - 60, height: 60, color: rgb(0.96, 0.98, 1.0) });
  page.drawText('Total TDS Payable: INR 14,500.00', { x: 45, y: height - 190, size: 12, font: fontBold, color: rgb(0.1, 0.3, 0.5) });
  page.drawText('Section 194C: INR 8,500.00 | Section 194J: INR 6,000.00 | Penalty rate: 1.5% per month', { x: 45, y: height - 208, size: 8, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });

  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);
  if (options?.outputPath) fs.writeFileSync(options.outputPath, pdfBuffer);
  return pdfBuffer;
}

/**
 * 10. Generates EPFO / ESIC Challan (₹18,200, due 2026-10-15)
 */
export async function generateEpfoChallanPdf(options?: BaseDocOptions): Promise<Buffer> {
  const businessName = (options?.businessName || 'MY BUSINESS ENTERPRISES').toUpperCase();
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  page.drawText('EMPLOYEES\' PROVIDENT FUND ORGANISATION', { x: 30, y: height - 50, size: 15, font: fontBold, color: rgb(0.15, 0.4, 0.2) });
  page.drawText('ELECTRONIC CHALLAN CUM RETURN (ECR) - MONTHLY WAGE DEDUCTION', { x: 30, y: height - 68, size: 8, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });

  page.drawText('TRRN: 1012610099182', { x: 30, y: height - 105, size: 9, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(`Establishment: ${businessName}`, { x: 30, y: height - 120, size: 9, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('Establishment ID: BGBNG0012345000', { x: 30, y: height - 135, size: 8, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });

  page.drawText('Wage Month: September 2026', { x: 360, y: height - 105, size: 8, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('Payment Due Date: 2026-10-15', { x: 360, y: height - 120, size: 8, font: fontBold, color: rgb(0.8, 0.1, 0.1) });
  page.drawText('Employees Covered: 5 Members', { x: 360, y: height - 135, size: 8, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });

  page.drawRectangle({ x: 30, y: height - 220, width: width - 60, height: 60, color: rgb(0.96, 0.99, 0.96) });
  page.drawText('Total EPFO & ESIC Payable: INR 18,200.00', { x: 45, y: height - 190, size: 12, font: fontBold, color: rgb(0.15, 0.4, 0.2) });
  page.drawText('EPF A/C 1: INR 12,600 | EPS A/C 10: INR 4,100 | EDLI & Admin: INR 1,500', { x: 45, y: height - 208, size: 8, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });

  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);
  if (options?.outputPath) fs.writeFileSync(options.outputPath, pdfBuffer);
  return pdfBuffer;
}

/**
 * 11. Generates Monthly Staff Payroll / Salary Sheet PDF (₹65,000, due 2026-10-10)
 */
export async function generatePayrollPdf(options?: BaseDocOptions): Promise<Buffer> {
  const businessName = (options?.businessName || 'MY BUSINESS ENTERPRISES').toUpperCase();
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  page.drawText('STAFF PAYROLL REGISTER & SALARY ADVICE', { x: 30, y: height - 50, size: 16, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(`Employer: ${businessName} | Wages Month: September 2026`, { x: 30, y: height - 68, size: 8, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });

  page.drawText('Disbursement Due Date: 2026-10-10', { x: 360, y: height - 105, size: 8, font: fontBold, color: rgb(0.8, 0.1, 0.1) });
  page.drawText('Beneficiary Category: Store & Warehouse Staff (5 Employees)', { x: 30, y: height - 105, size: 8, font: fontBold, color: rgb(0.2, 0.2, 0.2) });

  page.drawRectangle({ x: 30, y: height - 210, width: width - 60, height: 65, color: rgb(0.98, 0.98, 0.98) });
  page.drawText('Total Net Salary Payable: INR 65,000.00', { x: 45, y: height - 180, size: 12, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('Includes: 2 Store Sales Reps (INR 28,000), 1 Accountant (INR 18,000), 2 Logistics Staff (INR 19,000)', { x: 45, y: height - 198, size: 7.5, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });

  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);
  if (options?.outputPath) fs.writeFileSync(options.outputPath, pdfBuffer);
  return pdfBuffer;
}

/**
 * 12. Generates Commercial Lease / Rent Receipt PDF (₹28,000, due 2026-10-10)
 */
export async function generateRentPdf(options?: BaseDocOptions): Promise<Buffer> {
  const businessName = (options?.businessName || 'MY BUSINESS ENTERPRISES').toUpperCase();
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  page.drawText('COMMERCIAL PROPERTY LEASE RENT VOUCHER', { x: 30, y: height - 50, size: 16, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('Lessor / Landlord: K. Raman | Commercial Godown & Retail Unit', { x: 30, y: height - 68, size: 8, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });

  page.drawText(`Lessee: ${businessName}`, { x: 30, y: height - 105, size: 9, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
  page.drawText('Property: #42/B, Market Yard Road, Bengaluru', { x: 30, y: height - 120, size: 8, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });

  page.drawText('Rent Period: October 2026', { x: 360, y: height - 105, size: 8, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('Payment Due Date: 2026-10-10', { x: 360, y: height - 120, size: 8, font: fontBold, color: rgb(0.8, 0.1, 0.1) });

  page.drawRectangle({ x: 30, y: height - 210, width: width - 60, height: 55, color: rgb(0.98, 0.98, 0.98) });
  page.drawText('Total Rent Due: INR 28,000.00', { x: 45, y: height - 180, size: 12, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('Fixed Monthly Operational Overhead', { x: 45, y: height - 198, size: 8, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });

  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);
  if (options?.outputPath) fs.writeFileSync(options.outputPath, pdfBuffer);
  return pdfBuffer;
}

/**
 * 13. Generates Loan EMI Repayment Notice PDF (₹16,400, due 2026-10-12)
 */
export async function generateLoanEmiPdf(options?: BaseDocOptions): Promise<Buffer> {
  const businessName = (options?.businessName || 'MY BUSINESS ENTERPRISES').toUpperCase();
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  page.drawText('HDFC BANK - MSME LENDING DIVISION', { x: 30, y: height - 50, size: 16, font: fontBold, color: rgb(0.06, 0.22, 0.44) });
  page.drawText('BUSINESS EQUIPMENT LOAN REPAYMENT DEMAND NOTICE', { x: 30, y: height - 68, size: 8, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });

  page.drawText(`Borrower: ${businessName}`, { x: 30, y: height - 105, size: 9, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('Loan Account Number: HLMSME9921408', { x: 30, y: height - 120, size: 8, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });

  page.drawText('Instalment Due Date: 2026-10-12', { x: 360, y: height - 105, size: 8, font: fontBold, color: rgb(0.8, 0.1, 0.1) });
  page.drawText('Tenure: Month 18 of 36', { x: 360, y: height - 120, size: 8, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });

  page.drawRectangle({ x: 30, y: height - 210, width: width - 60, height: 55, color: rgb(0.97, 0.98, 1.0) });
  page.drawText('Monthly EMI Amount: INR 16,400.00', { x: 45, y: height - 180, size: 12, font: fontBold, color: rgb(0.06, 0.22, 0.44) });
  page.drawText('Principal: INR 12,200.00 | Interest: INR 4,200.00 | Late fee: INR 750', { x: 45, y: height - 198, size: 8, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });

  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);
  if (options?.outputPath) fs.writeFileSync(options.outputPath, pdfBuffer);
  return pdfBuffer;
}

/**
 * 14. Generates BESCOM Commercial Electricity Bill PDF (₹8,900, due 2026-10-18)
 */
export async function generateBescomPdf(options?: BaseDocOptions): Promise<Buffer> {
  const businessName = (options?.businessName || 'MY BUSINESS ENTERPRISES').toUpperCase();
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  page.drawText('BANGALORE ELECTRICITY SUPPLY COMPANY (BESCOM)', { x: 30, y: height - 50, size: 15, font: fontBold, color: rgb(0.2, 0.3, 0.1) });
  page.drawText('COMMERCIAL LT POWER SUPPLY DEMAND BILL', { x: 30, y: height - 68, size: 8, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });

  page.drawText(`Consumer: ${businessName}`, { x: 30, y: height - 105, size: 9, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('Account ID: BES5529104 | Meter: LT-2B Commercial', { x: 30, y: height - 120, size: 8, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });

  page.drawText('Billing Month: September 2026', { x: 360, y: height - 105, size: 8, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('Payment Due Date: 2026-10-18', { x: 360, y: height - 120, size: 8, font: fontBold, color: rgb(0.8, 0.1, 0.1) });

  page.drawRectangle({ x: 30, y: height - 210, width: width - 60, height: 55, color: rgb(0.98, 0.99, 0.97) });
  page.drawText('Total Electricity Due: INR 8,900.00', { x: 45, y: height - 180, size: 12, font: fontBold, color: rgb(0.2, 0.3, 0.1) });
  page.drawText('Energy Consumption: 1,040 kWh | Prompt Payment Rebate if paid by 12th', { x: 45, y: height - 198, size: 8, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });

  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);
  if (options?.outputPath) fs.writeFileSync(options.outputPath, pdfBuffer);
  return pdfBuffer;
}

/**
 * Manifest of all available sample MSME test documents
 */
export const SAMPLE_DOCUMENTS_REGISTRY = [
  {
    id: 'BANK_STATEMENT_6MONTH',
    fileName: 'sample_6month_hdfc_statement.pdf',
    displayName: '6-Month Comprehensive HDFC Statement (389 Txns • Festive Cycles)',
    docType: 'BANK_STATEMENT' as const,
    description: 'Continuous 6-month bank ledger (May-Oct 2026) capturing UPI footfall surges, Diwali peaks, and statutory tax drains',
    generator: async ({ outputPath }: { businessName?: string; outputPath?: string }) => {
      const { generateSixMonthStatementPdf } = await import('./generate-6month-statement');
      return generateSixMonthStatementPdf(outputPath);
    },
  },
  {
    id: 'BANK_STATEMENT',
    fileName: 'sample_upi_bank_statement.pdf',
    displayName: 'HDFC Bank Current Statement (INR 1.42L)',
    docType: 'BANK_STATEMENT' as const,
    description: 'Bank reconciliation, closing cash, and 9 UPI & NEFT ledger transactions',
    generator: generateHdfcBankStatementPdf,
  },
  {
    id: 'VENDOR_BILL_SHARMA',
    fileName: 'sample_vendor_bill_sharma_textiles.pdf',
    displayName: 'Sharma Textiles Bill (INR 35,000)',
    docType: 'INVOICE' as const,
    description: 'Trade supplier purchase invoice with inventory line items & discount terms',
    generator: generateVendorInvoicePdf,
  },
  {
    id: 'VENDOR_BILL_AGGARWAL',
    fileName: 'sample_vendor_bill_aggarwal.pdf',
    displayName: 'Aggarwal Wholesale Bill (INR 48,000)',
    docType: 'INVOICE' as const,
    description: 'Raw materials supplier invoice with early-payment discount arbitrage',
    generator: generateAggarwalVendorPdf,
  },
  {
    id: 'CUSTOMER_INVOICE_APEX',
    fileName: 'sample_customer_invoice_apex_retail.pdf',
    displayName: 'Apex Retail Customer Invoice (INR 40,000)',
    docType: 'INVOICE' as const,
    description: 'Wholesale garments receivable due 14th Oct',
    generator: generateCustomerInvoicePdf,
  },
  {
    id: 'CUSTOMER_INVOICE_CITY',
    fileName: 'sample_customer_invoice_city_fashion.pdf',
    displayName: 'City Fashion Customer Invoice (INR 55,000)',
    docType: 'INVOICE' as const,
    description: 'Festive order consignment receivable due 19th Oct',
    generator: generateCityFashionCustomerPdf,
  },
  {
    id: 'CUSTOMER_INVOICE_BALAJI',
    fileName: 'sample_customer_invoice_balaji.pdf',
    displayName: 'Balaji Supermarket Invoice (INR 28,000)',
    docType: 'INVOICE' as const,
    description: 'Store apparel customer receivable due 25th Oct',
    generator: generateBalajiCustomerPdf,
  },
  {
    id: 'CUSTOMER_INVOICE_ROYAL',
    fileName: 'sample_customer_invoice_royal_traders.pdf',
    displayName: 'Royal Traders Overdue Invoice (INR 22,000)',
    docType: 'INVOICE' as const,
    description: 'Overdue customer consignment receivable driving aging debtor risk',
    generator: generateRoyalTradersCustomerPdf,
  },
  {
    id: 'TAX_GST',
    fileName: 'sample_statutory_gst_challan.pdf',
    displayName: 'GST GSTR-3B Challan (INR 42,000)',
    docType: 'GST_CHALLAN' as const,
    description: 'Statutory GST PMT-06 challan due 20th Oct driving Tax Lockbox',
    generator: generateGstChallanPdf,
  },
  {
    id: 'TAX_TDS',
    fileName: 'sample_statutory_tds_challan.pdf',
    displayName: 'TDS Section 194C/J Challan 281 (INR 14,500)',
    docType: 'GST_CHALLAN' as const,
    description: 'Income tax withholding challan due 7th Oct',
    generator: generateTdsChallanPdf,
  },
  {
    id: 'TAX_EPFO',
    fileName: 'sample_statutory_epfo_challan.pdf',
    displayName: 'EPFO & ESIC ECR Challan (INR 18,200)',
    docType: 'GST_CHALLAN' as const,
    description: 'Staff provident fund statutory contribution due 15th Oct',
    generator: generateEpfoChallanPdf,
  },
  {
    id: 'OVERHEAD_PAYROLL',
    fileName: 'sample_payroll_salary_sheet.pdf',
    displayName: 'Staff Payroll Sheet (INR 65,000)',
    docType: 'INVOICE' as const,
    description: '5-staff monthly wage advice due 10th Oct driving daily burn',
    generator: generatePayrollPdf,
  },
  {
    id: 'OVERHEAD_RENT',
    fileName: 'sample_rent_receipt.pdf',
    displayName: 'Commercial Shop Rent (INR 28,000)',
    docType: 'INVOICE' as const,
    description: 'Monthly commercial godown lease due 10th Oct',
    generator: generateRentPdf,
  },
  {
    id: 'OVERHEAD_LOAN_EMI',
    fileName: 'sample_loan_emi_notice.pdf',
    displayName: 'Equipment Loan EMI (INR 16,400)',
    docType: 'INVOICE' as const,
    description: 'HDFC MSME business equipment loan monthly instalment due 12th Oct',
    generator: generateLoanEmiPdf,
  },
  {
    id: 'OVERHEAD_BESCOM',
    fileName: 'sample_utility_bill_bescom.pdf',
    displayName: 'BESCOM Electricity Bill (INR 8,900)',
    docType: 'INVOICE' as const,
    description: 'Commercial power demand bill due 18th Oct',
    generator: generateBescomPdf,
  },
];

/**
 * Generates all sample documents into sample_data directory
 */
export async function generateAllSampleDocuments(businessName?: string): Promise<string[]> {
  const sampleDir = path.join(process.cwd(), 'sample_data');
  if (!fs.existsSync(sampleDir)) {
    fs.mkdirSync(sampleDir, { recursive: true });
  }

  const generatedFiles: string[] = [];
  for (const item of SAMPLE_DOCUMENTS_REGISTRY) {
    const filePath = path.join(sampleDir, item.fileName);
    await item.generator({ businessName, outputPath: filePath });
    generatedFiles.push(filePath);
  }

  return generatedFiles;
}

if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('generate-sample-data')) {
  generateAllSampleDocuments()
    .then((files) => console.log(`✅ Successfully generated ${files.length} sample documents in sample_data/`))
    .catch((err) => {
      console.error('❌ Error generating sample documents:', err);
      process.exit(1);
    });
}

