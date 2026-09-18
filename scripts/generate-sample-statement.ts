import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';

export async function generateSampleBankStatementPdf(outputPath?: string): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 Size
  const { width, height } = page.getSize();

  const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontHelveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const primaryColor = rgb(0.06, 0.22, 0.44); // HDFC Navy Blue
  const darkTextColor = rgb(0.1, 0.1, 0.1);
  const grayColor = rgb(0.4, 0.4, 0.4);
  const lightBgColor = rgb(0.95, 0.96, 0.98);
  const borderLineColor = rgb(0.8, 0.82, 0.86);

  // Top Header Banner
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
    font: fontHelveticaBold,
    color: rgb(1, 1, 1),
  });

  page.drawText('CURRENT ACCOUNT STATEMENT OF ACCOUNT', {
    x: 45,
    y: height - 72,
    size: 9,
    font: fontHelvetica,
    color: rgb(0.85, 0.9, 0.98),
  });

  page.drawText('Branch: MG Road, Bengaluru - 560001\nIFSC: HDFC0001234 | MICR: 560240002', {
    x: width - 230,
    y: height - 58,
    size: 8,
    font: fontHelvetica,
    color: rgb(0.9, 0.93, 0.98),
    lineHeight: 12,
  });

  // Customer & Account Details Box
  page.drawRectangle({
    x: 30,
    y: height - 195,
    width: width - 60,
    height: 100,
    color: lightBgColor,
    borderColor: borderLineColor,
    borderWidth: 1,
  });

  // Left Column - Account Holder Details
  let yPos = height - 110;
  page.drawText('Account Name:', { x: 45, y: yPos, size: 8, font: fontHelvetica, color: grayColor });
  page.drawText('SHREE GANESH ENTERPRISES', { x: 130, y: yPos, size: 9, font: fontHelveticaBold, color: darkTextColor });

  yPos -= 16;
  page.drawText('Address:', { x: 45, y: yPos, size: 8, font: fontHelvetica, color: grayColor });
  page.drawText('#42/B, Market Yard Road, Bengaluru - 560002', { x: 130, y: yPos, size: 8, font: fontHelvetica, color: darkTextColor });

  yPos -= 16;
  page.drawText('GSTIN:', { x: 45, y: yPos, size: 8, font: fontHelvetica, color: grayColor });
  page.drawText('27AABCS1429B1Z5', { x: 130, y: yPos, size: 8, font: fontHelveticaBold, color: primaryColor });

  yPos -= 16;
  page.drawText('PAN:', { x: 45, y: yPos, size: 8, font: fontHelvetica, color: grayColor });
  page.drawText('AABCS1429B', { x: 130, y: yPos, size: 8, font: fontHelveticaBold, color: darkTextColor });

  // Right Column - Statement Details
  yPos = height - 110;
  const rightColX = 330;
  const rightValX = 425;

  page.drawText('Account Number:', { x: rightColX, y: yPos, size: 8, font: fontHelvetica, color: grayColor });
  page.drawText('50200083921045', { x: rightValX, y: yPos, size: 9, font: fontHelveticaBold, color: darkTextColor });

  yPos -= 16;
  page.drawText('Statement Period:', { x: rightColX, y: yPos, size: 8, font: fontHelvetica, color: grayColor });
  page.drawText('01/10/2026 to 07/10/2026', { x: rightValX, y: yPos, size: 8, font: fontHelvetica, color: darkTextColor });

  yPos -= 16;
  page.drawText('Opening Balance:', { x: rightColX, y: yPos, size: 8, font: fontHelvetica, color: grayColor });
  page.drawText('INR 84,500.00', { x: rightValX, y: yPos, size: 8, font: fontHelveticaBold, color: darkTextColor });

  yPos -= 16;
  page.drawText('Currency:', { x: rightColX, y: yPos, size: 8, font: fontHelvetica, color: grayColor });
  page.drawText('INR (Indian Rupee)', { x: rightValX, y: yPos, size: 8, font: fontHelvetica, color: darkTextColor });

  // Table Headers
  const tableTop = height - 225;
  page.drawRectangle({
    x: 30,
    y: tableTop - 20,
    width: width - 60,
    height: 20,
    color: primaryColor,
  });

  const colX = {
    date: 38,
    narration: 95,
    ref: 330,
    withdrawal: 405,
    deposit: 470,
    balance: 535,
  };

  page.drawText('Date', { x: colX.date, y: tableTop - 14, size: 8, font: fontHelveticaBold, color: rgb(1, 1, 1) });
  page.drawText('Narration / Description', { x: colX.narration, y: tableTop - 14, size: 8, font: fontHelveticaBold, color: rgb(1, 1, 1) });
  page.drawText('Ref / Chq No', { x: colX.ref, y: tableTop - 14, size: 8, font: fontHelveticaBold, color: rgb(1, 1, 1) });
  page.drawText('Debit (Dr)', { x: colX.withdrawal, y: tableTop - 14, size: 8, font: fontHelveticaBold, color: rgb(1, 1, 1) });
  page.drawText('Credit (Cr)', { x: colX.deposit, y: tableTop - 14, size: 8, font: fontHelveticaBold, color: rgb(1, 1, 1) });
  page.drawText('Balance', { x: colX.balance, y: tableTop - 14, size: 8, font: fontHelveticaBold, color: rgb(1, 1, 1) });

  // Transactions Data
  const sampleTransactions = [
    {
      date: '01/10/2026',
      narration: 'UPI/CR/407812938192/GPay_Customer_Rohan@okaxis/QR_Payment',
      ref: '407812938192',
      debit: '',
      credit: '4,250.00',
      balance: '88,750.00',
    },
    {
      date: '02/10/2026',
      narration: 'UPI/CR/407812948293/PhonePeMerchant/Store_Sales_Collection',
      ref: '407812948293',
      debit: '',
      credit: '12,800.00',
      balance: '1,01,550.00',
    },
    {
      date: '03/10/2026',
      narration: 'UPI/DR/407812999888/Aggarwal_Wholesale_Suppliers@icici/Inventory',
      ref: '407812999888',
      debit: '24,500.00',
      credit: '',
      balance: '77,050.00',
    },
    {
      date: '04/10/2026',
      narration: 'UPI/DR/407813010101/BESCOM_Electricity_BillDesk@sbi/PowerBill',
      ref: '407813010101',
      debit: '3,450.00',
      credit: '',
      balance: '73,600.00',
    },
    {
      date: '05/10/2026',
      narration: 'UPI/CR/407813019922/Paytm_Retail_Counter_QR_Settlement',
      ref: '407813019922',
      credit: '18,200.00',
      debit: '',
      balance: '91,800.00',
    },
    {
      date: '06/10/2026',
      narration: 'UPI/NEFT/DR/407813020202/GSTN_CPIN_TAX_DEPOSIT_GST_SEP26',
      ref: '407813020202',
      debit: '15,000.00',
      credit: '',
      balance: '76,800.00',
    },
    {
      date: '07/10/2026',
      narration: 'UPI/CR/407813028833/Sharma_Distributors_Refund@paytm',
      ref: '407813028833',
      credit: '5,550.00',
      debit: '',
      balance: '82,350.00',
    },
  ];

  let currentY = tableTop - 40;
  sampleTransactions.forEach((tx, idx) => {
    // Alternating background
    if (idx % 2 === 1) {
      page.drawRectangle({
        x: 30,
        y: currentY - 6,
        width: width - 60,
        height: 22,
        color: lightBgColor,
      });
    }

    page.drawText(tx.date, { x: colX.date, y: currentY, size: 7.5, font: fontHelvetica, color: darkTextColor });
    page.drawText(tx.narration.substring(0, 48), { x: colX.narration, y: currentY, size: 7, font: fontHelvetica, color: darkTextColor });
    page.drawText(tx.ref, { x: colX.ref, y: currentY, size: 7, font: fontHelvetica, color: grayColor });
    if (tx.debit) {
      page.drawText(tx.debit, { x: colX.withdrawal, y: currentY, size: 7.5, font: fontHelveticaBold, color: rgb(0.7, 0.1, 0.1) });
    }
    if (tx.credit) {
      page.drawText(tx.credit, { x: colX.deposit, y: currentY, size: 7.5, font: fontHelveticaBold, color: rgb(0.1, 0.5, 0.2) });
    }
    page.drawText(tx.balance, { x: colX.balance, y: currentY, size: 7.5, font: fontHelveticaBold, color: darkTextColor });

    // Row separator
    page.drawLine({
      start: { x: 30, y: currentY - 7 },
      end: { x: width - 30, y: currentY - 7 },
      color: borderLineColor,
      thickness: 0.5,
    });

    currentY -= 22;
  });

  // Summary Box at Bottom
  const summaryBoxY = currentY - 30;
  page.drawRectangle({
    x: 30,
    y: summaryBoxY - 50,
    width: width - 60,
    height: 55,
    color: lightBgColor,
    borderColor: primaryColor,
    borderWidth: 1,
  });

  page.drawText('STATEMENT SUMMARY', {
    x: 45,
    y: summaryBoxY - 15,
    size: 9,
    font: fontHelveticaBold,
    color: primaryColor,
  });

  page.drawText('Total Credits (7 Inflows): INR 40,800.00', {
    x: 45,
    y: summaryBoxY - 32,
    size: 8,
    font: fontHelvetica,
    color: rgb(0.1, 0.5, 0.2),
  });

  page.drawText('Total Debits (3 Outflows): INR 42,950.00', {
    x: 230,
    y: summaryBoxY - 32,
    size: 8,
    font: fontHelvetica,
    color: rgb(0.7, 0.1, 0.1),
  });

  page.drawText('Closing Balance (07/10/2026): INR 82,350.00', {
    x: 400,
    y: summaryBoxY - 32,
    size: 8,
    font: fontHelveticaBold,
    color: primaryColor,
  });

  // Footer Disclaimer
  page.drawText(
    '* This is a computer-generated bank statement for Shree Ganesh Enterprises and requires no physical signature.',
    {
      x: 30,
      y: 35,
      size: 7,
      font: fontHelvetica,
      color: grayColor,
    }
  );

  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);

  if (outputPath) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, pdfBuffer);
    console.log(`Generated sample bank statement PDF: ${outputPath} (${pdfBuffer.length} bytes)`);
  }

  return pdfBuffer;
}

if (require.main === module) {
  const target = path.join(__dirname, '../sample_data/sample_upi_bank_statement.pdf');
  generateSampleBankStatementPdf(target)
    .then(() => console.log('Sample PDF generation completed!'))
    .catch((err) => console.error('Error generating PDF:', err));
}
