import PDFDocument from 'pdfkit';
import {
  AssessmentReportData,
  ConsolidatedReportData,
  SubjectReportData,
  StudentIndividualReportData,
  DetailedRubricReportData
} from './assessmentReportTypes.js';

/**
 * Standard Institutional Palette for SJBIT & AcadAssess
 */
const COLORS = {
  primary: '#1B4D3E',     // Academic Deep Green
  primaryDark: '#0D2B22',
  headerBg: '#EBF4F0',    // Soft institutional sage/mint
  headerBorder: '#1B4D3E',
  subHeaderBg: '#F4F8F6',
  rowBorder: '#D0DDD7',
  zebraBg: '#F9FBFB',
  white: '#FFFFFF',
  textDark: '#111827',
  textMuted: '#4B5563',
  tagPending: '#B45309',
  tagAwaiting: '#4338CA',
  tagZero: '#6B7280'
};

/**
 * Main dispatcher to generate a PDF buffer from AssessmentReportData
 */
export async function generateAssessmentReportPdf(data: AssessmentReportData): Promise<Buffer> {
  switch (data.report_type) {
    case 'consolidated':
      return generateConsolidatedPdf(data);
    case 'subject':
      return generateSubjectPdf(data);
    case 'student':
      return generateStudentPdf(data);
    case 'rubric':
      return generateRubricPdf(data);
    default:
      throw new Error(`Unsupported report type: ${(data as any).report_type}`);
  }
}

/**
 * Helper to collect PDFDocument stream into a Buffer
 */
function streamToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const buffers: Buffer[] = [];
    doc.on('data', chunk => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', err => reject(err));
  });
}

/**
 * 1. CONSOLIDATED ASSESSMENT MARKS REPORT (A3 LANDSCAPE)
 * Official institutional layout with 2-level merged table header,
 * grouped subject headings, dynamic assessment columns, and ascending USN rows.
 */
async function generateConsolidatedPdf(data: ConsolidatedReportData): Promise<Buffer> {
  // A3 Landscape dimensions in points: 1190.55 x 841.89
  const doc = new PDFDocument({
    size: 'A3',
    layout: 'landscape',
    margins: { top: 36, bottom: 20, left: 36, right: 36 },
    bufferPages: true,
    autoFirstPage: true
  });

  const bufferPromise = streamToBuffer(doc);

  const pageWidth = 1190.55;
  const pageHeight = 841.89;
  const marginLeft = 36;
  const marginRight = 36;
  const marginTop = 36;
  const marginBottom = 40;
  const usableWidth = pageWidth - marginLeft - marginRight; // 1118.55 pt

  // Layout metrics
  const slNoWidth = 45;
  const usnWidth = 100;
  const nameWidth = 200;
  const fixedWidthTotal = slNoWidth + usnWidth + nameWidth; // 345 pt
  const remainingWidth = usableWidth - fixedWidthTotal; // 773.55 pt

  // Determine total assessment columns across subjects
  interface FlattenedCol {
    subject_id: string;
    subject_code: string;
    subject_name: string;
    assessment_id: string;
    title: string;
    short_label: string;
    max_marks: number;
    width: number;
    is_total?: boolean;
  }

  const flattenedCols: FlattenedCol[] = [];
  const subjectSpans: Array<{
    subject_code: string;
    subject_name: string;
    colCount: number;
    width: number;
  }> = [];

  for (const subj of data.subjects) {
    if (subj.assessments.length === 0) {
      // Placeholder column if subject has no assessments yet
      flattenedCols.push({
        subject_id: subj.subject_id,
        subject_code: subj.subject_code,
        subject_name: subj.subject_name,
        assessment_id: `none_${subj.subject_id}`,
        title: 'No Assessment',
        short_label: '—',
        max_marks: 0,
        width: 0, // calculated below
        is_total: false
      });
      subjectSpans.push({
        subject_code: subj.subject_code,
        subject_name: subj.subject_name,
        colCount: 1,
        width: 0
      });
    } else {
      for (const a of subj.assessments) {
        flattenedCols.push({
          subject_id: subj.subject_id,
          subject_code: subj.subject_code,
          subject_name: subj.subject_name,
          assessment_id: a.assessment_id,
          title: a.title,
          short_label: a.short_label,
          max_marks: a.max_marks,
          width: 0,
          is_total: false
        });
      }
      // Subject Total column: FA1 | FA2 | ... | Total
      flattenedCols.push({
        subject_id: subj.subject_id,
        subject_code: subj.subject_code,
        subject_name: subj.subject_name,
        assessment_id: `total_${subj.subject_id}`,
        title: 'Total',
        short_label: 'Total',
        max_marks: subj.assessments.reduce((sum, a) => sum + (a.max_marks || 0), 0),
        width: 0,
        is_total: true
      });
      subjectSpans.push({
        subject_code: subj.subject_code,
        subject_name: subj.subject_name,
        colCount: subj.assessments.length + 1,
        width: 0
      });
    }
  }

  const totalCols = flattenedCols.length;
  const colWidth = Math.max(85, Math.floor(remainingWidth / Math.max(1, totalCols)));
  flattenedCols.forEach(c => (c.width = colWidth));

  let currentSpanIdx = 0;
  for (const span of subjectSpans) {
    span.width = span.colCount * colWidth;
  }

  // Header Draw Function (repeated on every page)
  function drawPageHeader(isContinuation = false) {
    const startY = marginTop;
    doc.save();

    // Institutional Banner Box
    doc
      .rect(marginLeft, startY, usableWidth, 70)
      .fillAndStroke(COLORS.headerBg, COLORS.headerBorder);

    // Text details inside banner
    doc.font('Helvetica-Bold').fontSize(14).fillColor(COLORS.primaryDark);
    doc.text(data.institution, marginLeft, startY + 8, {
      width: usableWidth,
      align: 'center'
    });

    doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.primary);
    doc.text(data.department, marginLeft, startY + 26, {
      width: usableWidth,
      align: 'center'
    });

    doc.font('Helvetica-Bold').fontSize(12).fillColor(COLORS.primaryDark);
    const mainTitle = isContinuation
      ? `${data.heading} (Continued)`
      : data.heading;
    doc.text(`${data.stream} — ${mainTitle}`, marginLeft, startY + 42, {
      width: usableWidth,
      align: 'center'
    });

    // Sub-header Meta Bar
    const metaY = startY + 74;
    doc
      .rect(marginLeft, metaY, usableWidth, 20)
      .fillAndStroke('#FAFCFB', COLORS.rowBorder);

    doc.font('Helvetica').fontSize(9).fillColor(COLORS.textDark);
    const metaLeft = ` Academic Year: ${data.academic_year}   |   Semester: ${data.semester}   |   Section: ${data.section}   |   Scope: ${data.scope_label}`;
    const metaRight = `Generated on: ${data.generated_at}   |   By: ${data.generated_by} (${data.role_label}) `;
    doc.text(metaLeft, marginLeft + 6, metaY + 5);
    doc.text(metaRight, marginLeft, metaY + 5, {
      width: usableWidth - 6,
      align: 'right'
    });

    // 2-Level Merged Table Headers
    const tableHeaderY = metaY + 26;
    const headerRow1Height = 28;
    const headerRow2Height = 22;
    const totalHeaderHeight = headerRow1Height + headerRow2Height;

    // Draw background for Level 1 & Level 2
    doc
      .rect(marginLeft, tableHeaderY, usableWidth, headerRow1Height)
      .fillAndStroke(COLORS.headerBg, COLORS.headerBorder);

    doc
      .rect(marginLeft, tableHeaderY + headerRow1Height, usableWidth, headerRow2Height)
      .fillAndStroke(COLORS.subHeaderBg, COLORS.headerBorder);

    // Column: Sl. No (spans both rows)
    doc
      .rect(marginLeft, tableHeaderY, slNoWidth, totalHeaderHeight)
      .fillAndStroke(COLORS.headerBg, COLORS.headerBorder);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.primaryDark);
    doc.text('Sl.\nNo.', marginLeft, tableHeaderY + 14, {
      width: slNoWidth,
      align: 'center'
    });

    // Column: USN (spans both rows)
    const usnX = marginLeft + slNoWidth;
    doc
      .rect(usnX, tableHeaderY, usnWidth, totalHeaderHeight)
      .fillAndStroke(COLORS.headerBg, COLORS.headerBorder);
    doc.text('USN', usnX, tableHeaderY + 18, {
      width: usnWidth,
      align: 'center'
    });

    // Column: Student Name (spans both rows)
    const nameX = usnX + usnWidth;
    doc
      .rect(nameX, tableHeaderY, nameWidth, totalHeaderHeight)
      .fillAndStroke(COLORS.headerBg, COLORS.headerBorder);
    doc.text('Student Full Name', nameX + 8, tableHeaderY + 18, {
      width: nameWidth - 16,
      align: 'left'
    });

    // Subject Group Headings (Level 1)
    let curX = nameX + nameWidth;
    for (const span of subjectSpans) {
      doc
        .rect(curX, tableHeaderY, span.width, headerRow1Height)
        .fillAndStroke(COLORS.headerBg, COLORS.headerBorder);

      doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.primaryDark);
      doc.text(`${span.subject_code} — ${span.subject_name}`, curX + 4, tableHeaderY + 8, {
        width: span.width - 8,
        align: 'center',
        ellipsis: true
      });
      curX += span.width;
    }

    // Assessment Columns (Level 2)
    curX = nameX + nameWidth;
    for (const col of flattenedCols) {
      doc
        .rect(curX, tableHeaderY + headerRow1Height, col.width, headerRow2Height)
        .fillAndStroke(COLORS.subHeaderBg, COLORS.headerBorder);

      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.primary);
      const label = col.is_total
        ? 'Total'
        : (col.max_marks > 0 ? `${col.short_label} (Max: ${col.max_marks})` : col.short_label);
      doc.text(label, curX, tableHeaderY + headerRow1Height + 6, {
        width: col.width,
        align: 'center'
      });
      curX += col.width;
    }

    doc.restore();
    return tableHeaderY + totalHeaderHeight;
  }

  // Draw Student Data Rows
  let curY = drawPageHeader(false);
  const rowHeight = 22;
  const bottomThreshold = pageHeight - marginBottom - 75; // Leave room for signatures

  for (let i = 0; i < data.students.length; i++) {
    const st = data.students[i];

    // Check pagination
    if (curY + rowHeight > bottomThreshold) {
      doc.addPage({ size: 'A3', layout: 'landscape', margins: { top: 36, bottom: 40, left: 36, right: 36 } });
      curY = drawPageHeader(true);
    }

    doc.save();
    const isZebra = i % 2 === 1;
    const bg = isZebra ? COLORS.zebraBg : COLORS.white;

    // Row Background
    doc
      .rect(marginLeft, curY, usableWidth, rowHeight)
      .fillAndStroke(bg, COLORS.rowBorder);

    // 1. Sl. No
    doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.textDark);
    doc.text(String(st.sl_no), marginLeft, curY + 6, {
      width: slNoWidth,
      align: 'center'
    });

    // 2. USN
    const usnX = marginLeft + slNoWidth;
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.primaryDark);
    doc.text(st.usn, usnX, curY + 6, {
      width: usnWidth,
      align: 'center'
    });

    // 3. Student Name
    const nameX = usnX + usnWidth;
    doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.textDark);
    doc.text(st.full_name, nameX + 8, curY + 6, {
      width: nameWidth - 16,
      align: 'left',
      ellipsis: true
    });

    // Vertical column borders for fixed columns
    doc.strokeColor(COLORS.rowBorder);
    doc.moveTo(usnX, curY).lineTo(usnX, curY + rowHeight).stroke();
    doc.moveTo(nameX, curY).lineTo(nameX, curY + rowHeight).stroke();
    doc.moveTo(nameX + nameWidth, curY).lineTo(nameX + nameWidth, curY + rowHeight).stroke();

    // 4. Assessment Mark Cells
    let cellX = nameX + nameWidth;
    for (const col of flattenedCols) {
      let displayText = '';
      let textColor = COLORS.textDark;
      let isBold = false;
      let fontSize = 8.5;

      if (col.is_total) {
        const subjTotal = st.subject_totals?.[col.subject_id];
        if (subjTotal && typeof subjTotal.total_score === 'number') {
          displayText = String(subjTotal.total_score);
          isBold = true;
          textColor = COLORS.primaryDark;
        } else {
          // No published marks: clean blank cell
          displayText = '';
        }
      } else {
        const cell = st.marks[col.assessment_id];
        const val = cell ? cell.value : null;

        if (val === null || val === undefined) {
          displayText = '';
        } else if (val === 'Not Submitted') {
          displayText = 'Not Submitted';
          textColor = COLORS.textMuted;
          fontSize = 7;
          isBold = false;
        } else if (typeof val === 'number') {
          displayText = String(val);
          isBold = true;
          textColor = COLORS.textDark;
        } else if (val === '—') {
          displayText = '—';
          textColor = COLORS.textMuted;
        } else {
          displayText = String(val);
        }
      }

      if (displayText) {
        doc.font(isBold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize).fillColor(textColor);
        doc.text(displayText, cellX, curY + 6, {
          width: col.width,
          align: 'center'
        });
      }

      doc.strokeColor(COLORS.rowBorder);
      doc.moveTo(cellX + col.width, curY).lineTo(cellX + col.width, curY + rowHeight).stroke();
      cellX += col.width;
    }

    doc.restore();
    curY += rowHeight;
  }

  // Draw Signatures Block on Final Page
  const sigY = pageHeight - marginBottom - 55;
  doc.save();

  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.textDark);
  const sigColWidth = usableWidth / 3;

  // 1. Subject Teacher Signature
  doc.text('__________________________________', marginLeft, sigY, { width: sigColWidth, align: 'center' });
  doc.text('Subject Teacher', marginLeft, sigY + 14, { width: sigColWidth, align: 'center' });
  doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.textMuted);
  doc.text('Signature & Date', marginLeft, sigY + 25, { width: sigColWidth, align: 'center' });

  // 2. Class Teacher Signature
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.textDark);
  doc.text('__________________________________', marginLeft + sigColWidth, sigY, { width: sigColWidth, align: 'center' });
  doc.text('Class Teacher', marginLeft + sigColWidth, sigY + 14, { width: sigColWidth, align: 'center' });
  doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.textMuted);
  doc.text('Signature & Date', marginLeft + sigColWidth, sigY + 25, { width: sigColWidth, align: 'center' });

  // 3. HOD Signature
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.textDark);
  doc.text('__________________________________', marginLeft + sigColWidth * 2, sigY, { width: sigColWidth, align: 'center' });
  doc.text('HOD / Authorized Signatory', marginLeft + sigColWidth * 2, sigY + 14, { width: sigColWidth, align: 'center' });
  doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.textMuted);
  doc.text('Department of MCA, SJBIT', marginLeft + sigColWidth * 2, sigY + 25, { width: sigColWidth, align: 'center' });

  doc.restore();

  // Final Pass: Apply Header / Footer & Exact Page Numbers to all pages
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    doc.save();
    const footerY = pageHeight - 24;
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.textMuted);
    doc.text('Generated through AcadAssess (Formative Assessment & Evaluation System)', marginLeft, footerY, {
      lineBreak: false
    });
    doc.text(`Page ${i + 1} of ${range.count}`, marginLeft + usableWidth - 150, footerY, {
      width: 150,
      align: 'right',
      lineBreak: false
    });
    doc.restore();
  }

  doc.end();
  return bufferPromise;
}

/**
 * 2. SUBJECT-SPECIFIC ASSESSMENT MARKS REPORT (A4 LANDSCAPE)
 * Displays all assessments and marks for one specific Security stream subject.
 */
async function generateSubjectPdf(data: SubjectReportData): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margins: { top: 36, bottom: 20, left: 36, right: 36 },
    bufferPages: true,
    autoFirstPage: true
  });

  const bufferPromise = streamToBuffer(doc);

  const pageWidth = 841.89;
  const pageHeight = 595.28;
  const marginLeft = 36;
  const marginRight = 36;
  const marginTop = 28;
  const marginBottom = 36;
  const usableWidth = pageWidth - marginLeft - marginRight; // 769.89 pt

  const slNoWidth = 45;
  const usnWidth = 110;
  const nameWidth = 200;
  const fixedWidth = slNoWidth + usnWidth + nameWidth; // 355 pt
  const remainingWidth = usableWidth - fixedWidth; // 414.89 pt

  const hasAssessments = data.assessments.length > 0;
  const colCount = Math.max(1, data.assessments.length + (hasAssessments ? 1 : 0));
  const colWidth = Math.floor(remainingWidth / colCount);

  function drawSubjectHeader(isContinuation = false) {
    const startY = marginTop;
    doc.save();

    doc
      .rect(marginLeft, startY, usableWidth, 52)
      .fillAndStroke(COLORS.headerBg, COLORS.headerBorder);

    doc.font('Helvetica-Bold').fontSize(12.5).fillColor(COLORS.primaryDark);
    doc.text(data.institution, marginLeft, startY + 5, { width: usableWidth, align: 'center' });

    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLORS.primary);
    doc.text(data.department, marginLeft, startY + 19, { width: usableWidth, align: 'center' });

    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(COLORS.primaryDark);
    const title = isContinuation ? `${data.heading} (Continued)` : data.heading;
    doc.text(`${data.subject.code} — ${data.subject.name} | ${title}`, marginLeft, startY + 33, {
      width: usableWidth,
      align: 'center'
    });

    const metaY = startY + 56;
    doc.rect(marginLeft, metaY, usableWidth, 18).fillAndStroke('#FAFCFB', COLORS.rowBorder);
    doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.textDark);
    doc.text(
      ` Academic Year: ${data.academic_year}   |   Semester: ${data.semester}   |   Section: ${data.section}   |   Faculty: ${data.subject.teacher_name || 'Department Faculty'}`,
      marginLeft + 6,
      metaY + 4
    );
    doc.text(`Generated: ${data.generated_at} `, marginLeft, metaY + 4, { width: usableWidth - 6, align: 'right' });

    const headerY = metaY + 22;
    const headerHeight = 22;

    doc.rect(marginLeft, headerY, usableWidth, headerHeight).fillAndStroke(COLORS.headerBg, COLORS.headerBorder);

    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.primaryDark);
    doc.text('Sl.', marginLeft, headerY + 6, { width: slNoWidth, align: 'center' });
    doc.text('USN', marginLeft + slNoWidth, headerY + 6, { width: usnWidth, align: 'center' });
    doc.text('Student Full Name', marginLeft + slNoWidth + usnWidth + 8, headerY + 6, { width: nameWidth - 16, align: 'left' });

    let curX = marginLeft + fixedWidth;
    for (const a of data.assessments) {
      doc.text(`${a.short_label} (Max: ${a.max_marks})`, curX, headerY + 6, { width: colWidth, align: 'center' });
      curX += colWidth;
    }
    if (hasAssessments) {
      doc.text('Total', curX, headerY + 6, { width: colWidth, align: 'center' });
      curX += colWidth;
    }

    doc.restore();
    return headerY + headerHeight;
  }

  let curY = drawSubjectHeader(false);
  const rowHeight = 19.5;
  const sigY = pageHeight - marginBottom - 45;
  const bottomThreshold = sigY - 15;

  for (let i = 0; i < data.students.length; i++) {
    const st = data.students[i];
    if (curY + rowHeight > bottomThreshold) {
      doc.addPage({ size: 'A4', layout: 'landscape', margins: { top: 28, bottom: 36, left: 36, right: 36 } });
      curY = drawSubjectHeader(true);
    }

    doc.save();
    const bg = i % 2 === 1 ? COLORS.zebraBg : COLORS.white;
    doc.rect(marginLeft, curY, usableWidth, rowHeight).fillAndStroke(bg, COLORS.rowBorder);

    doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.textDark);
    doc.text(String(st.sl_no), marginLeft, curY + 5, { width: slNoWidth, align: 'center' });

    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.primaryDark);
    doc.text(st.usn, marginLeft + slNoWidth, curY + 5, { width: usnWidth, align: 'center' });

    doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.textDark);
    doc.text(st.full_name, marginLeft + slNoWidth + usnWidth + 8, curY + 5, { width: nameWidth - 16, align: 'left', ellipsis: true });

    let cellX = marginLeft + fixedWidth;
    let studentPublishedTotal: number | null = null;

    for (const a of data.assessments) {
      const cell = st.marks[a.assessment_id];
      const val = cell ? cell.value : null;

      let displayText = '';
      let textColor = COLORS.textDark;
      let isBold = false;
      let fontSize = 8.5;

      if (val === null || val === undefined) {
        displayText = '';
      } else if (val === 'Not Submitted') {
        displayText = 'Not Submitted';
        textColor = COLORS.textMuted;
        fontSize = 7.5;
        isBold = false;
      } else if (typeof val === 'number') {
        displayText = String(val);
        isBold = true;
        textColor = COLORS.textDark;
        if (studentPublishedTotal === null) studentPublishedTotal = 0;
        studentPublishedTotal += val;
      } else if (val === '—') {
        displayText = '—';
        textColor = COLORS.textMuted;
      } else {
        displayText = String(val);
      }

      if (displayText) {
        doc.font(isBold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize).fillColor(textColor);
        doc.text(displayText, cellX, curY + 5, { width: colWidth, align: 'center' });
      }

      doc.strokeColor(COLORS.rowBorder);
      doc.moveTo(cellX + colWidth, curY).lineTo(cellX + colWidth, curY + rowHeight).stroke();
      cellX += colWidth;
    }

    if (hasAssessments) {
      if (studentPublishedTotal !== null) {
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.primaryDark);
        doc.text(String(studentPublishedTotal), cellX, curY + 5, { width: colWidth, align: 'center' });
      }
      doc.strokeColor(COLORS.rowBorder);
      doc.moveTo(cellX + colWidth, curY).lineTo(cellX + colWidth, curY + rowHeight).stroke();
      cellX += colWidth;
    }

    doc.restore();
    curY += rowHeight;
  }

  // Signatures Block
  doc.save();
  const sigColWidth = usableWidth / 3;
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.textDark);
  doc.text('__________________________________', marginLeft, sigY, { width: sigColWidth, align: 'center' });
  doc.text('Subject Teacher', marginLeft, sigY + 12, { width: sigColWidth, align: 'center' });

  doc.text('__________________________________', marginLeft + sigColWidth, sigY, { width: sigColWidth, align: 'center' });
  doc.text('Class Teacher', marginLeft + sigColWidth, sigY + 12, { width: sigColWidth, align: 'center' });

  doc.text('__________________________________', marginLeft + sigColWidth * 2, sigY, { width: sigColWidth, align: 'center' });
  doc.text('HOD / Authorized Signatory', marginLeft + sigColWidth * 2, sigY + 12, { width: sigColWidth, align: 'center' });
  doc.restore();

  // Footer Pass
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    doc.save();
    const footerY = pageHeight - 24;
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.textMuted);
    doc.text('Generated through AcadAssess (Formative Assessment & Evaluation System)', marginLeft, footerY, {
      lineBreak: false
    });
    doc.text(`Page ${i + 1} of ${range.count}`, marginLeft + usableWidth - 150, footerY, {
      width: 150,
      align: 'right',
      lineBreak: false
    });
    doc.restore();
  }

  doc.end();
  return bufferPromise;
}

/**
 * 3. INDIVIDUAL STUDENT ASSESSMENT REPORT (A4 PORTRAIT)
 */
async function generateStudentPdf(data: StudentIndividualReportData): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'portrait',
    margins: { top: 36, bottom: 20, left: 36, right: 36 },
    bufferPages: true,
    autoFirstPage: true
  });

  const bufferPromise = streamToBuffer(doc);
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const marginLeft = 36;
  const marginRight = 36;
  const marginTop = 36;
  const marginBottom = 40;
  const usableWidth = pageWidth - marginLeft - marginRight; // 523.28 pt

  doc.save();
  // Header
  doc.rect(marginLeft, marginTop, usableWidth, 64).fillAndStroke(COLORS.headerBg, COLORS.headerBorder);
  doc.font('Helvetica-Bold').fontSize(13).fillColor(COLORS.primaryDark);
  doc.text(data.institution, marginLeft, marginTop + 8, { width: usableWidth, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.primary);
  doc.text(data.department, marginLeft, marginTop + 24, { width: usableWidth, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.primaryDark);
  doc.text(`${data.stream} — ${data.heading}`, marginLeft, marginTop + 40, { width: usableWidth, align: 'center' });

  // Student Profile Card
  const profileY = marginTop + 72;
  doc.rect(marginLeft, profileY, usableWidth, 42).fillAndStroke('#FAFCFB', COLORS.rowBorder);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.primaryDark);
  doc.text(`Student USN: ${data.student.usn}`, marginLeft + 10, profileY + 8);
  doc.text(`Student Name: ${data.student.full_name}`, marginLeft + 10, profileY + 22);

  doc.font('Helvetica').fontSize(9).fillColor(COLORS.textDark);
  doc.text(`Semester: ${data.semester} | Section: ${data.section}`, marginLeft + 280, profileY + 8);
  doc.text(`Academic Year: ${data.academic_year}`, marginLeft + 280, profileY + 22);

  let curY = profileY + 52;

  // Subjects & Assessments Tables
  if (data.subjects.length === 0) {
    doc.rect(marginLeft, curY, usableWidth, 60).fillAndStroke(COLORS.white, COLORS.rowBorder);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.primaryDark);
    doc.text('No subjects assigned to this stream.', marginLeft, curY + 16, { width: usableWidth, align: 'center' });
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.textMuted);
    doc.text('No assessments available.', marginLeft, curY + 34, { width: usableWidth, align: 'center' });
    curY += 70;
  }

  for (const sub of data.subjects) {
    doc.rect(marginLeft, curY, usableWidth, 22).fillAndStroke(COLORS.headerBg, COLORS.headerBorder);
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLORS.primaryDark);
    doc.text(`${sub.subject_code} — ${sub.subject_name}`, marginLeft + 8, curY + 6);
    curY += 22;

    // Header for assessments table
    const tableH = 20;
    doc.rect(marginLeft, curY, usableWidth, tableH).fillAndStroke(COLORS.subHeaderBg, COLORS.rowBorder);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.primary);
    doc.text('Assessment Title', marginLeft + 8, curY + 5, { width: 280 });
    doc.text('Max Marks', marginLeft + 300, curY + 5, { width: 90, align: 'center' });
    doc.text('Marks Awarded', marginLeft + 400, curY + 5, { width: 110, align: 'center' });
    curY += tableH;

    if (sub.assessments.length === 0) {
      doc.rect(marginLeft, curY, usableWidth, 20).fillAndStroke(COLORS.white, COLORS.rowBorder);
      doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(COLORS.textMuted);
      doc.text('No assessments recorded for this subject.', marginLeft + 8, curY + 5);
      curY += 20;
    } else {
      let subjPubTotal: number | null = null;
      let totalMaxMarks = 0;

      for (let j = 0; j < sub.assessments.length; j++) {
        const a = sub.assessments[j];
        totalMaxMarks += Number(a.max_marks || 0);

        const bg = j % 2 === 1 ? COLORS.zebraBg : COLORS.white;
        doc.rect(marginLeft, curY, usableWidth, 20).fillAndStroke(bg, COLORS.rowBorder);

        doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.textDark);
        doc.text(a.title, marginLeft + 8, curY + 5, { width: 280, ellipsis: true });
        doc.text(String(a.max_marks), marginLeft + 300, curY + 5, { width: 90, align: 'center' });

        const val = a.awarded_marks;
        let displayText = '';
        let textColor = COLORS.textDark;
        let isBold = false;
        let fontSize = 8.5;

        if (val === null || val === undefined) {
          displayText = '';
        } else if (val === 'Not Submitted') {
          displayText = 'Not Submitted';
          textColor = COLORS.textMuted;
          fontSize = 8;
        } else if (typeof val === 'number') {
          displayText = String(val);
          isBold = true;
          textColor = COLORS.primaryDark;
          if (subjPubTotal === null) subjPubTotal = 0;
          subjPubTotal += val;
        } else if (val === '—') {
          displayText = '—';
          textColor = COLORS.textMuted;
        } else {
          displayText = String(val);
        }

        if (displayText) {
          doc.font(isBold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize).fillColor(textColor);
          doc.text(displayText, marginLeft + 400, curY + 5, { width: 110, align: 'center' });
        }
        curY += 20;
      }

      // Total row for this subject: Total (Published Marks)
      doc.rect(marginLeft, curY, usableWidth, 20).fillAndStroke(COLORS.subHeaderBg, COLORS.headerBorder);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.primaryDark);
      doc.text('Total (Published Marks)', marginLeft + 8, curY + 5, { width: 280 });
      doc.text(String(totalMaxMarks), marginLeft + 300, curY + 5, { width: 90, align: 'center' });
      const totalDisplay = subjPubTotal !== null ? String(subjPubTotal) : '';
      if (totalDisplay) {
        doc.text(totalDisplay, marginLeft + 400, curY + 5, { width: 110, align: 'center' });
      }
      curY += 20;
    }
    curY += 12; // Gap between subjects
  }

  // Signatures Block
  const sigY = pageHeight - marginBottom - 55;
  const sigColWidth = usableWidth / 2;
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.textDark);
  doc.text('__________________________________', marginLeft, sigY, { width: sigColWidth, align: 'center' });
  doc.text('Class Teacher / Proctor', marginLeft, sigY + 14, { width: sigColWidth, align: 'center' });

  doc.text('__________________________________', marginLeft + sigColWidth, sigY, { width: sigColWidth, align: 'center' });
  doc.text('HOD / Authorized Signatory', marginLeft + sigColWidth, sigY + 14, { width: sigColWidth, align: 'center' });

  doc.restore();

  // Footer Pass
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    doc.save();
    const footerY = pageHeight - 24;
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.textMuted);
    doc.text('Generated through AcadAssess (Formative Assessment & Evaluation System)', marginLeft, footerY, {
      lineBreak: false
    });
    doc.text(`Page ${i + 1} of ${range.count}`, marginLeft + usableWidth - 150, footerY, {
      width: 150,
      align: 'right',
      lineBreak: false
    });
    doc.restore();
  }

  doc.end();
  return bufferPromise;
}

/**
 * 4. DETAILED RUBRIC EVALUATION REPORT (A4 PORTRAIT)
 * Itemized breakdown of all rubric criteria, descriptions, awarded marks,
 * and evaluator remarks for a specific student evaluation.
 */
async function generateRubricPdf(data: DetailedRubricReportData): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'portrait',
    margins: { top: 36, bottom: 20, left: 36, right: 36 },
    bufferPages: true,
    autoFirstPage: true
  });

  const bufferPromise = streamToBuffer(doc);
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const marginLeft = 36;
  const marginRight = 36;
  const marginTop = 36;
  const marginBottom = 40;
  const usableWidth = pageWidth - marginLeft - marginRight; // 523.28 pt

  doc.save();

  // Header Banner
  doc.rect(marginLeft, marginTop, usableWidth, 64).fillAndStroke(COLORS.headerBg, COLORS.headerBorder);
  doc.font('Helvetica-Bold').fontSize(13).fillColor(COLORS.primaryDark);
  doc.text(data.institution, marginLeft, marginTop + 8, { width: usableWidth, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.primary);
  doc.text(data.department, marginLeft, marginTop + 24, { width: usableWidth, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.primaryDark);
  doc.text(`${data.stream} — ${data.heading}`, marginLeft, marginTop + 40, { width: usableWidth, align: 'center' });

  // Metadata Card
  const metaY = marginTop + 72;
  doc.rect(marginLeft, metaY, usableWidth, 68).fillAndStroke('#FAFCFB', COLORS.rowBorder);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.primaryDark);
  doc.text(`Student USN: ${data.student.usn}`, marginLeft + 10, metaY + 8);
  doc.text(`Student Name: ${data.student.full_name}`, marginLeft + 10, metaY + 22);
  doc.text(`Subject: ${data.subject.code} — ${data.subject.name}`, marginLeft + 10, metaY + 36);
  const assessmentLabel = data.assessment.short_label
    ? `${data.assessment.short_label} — ${data.assessment.title}`
    : data.assessment.title;
  doc.text(`Assessment: ${assessmentLabel}`, marginLeft + 10, metaY + 50);

  const isPub = Boolean(data.evaluation.is_published);

  doc.font('Helvetica').fontSize(9).fillColor(COLORS.textDark);
  doc.text(`Evaluator: ${data.evaluation.evaluator_name}`, marginLeft + 300, metaY + 8);
  doc.text(`Evaluation Date: ${isPub ? data.evaluation.evaluated_at : 'Pending Publication'}`, marginLeft + 300, metaY + 22);
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(isPub ? COLORS.primary : COLORS.textMuted);
  const scoreDisplay = isPub && typeof data.evaluation.total_score === 'number'
    ? `Score: ${data.evaluation.total_score} / ${data.assessment.max_marks} (${data.evaluation.percentage ?? 0}%)`
    : `Score: — / ${data.assessment.max_marks} (Pending Publication)`;
  doc.text(scoreDisplay, marginLeft + 300, metaY + 36);
  doc.font('Helvetica').fontSize(8.5).fillColor(isPub ? COLORS.primary : COLORS.tagPending);
  const pubLabel = isPub ? 'Published' : 'Unpublished (Results Pending)';
  doc.text(`Publication: ${pubLabel}`, marginLeft + 300, metaY + 50);

  // Rubric Breakdown Table
  let curY = metaY + 78;
  const tableH = 22;
  doc.rect(marginLeft, curY, usableWidth, tableH).fillAndStroke(COLORS.headerBg, COLORS.headerBorder);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.primaryDark);
  doc.text('Criterion', marginLeft + 8, curY + 6, { width: 330 });
  doc.text('Max', marginLeft + 350, curY + 6, { width: 60, align: 'center' });
  doc.text('Awarded', marginLeft + 420, curY + 6, { width: 90, align: 'center' });
  curY += tableH;

  for (let i = 0; i < data.criteria.length; i++) {
    const c = data.criteria[i];
    const rowH = 42;
    const bg = i % 2 === 1 ? COLORS.zebraBg : COLORS.white;

    doc.rect(marginLeft, curY, usableWidth, rowH).fillAndStroke(bg, COLORS.rowBorder);

    // Title and description
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.textDark);
    doc.text(`${c.display_order}. ${c.title}`, marginLeft + 8, curY + 6, { width: 330 });
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.textMuted);
    doc.text(c.description, marginLeft + 8, curY + 19, { width: 330, height: 20, ellipsis: true });

    // Max marks
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.textDark);
    doc.text(String(c.max_marks), marginLeft + 350, curY + 14, { width: 60, align: 'center' });

    // Awarded marks: blank if unpublished
    const awardedDisplay = isPub && c.awarded_marks !== null ? String(c.awarded_marks) : '';
    if (awardedDisplay) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.primary);
      doc.text(awardedDisplay, marginLeft + 420, curY + 14, { width: 90, align: 'center' });
    }

    curY += rowH;
  }

  // Total Summary Row
  doc.rect(marginLeft, curY, usableWidth, 24).fillAndStroke(COLORS.subHeaderBg, COLORS.headerBorder);
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLORS.primaryDark);
  doc.text('TOTAL ASSESSMENT MARKS', marginLeft + 8, curY + 7, { width: 330 });
  doc.text(String(data.assessment.max_marks), marginLeft + 350, curY + 7, { width: 60, align: 'center' });
  const totalSummary = isPub && typeof data.evaluation.total_score === 'number'
    ? `${data.evaluation.total_score} / ${data.assessment.max_marks}`
    : `— / ${data.assessment.max_marks}`;
  doc.text(totalSummary, marginLeft + 420, curY + 7, {
    width: 90,
    align: 'center'
  });
  curY += 28;

  // General Feedback if available AND published
  if (isPub && data.evaluation.general_feedback) {
    doc.rect(marginLeft, curY, usableWidth, 36).fillAndStroke('#FFFDF8', COLORS.rowBorder);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.primaryDark);
    doc.text('Evaluator Remarks / General Feedback:', marginLeft + 8, curY + 6);
    doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.textDark);
    doc.text(data.evaluation.general_feedback, marginLeft + 8, curY + 18, { width: usableWidth - 16 });
    curY += 42;
  }

  // Signatures
  const sigY = pageHeight - marginBottom - 55;
  const sigColWidth = usableWidth / 2;
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.textDark);
  doc.text('__________________________________', marginLeft, sigY, { width: sigColWidth, align: 'center' });
  doc.text('Subject Evaluator', marginLeft, sigY + 14, { width: sigColWidth, align: 'center' });

  doc.text('__________________________________', marginLeft + sigColWidth, sigY, { width: sigColWidth, align: 'center' });
  doc.text('HOD / Authorized Signatory', marginLeft + sigColWidth, sigY + 14, { width: sigColWidth, align: 'center' });

  doc.restore();

  // Footer Pass
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    doc.save();
    const footerY = pageHeight - 24;
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.textMuted);
    doc.text('Generated through AcadAssess (Formative Assessment & Evaluation System)', marginLeft, footerY, {
      lineBreak: false
    });
    doc.text(`Page ${i + 1} of ${range.count}`, marginLeft + usableWidth - 150, footerY, {
      width: 150,
      align: 'right',
      lineBreak: false
    });
    doc.restore();
  }

  doc.end();
  return bufferPromise;
}
