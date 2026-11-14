import express, { Request, Response } from 'express';
import { authenticateJWT } from '../auth/jwt.js';
import { loadUserContext, requireRoles } from '../authorization/rbac.js';
import { getAssessmentReportService } from './assessmentReportService.js';
import { generateAssessmentReportPdf } from './pdfGenerator.js';
import { ReportType } from './assessmentReportTypes.js';

const router = express.Router();

router.use(authenticateJWT);
router.use(loadUserContext);

/**
 * GET /api/v1/reports/assessment-marks/options
 * Returns authoritative Security stream subjects, classes, assessments, and students
 * filtered according to caller's role and assignments.
 */
router.get(
  '/options',
  requireRoles(['hod', 'class_teacher', 'proctor', 'subject_teacher']),
  async (req: Request, res: Response) => {
    try {
      const user = req.userContext!;
      const service = getAssessmentReportService();
      const options = await service.getReportFilterOptions(user);
      return res.status(200).json(options);
    } catch (err: any) {
      return res.status(500).json({
        error: {
          code: 'REPORT_OPTIONS_ERROR',
          message: err.message || 'Failed to retrieve report filter options'
        }
      });
    }
  }
);

/**
 * GET or POST /api/v1/reports/assessment-marks/data
 * Returns structured JSON report data for UI preview and data inspection.
 */
async function handleReportDataRequest(req: Request, res: Response) {
  try {
    const user = req.userContext!;
    const service = getAssessmentReportService();

    const report_type = (req.body?.report_type || req.query?.report_type || 'consolidated') as ReportType;
    const class_id = (req.body?.class_id || req.query?.class_id) as string | undefined;
    const subject_id = (req.body?.subject_id || req.query?.subject_id) as string | undefined;
    const assessment_id = (req.body?.assessment_id || req.query?.assessment_id) as string | undefined;
    const student_id = (req.body?.student_id || req.query?.student_id) as string | undefined;

    const reportData = await service.buildReportData(user, {
      report_type,
      class_id,
      subject_id,
      assessment_id,
      student_id
    });

    return res.status(200).json(reportData);
  } catch (err: any) {
    const status = err.message?.includes('Unauthorized') ? 403 : 500;
    return res.status(status).json({
      error: {
        code: 'REPORT_DATA_ERROR',
        message: err.message || 'Failed to build report data'
      }
    });
  }
}

router.get('/data', requireRoles(['hod', 'class_teacher', 'proctor', 'subject_teacher']), handleReportDataRequest);
router.post('/data', requireRoles(['hod', 'class_teacher', 'proctor', 'subject_teacher']), handleReportDataRequest);

/**
 * GET or POST /api/v1/reports/assessment-marks/pdf
 * Generates and streams official institutional PDF report matching SJBIT layout.
 */
async function handlePdfRequest(req: Request, res: Response) {
  try {
    const user = req.userContext!;
    const service = getAssessmentReportService();

    const report_type = (req.body?.report_type || req.query?.report_type || 'consolidated') as ReportType;
    const class_id = (req.body?.class_id || req.query?.class_id) as string | undefined;
    const subject_id = (req.body?.subject_id || req.query?.subject_id) as string | undefined;
    const assessment_id = (req.body?.assessment_id || req.query?.assessment_id) as string | undefined;
    const student_id = (req.body?.student_id || req.query?.student_id) as string | undefined;
    const download = (req.body?.download === true || req.query?.download === 'true');

    const reportData = await service.buildReportData(user, {
      report_type,
      class_id,
      subject_id,
      assessment_id,
      student_id
    });

    const pdfBuffer = await generateAssessmentReportPdf(reportData);

    const timestamp = new Date().toISOString().slice(0, 10);
    let filename = `assessment-marks-report-${report_type}-${timestamp}.pdf`;
    if (report_type === 'consolidated') {
      filename = `SJBIT-MCA-Security-Assessment-Marks-Report-${timestamp}.pdf`;
    } else if (report_type === 'subject') {
      const subCode = (reportData as any).subject?.code || 'Subject';
      filename = `SJBIT-MCA-Security-${subCode}-Marks-Report-${timestamp}.pdf`;
    } else if (report_type === 'student') {
      const usn = (reportData as any).student?.usn || 'Student';
      filename = `SJBIT-MCA-Security-${usn}-Academic-Report-${timestamp}.pdf`;
    } else if (report_type === 'rubric') {
      const usn = (reportData as any).student?.usn || 'Student';
      filename = `SJBIT-MCA-Security-${usn}-Rubric-Report-${timestamp}.pdf`;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${download ? 'attachment' : 'inline'}; filename="${filename}"`
    );
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    return res.end(pdfBuffer);
  } catch (err: any) {
    const status = err.message?.includes('Unauthorized') ? 403 : 500;
    return res.status(status).json({
      error: {
        code: 'PDF_GENERATION_ERROR',
        message: err.message || 'Failed to generate PDF report'
      }
    });
  }
}

router.get('/pdf', requireRoles(['hod', 'class_teacher', 'proctor', 'subject_teacher']), handlePdfRequest);
router.post('/pdf', requireRoles(['hod', 'class_teacher', 'proctor', 'subject_teacher']), handlePdfRequest);

export default router;
