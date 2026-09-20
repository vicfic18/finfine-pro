import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';

interface TransactionItem {
  date: string; // DD/MM/YYYY
  rawDate: Date;
  narration: string;
  ref: string;
  debit?: number;
  credit?: number;
  balance?: number;
}

function formatINR(val: number): string {
  return val.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Generate 6 months of realistic Indian MSME transaction data (May 2026 to October 2026)
 * Captures:
 * 1. Sparse monsoon lulls (June/July)
 * 2. Mega festive surges (Sept/Oct - Big Billion Days, Dussehra, Dhanteras, Diwali)
 * 3. Strict Indian recurring obligations (Rent, Salaries, EMIs, BESCOM, Airtel)
 * 4. Statutory tax calendar (7th TDS, 15th EPFO, 20th GSTR-3B, Advance Tax 15th June & Sept)
 */
export function buildSixMonthTransactions(): {
  openingBalance: number;
  closingBalance: number;
  totalDebits: number;
  totalCredits: number;
  transactions: TransactionItem[];
} {
  const transactions: TransactionItem[] = [];
  const openingBalance = 145000.0;
  let runningBalance = openingBalance;
  let totalDebits = 0;
  let totalCredits = 0;

  let refCounter = 4058100100;

  // Monthly loops from May 2026 (month 4) to October 2026 (month 9)
  for (let m = 4; m <= 9; m++) {
    const year = 2026;
    const month = m; // 4: May, 5: Jun, 6: Jul, 7: Aug, 8: Sep, 9: Oct

    // 1. Rent on 1st
    const rentDate = new Date(year, month, 1);
    transactions.push({
      date: formatDate(rentDate),
      rawDate: rentDate,
      narration: `NEFT/DR/${refCounter++}/RAJESH_GUPTA_RENT_SHOP42/COMMERCIAL_RENT`,
      ref: String(refCounter),
      debit: 35000,
    });

    // 2. Term Loan EMI on 5th
    const emiDate = new Date(year, month, 5);
    transactions.push({
      date: formatDate(emiDate),
      rawDate: emiDate,
      narration: `NACH/DR/${refCounter++}/HDFC_LOAN_RECOVERY/MSME_TERM_LOAN_EMI_48`,
      ref: String(refCounter),
      debit: 18500,
    });

    // 3. TDS on 7th
    const tdsDate = new Date(year, month, 7);
    transactions.push({
      date: formatDate(tdsDate),
      rawDate: tdsDate,
      narration: `NEFT/DR/${refCounter++}/NSDL_TIN_TDS_CHALLAN_ITNS281_SEC194C`,
      ref: String(refCounter),
      debit: 4200,
    });

    // 4. Staff Salaries on 10th
    const salaryDate = new Date(year, month, 10);
    transactions.push({
      date: formatDate(salaryDate),
      rawDate: salaryDate,
      narration: `NEFT/DR/${refCounter++}/CMS_BATCH_PAYROLL_SALARIES_STAFF_8`,
      ref: String(refCounter),
      debit: 82000,
    });

    // 5. Utility Bills on 12th
    const utilDate = new Date(year, month, 12);
    const powerAmount = 3600 + Math.floor(Math.random() * 900);
    transactions.push({
      date: formatDate(utilDate),
      rawDate: utilDate,
      narration: `UPI/DR/${refCounter++}/BESCOM_POWER_BILL_BANGALORE@sbi`,
      ref: String(refCounter),
      debit: powerAmount,
    });
    transactions.push({
      date: formatDate(utilDate),
      rawDate: utilDate,
      narration: `UPI/DR/${refCounter++}/AIRTEL_BROADBAND_OFFICE@airtel/INTERNET`,
      ref: String(refCounter),
      debit: 1999,
    });

    // 6. EPFO / ESIC on 15th
    const epfoDate = new Date(year, month, 15);
    transactions.push({
      date: formatDate(epfoDate),
      rawDate: epfoDate,
      narration: `NEFT/DR/${refCounter++}/EPFO_ELECTRONIC_CHALLAN_TRRN_REMITTANCE`,
      ref: String(refCounter),
      debit: 6850,
    });

    // Advance Tax installments on 15th of June and 15th of September
    if (month === 5 || month === 8) {
      transactions.push({
        date: formatDate(epfoDate),
        rawDate: epfoDate,
        narration: `NEFT/DR/${refCounter++}/IT_DEPT_ADVANCE_TAX_Q${month === 5 ? 1 : 2}_CHALLAN_280`,
        ref: String(refCounter),
        debit: 25000,
      });
    }

    // 7. GSTR-3B Tax payment on 20th
    const gstDate = new Date(year, month, 20);
    // Higher GST payment in October because September sales surged
    const gstAmount = month === 9 ? 64500 : month === 8 ? 48200 : 32500;
    transactions.push({
      date: formatDate(gstDate),
      rawDate: gstDate,
      narration: `NEFT/DR/${refCounter++}/GSTN_CPIN_TAX_DEPOSIT_GSTR3B_CHALLAN`,
      ref: String(refCounter),
      debit: gstAmount,
    });

    // 8. Wholesale Inventory Restocking on 24th-26th
    const inventoryDate = new Date(year, month, 25);
    // Heavy festive inventory stockup in September & October
    const invAmount = month === 8 ? 145000 : month === 9 ? 185000 : 75000;
    transactions.push({
      date: formatDate(inventoryDate),
      rawDate: inventoryDate,
      narration: `NEFT/DR/${refCounter++}/AGGARWAL_WHOLESALE_TRADERS@icici/INVENTORY_BULK`,
      ref: String(refCounter),
      debit: invAmount,
    });

    // 9. Daily / Semi-daily Customer Inflows (UPI & Merchant Settlements)
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = new Date(year, month, day);
      const dayOfWeek = currentDate.getDay(); // 0 is Sunday, 6 is Saturday

      // Simulate seasonal volume multiplier:
      // Month 8 (Sept) and Month 9 (Oct): Festive surge (Navratri, Dussehra, Dhanteras, Diwali + Great Indian Festival)
      let festiveMultiplier = 1.0;
      if (month === 8) {
        festiveMultiplier = 1.6; // Pre-festive inventory build and initial festive sales
      } else if (month === 9) {
        // October: Peak festive season in 2026 (Navratri Oct 11-19, Dussehra Oct 20, Dhanteras Oct 28, Diwali Oct 31)
        festiveMultiplier = day >= 10 ? 2.8 : 2.0;
      } else if (month === 5 || month === 6) {
        festiveMultiplier = 0.85; // Monsoon lull
      }

      // Skip some weekdays during monsoon to create realistic sparse data points
      if ((month === 5 || month === 6) && (day % 4 === 0) && dayOfWeek !== 0 && dayOfWeek !== 6) {
        continue; // Sparse day with no direct bank settlements
      }

      // Weekend footfall surge
      const weekendBonus = dayOfWeek === 0 || dayOfWeek === 6 ? 1.4 : 1.0;

      // 1-3 UPI customer credits per active day
      const inflowCount = (month >= 8 && day >= 10) ? 3 : (day % 2 === 0 ? 2 : 1);

      for (let i = 0; i < inflowCount; i++) {
        let baseAmount = (month >= 8) ? (12000 + (day * 650) % 25000) : (6500 + (day * 400) % 15000);
        baseAmount = Math.round(baseAmount * festiveMultiplier * weekendBonus);

        const providers = [
          'PhonePeMerchant/Store_Sales_Collection',
          'Paytm_Retail_Counter_QR_Settlement',
          'GPay_Customer_Direct_UPI_Transfer',
          'BharatPe_POS_QR_Aggregated_Payout',
          'PineLabs_UPI_Card_Settlement_Batch',
        ];
        const prov = providers[(day + i) % providers.length];

        transactions.push({
          date: formatDate(currentDate),
          rawDate: currentDate,
          narration: `UPI/CR/${refCounter++}/${prov}`,
          ref: String(refCounter),
          credit: baseAmount,
        });
      }

      // Occasional B2B Customer bulk invoice collection (T+15 / T+30 payments)
      if (day === 8 || day === 18 || day === 28) {
        const b2bAmount = (month >= 8) ? 65000 : 38000;
        const b2bClients = [
          'Apex_Retail_Distributors_NEFT_CLEARING',
          'Balaji_Departmental_Store_RTGS_CREDIT',
          'Royal_Traders_Direct_Transfer_Settlement',
        ];
        const client = b2bClients[(month + day) % b2bClients.length];

        transactions.push({
          date: formatDate(currentDate),
          rawDate: currentDate,
          narration: `NEFT/CR/${refCounter++}/${client}`,
          ref: String(refCounter),
          credit: b2bAmount,
        });
      }
    }
  }

  // Sort strictly by rawDate
  transactions.sort((a, b) => a.rawDate.getTime() - b.rawDate.getTime());

  // Compute exact running balances
  for (const tx of transactions) {
    if (tx.debit) {
      runningBalance -= tx.debit;
      totalDebits += tx.debit;
    }
    if (tx.credit) {
      runningBalance += tx.credit;
      totalCredits += tx.credit;
    }
    tx.balance = runningBalance;
  }

  return {
    openingBalance,
    closingBalance: runningBalance,
    totalDebits,
    totalCredits,
    transactions,
  };
}

/**
 * Render the multi-page A4 bank statement PDF
 */
export async function generateSixMonthStatementPdf(outputPath?: string): Promise<Buffer> {
  const data = buildSixMonthTransactions();
  const pdfDoc = await PDFDocument.create();

  const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontHelveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const primaryColor = rgb(0.06, 0.22, 0.44); // HDFC Navy Blue
  const secondaryColor = rgb(0.12, 0.42, 0.72);
  const darkTextColor = rgb(0.1, 0.1, 0.1);
  const grayColor = rgb(0.4, 0.4, 0.4);
  const lightBgColor = rgb(0.96, 0.97, 0.99);
  const borderLineColor = rgb(0.82, 0.85, 0.9);
  const debitColor = rgb(0.75, 0.12, 0.12);
  const creditColor = rgb(0.1, 0.55, 0.22);

  const PAGE_WIDTH = 595.28; // A4
  const PAGE_HEIGHT = 841.89;
  const MARGIN_X = 28;
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

  const colX = {
    date: 34,
    narration: 92,
    ref: 330,
    withdrawal: 405,
    deposit: 472,
    balance: 532,
  };

  const ROWS_PER_FIRST_PAGE = 20;
  const ROWS_PER_SUBSEQUENT_PAGE = 27;

  // Split transactions into pages
  const pagesTx: TransactionItem[][] = [];
  let currentIndex = 0;

  // First page takes fewer rows due to big customer details header
  pagesTx.push(data.transactions.slice(currentIndex, currentIndex + ROWS_PER_FIRST_PAGE));
  currentIndex += ROWS_PER_FIRST_PAGE;

  while (currentIndex < data.transactions.length) {
    const chunk = data.transactions.slice(currentIndex, currentIndex + ROWS_PER_SUBSEQUENT_PAGE);
    pagesTx.push(chunk);
    currentIndex += ROWS_PER_SUBSEQUENT_PAGE;
  }

  const totalPages = pagesTx.length;

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const isFirstPage = pageIdx === 0;
    const isLastPage = pageIdx === totalPages - 1;

    // --- Header Section ---
    if (isFirstPage) {
      // Big Top Banner
      page.drawRectangle({
        x: MARGIN_X,
        y: PAGE_HEIGHT - 80,
        width: CONTENT_WIDTH,
        height: 52,
        color: primaryColor,
      });

      page.drawText('HDFC BANK', {
        x: 42,
        y: PAGE_HEIGHT - 52,
        size: 19,
        font: fontHelveticaBold,
        color: rgb(1, 1, 1),
      });

      page.drawText('CURRENT ACCOUNT STATEMENT OF ACCOUNT • 6-MONTH AUDIT VIEW', {
        x: 42,
        y: PAGE_HEIGHT - 68,
        size: 8.5,
        font: fontHelvetica,
        color: rgb(0.85, 0.9, 0.98),
      });

      page.drawText('Branch: MG Road, Bengaluru - 560001\nIFSC: HDFC0001234 | MICR: 560240002', {
        x: PAGE_WIDTH - 240,
        y: PAGE_HEIGHT - 55,
        size: 7.5,
        font: fontHelvetica,
        color: rgb(0.9, 0.93, 0.98),
        lineHeight: 11,
      });

      // Customer & Account Details Box
      page.drawRectangle({
        x: MARGIN_X,
        y: PAGE_HEIGHT - 176,
        width: CONTENT_WIDTH,
        height: 88,
        color: lightBgColor,
        borderColor: borderLineColor,
        borderWidth: 1,
      });

      // Left Column
      let y = PAGE_HEIGHT - 104;
      page.drawText('Account Name:', { x: 42, y, size: 8, font: fontHelvetica, color: grayColor });
      page.drawText('SHREE GANESH ENTERPRISES', { x: 130, y, size: 8.5, font: fontHelveticaBold, color: darkTextColor });

      y -= 15;
      page.drawText('Trade Name:', { x: 42, y, size: 8, font: fontHelvetica, color: grayColor });
      page.drawText('Ganesh Retail & Wholesale Electronics', { x: 130, y, size: 8, font: fontHelvetica, color: darkTextColor });

      y -= 15;
      page.drawText('Address:', { x: 42, y, size: 8, font: fontHelvetica, color: grayColor });
      page.drawText('#42/B, Market Yard Road, Bengaluru - 560002', { x: 130, y, size: 8, font: fontHelvetica, color: darkTextColor });

      y -= 15;
      page.drawText('GSTIN / PAN:', { x: 42, y, size: 8, font: fontHelvetica, color: grayColor });
      page.drawText('27AABCS1429B1Z5  |  PAN: AABCS1429B', { x: 130, y, size: 8, font: fontHelveticaBold, color: secondaryColor });

      // Right Column
      y = PAGE_HEIGHT - 104;
      const rightLabelX = 330;
      const rightValX = 422;

      page.drawText('Account Number:', { x: rightLabelX, y, size: 8, font: fontHelvetica, color: grayColor });
      page.drawText('50200083921045', { x: rightValX, y, size: 8.5, font: fontHelveticaBold, color: darkTextColor });

      y -= 15;
      page.drawText('Statement Period:', { x: rightLabelX, y, size: 8, font: fontHelvetica, color: grayColor });
      page.drawText('01/05/2026 to 31/10/2026 (6 Months)', { x: rightValX, y, size: 8, font: fontHelveticaBold, color: darkTextColor });

      y -= 15;
      page.drawText('Opening Balance:', { x: rightLabelX, y, size: 8, font: fontHelvetica, color: grayColor });
      page.drawText(`INR ${formatINR(data.openingBalance)}`, { x: rightValX, y, size: 8, font: fontHelveticaBold, color: darkTextColor });

      y -= 15;
      page.drawText('Currency / Type:', { x: rightLabelX, y, size: 8, font: fontHelvetica, color: grayColor });
      page.drawText('INR | Current Account (MSME)', { x: rightValX, y, size: 8, font: fontHelvetica, color: darkTextColor });
    } else {
      // Subsequent Pages: Compact Header
      page.drawRectangle({
        x: MARGIN_X,
        y: PAGE_HEIGHT - 48,
        width: CONTENT_WIDTH,
        height: 28,
        color: primaryColor,
      });

      page.drawText('HDFC BANK  |  SHREE GANESH ENTERPRISES  |  A/C: 50200083921045', {
        x: 38,
        y: PAGE_HEIGHT - 32,
        size: 8.5,
        font: fontHelveticaBold,
        color: rgb(1, 1, 1),
      });

      page.drawText(`Period: 01/05/2026 - 31/10/2026  |  Page ${pageIdx + 1} of ${totalPages}`, {
        x: PAGE_WIDTH - 240,
        y: PAGE_HEIGHT - 32,
        size: 7.5,
        font: fontHelvetica,
        color: rgb(0.85, 0.92, 0.98),
      });
    }

    // --- Table Column Header ---
    const tableTopY = isFirstPage ? PAGE_HEIGHT - 200 : PAGE_HEIGHT - 65;

    page.drawRectangle({
      x: MARGIN_X,
      y: tableTopY - 18,
      width: CONTENT_WIDTH,
      height: 18,
      color: primaryColor,
    });

    page.drawText('Date', { x: colX.date, y: tableTopY - 13, size: 7.5, font: fontHelveticaBold, color: rgb(1, 1, 1) });
    page.drawText('Narration / Description', { x: colX.narration, y: tableTopY - 13, size: 7.5, font: fontHelveticaBold, color: rgb(1, 1, 1) });
    page.drawText('Ref / Chq No', { x: colX.ref, y: tableTopY - 13, size: 7.5, font: fontHelveticaBold, color: rgb(1, 1, 1) });
    page.drawText('Debit (Dr)', { x: colX.withdrawal, y: tableTopY - 13, size: 7.5, font: fontHelveticaBold, color: rgb(1, 1, 1) });
    page.drawText('Credit (Cr)', { x: colX.deposit, y: tableTopY - 13, size: 7.5, font: fontHelveticaBold, color: rgb(1, 1, 1) });
    page.drawText('Balance', { x: colX.balance, y: tableTopY - 13, size: 7.5, font: fontHelveticaBold, color: rgb(1, 1, 1) });

    // --- Rows Rendering ---
    let rowY = tableTopY - 34;
    const pageTxList = pagesTx[pageIdx] || [];

    pageTxList.forEach((tx, rowIdx) => {
      // Alternating row background
      if (rowIdx % 2 === 1) {
        page.drawRectangle({
          x: MARGIN_X,
          y: rowY - 4,
          width: CONTENT_WIDTH,
          height: 19,
          color: lightBgColor,
        });
      }

      page.drawText(tx.date, { x: colX.date, y: rowY + 1, size: 7, font: fontHelvetica, color: darkTextColor });
      // Truncate narration to fit column cleanly
      const desc = tx.narration.length > 50 ? tx.narration.substring(0, 48) + '...' : tx.narration;
      page.drawText(desc, { x: colX.narration, y: rowY + 1, size: 6.8, font: fontHelvetica, color: darkTextColor });
      page.drawText(tx.ref.substring(0, 12), { x: colX.ref, y: rowY + 1, size: 6.5, font: fontHelvetica, color: grayColor });

      if (tx.debit) {
        page.drawText(formatINR(tx.debit), {
          x: colX.withdrawal,
          y: rowY + 1,
          size: 7,
          font: fontHelveticaBold,
          color: debitColor,
        });
      }

      if (tx.credit) {
        page.drawText(formatINR(tx.credit), {
          x: colX.deposit,
          y: rowY + 1,
          size: 7,
          font: fontHelveticaBold,
          color: creditColor,
        });
      }

      page.drawText(formatINR(tx.balance ?? 0), {
        x: colX.balance,
        y: rowY + 1,
        size: 7,
        font: fontHelveticaBold,
        color: darkTextColor,
      });

      // Bottom borderline
      page.drawLine({
        start: { x: MARGIN_X, y: rowY - 4 },
        end: { x: PAGE_WIDTH - MARGIN_X, y: rowY - 4 },
        color: borderLineColor,
        thickness: 0.4,
      });

      rowY -= 19;
    });

    // --- Last Page Summary Box ---
    if (isLastPage) {
      const summaryBoxY = Math.max(50, rowY - 15);

      page.drawRectangle({
        x: MARGIN_X,
        y: summaryBoxY - 48,
        width: CONTENT_WIDTH,
        height: 52,
        color: lightBgColor,
        borderColor: primaryColor,
        borderWidth: 1,
      });

      page.drawText('STATEMENT AUDIT SUMMARY (01/05/2026 - 31/10/2026)', {
        x: 42,
        y: summaryBoxY - 14,
        size: 8.5,
        font: fontHelveticaBold,
        color: primaryColor,
      });

      page.drawText(
        `Opening Balance: INR ${formatINR(data.openingBalance)}  |  Total Deposits: INR ${formatINR(data.totalCredits)} (${data.transactions.filter((t) => t.credit).length} Txns)`,
        { x: 42, y: summaryBoxY - 28, size: 7.5, font: fontHelvetica, color: creditColor }
      );

      page.drawText(
        `Total Withdrawals: INR ${formatINR(data.totalDebits)} (${data.transactions.filter((t) => t.debit).length} Txns)  |  Closing Balance (31/10/2026): INR ${formatINR(data.closingBalance)}`,
        { x: 42, y: summaryBoxY - 42, size: 7.5, font: fontHelveticaBold, color: primaryColor }
      );
    }

    // --- Footer on Every Page ---
    page.drawText(
      `* Computer-generated 6-month bank statement for Shree Ganesh Enterprises. Registered GSTIN: 27AABCS1429B1Z5. Page ${pageIdx + 1} of ${totalPages}`,
      {
        x: MARGIN_X,
        y: 18,
        size: 6.5,
        font: fontHelvetica,
        color: grayColor,
      }
    );
  }

  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);

  if (outputPath) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, pdfBuffer);
    console.log(
      `Successfully generated 6-month bank statement PDF: ${outputPath} (${pdfBuffer.length} bytes, ${totalPages} pages, ${data.transactions.length} transactions)`
    );
  }

  return pdfBuffer;
}

// CLI Execution
if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('generate-6month-statement')) {
  const target = path.join(__dirname, '../sample_data/sample_6month_hdfc_statement.pdf');
  generateSixMonthStatementPdf(target)
    .then(() => console.log('✅ 6-Month Indian Bank Statement generation complete!'))
    .catch((err) => {
      console.error('❌ Error generating 6-month statement:', err);
      process.exit(1);
    });
}
