import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Download,
  Eye,
  AlertCircle,
  Loader2,
  X,
  CheckCircle2,
  Calendar,
  Layers,
  GraduationCap,
  BookOpen
} from 'lucide-react';
import {
  assessmentReportApi,
  AssessmentReportFilterOptionsDTO
} from '../../services/apiClient';
import { PdfViewer } from '../../components/PdfViewer';

interface AssessmentMarksReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeRole: string;
  defaultSubjectId?: string;
  defaultAssessmentId?: string;
  defaultStudentId?: string;
}

type ReportTypeOption = 'consolidated' | 'subject' | 'student' | 'rubric';

export const AssessmentMarksReportModal: React.FC<AssessmentMarksReportModalProps> = ({
  isOpen,
  onClose,
  activeRole,
  defaultSubjectId,
  defaultAssessmentId,
  defaultStudentId
}) => {
  const [loadingOptions, setLoadingOptions] = useState<boolean>(true);
  const [options, setOptions] = useState<AssessmentReportFilterOptionsDTO | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  // Filter states
  const [reportType, setReportType] = useState<ReportTypeOption>('consolidated');
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(defaultSubjectId || '');
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>(defaultAssessmentId || '');
  const [selectedStudentId, setSelectedStudentId] = useState<string>(defaultStudentId || '');

  // Generation & Preview states
  const [generating, setGenerating] = useState<boolean>(false);
  const [previewKey, setPreviewKey] = useState<number>(1);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);

  // Fetch Authoritative Filter Options on Mount / Open
  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    const fetchOptions = async () => {
      try {
        setLoadingOptions(true);
        setOptionsError(null);
        const data = await assessmentReportApi.getFilterOptions();
        if (mounted) {
          setOptions(data);
          if (data.classes.length > 0 && !selectedClassId) {
            setSelectedClassId(data.classes[0].id);
          }
          if (data.subjects.length > 0 && !selectedSubjectId) {
            setSelectedSubjectId(defaultSubjectId || data.subjects[0].id);
          }
          if (data.assessments.length > 0 && !selectedAssessmentId) {
            setSelectedAssessmentId(defaultAssessmentId || data.assessments[0].id);
          }
          if (data.students.length > 0 && !selectedStudentId) {
            setSelectedStudentId(defaultStudentId || data.students[0].id);
          }
        }
      } catch (err: any) {
        if (mounted) {
          setOptionsError(err.message || 'Failed to load report parameters.');
        }
      } finally {
        if (mounted) setLoadingOptions(false);
      }
    };

    fetchOptions();
    return () => {
      mounted = false;
    };
  }, [isOpen, defaultSubjectId, defaultAssessmentId, defaultStudentId]);

  // Handle PDF Blob Fetch for Viewer
  const fetchPdfBlob = useCallback(async (): Promise<Blob> => {
    setGenerating(true);
    setPdfError(null);
    try {
      const blob = await assessmentReportApi.fetchReportPdfBlob({
        report_type: reportType,
        class_id: selectedClassId || undefined,
        subject_id: reportType !== 'consolidated' ? selectedSubjectId || undefined : undefined,
        assessment_id: reportType === 'rubric' ? selectedAssessmentId || undefined : undefined,
        student_id: (reportType === 'student' || reportType === 'rubric') ? selectedStudentId || undefined : undefined
      });
      setPreviewBlob(blob);
      return blob;
    } catch (err: any) {
      const msg = err.message || 'Failed to generate PDF document.';
      setPdfError(msg);
      throw err;
    } finally {
      setGenerating(false);
    }
  }, [reportType, selectedClassId, selectedSubjectId, selectedAssessmentId, selectedStudentId]);

  // Trigger preview regeneration on parameter change
  const handleRegeneratePreview = () => {
    setPreviewKey(k => k + 1);
  };

  // Direct Download Trigger
  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      setPdfError(null);
      let blob = previewBlob;
      if (!blob) {
        blob = await assessmentReportApi.fetchReportPdfBlob({
          report_type: reportType,
          class_id: selectedClassId || undefined,
          subject_id: reportType !== 'consolidated' ? selectedSubjectId || undefined : undefined,
          assessment_id: reportType === 'rubric' ? selectedAssessmentId || undefined : undefined,
          student_id: (reportType === 'student' || reportType === 'rubric') ? selectedStudentId || undefined : undefined,
          download: true
        });
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const timestamp = new Date().toISOString().slice(0, 10);
      a.download = `SJBIT-MCA-Security-Assessment-Marks-Report-${reportType}-${timestamp}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setPdfError(err.message || 'Download failed.');
    } finally {
      setIsDownloading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="relative bg-academic-surface border border-academic-border rounded-xl shadow-2xl w-full max-w-7xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="px-6 py-4 bg-academic-paleGreen border-b border-academic-border flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-academic-primaryGreen/15 border border-academic-primaryGreen/30 flex items-center justify-center text-academic-primaryGreen">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-academic-deepGreen flex items-center space-x-2">
                <span>Assessment Marks Report (PDF Export)</span>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-academic-primaryGreen text-white">
                  Security Stream
                </span>
              </h2>
              <p className="text-xs text-academic-muted">
                SJB Institute of Technology • Department of MCA • {activeRole ? activeRole.replace('_', ' ').toUpperCase() : 'INSTITUTIONAL'} Scope
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-academic-muted hover:text-academic-deepGreen rounded-lg hover:bg-academic-surface transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row min-h-0">
          
          {/* Controls & Configuration Sidebar */}
          <div className="w-full md:w-80 lg:w-96 border-b md:border-b-0 md:border-r border-academic-border p-5 overflow-y-auto space-y-5 bg-[#FCFDFD] flex-shrink-0">
            
            {/* Stream Scope Notice */}
            <div className="p-3 bg-academic-paleGreen/60 border border-academic-border rounded-lg text-xs space-y-1">
              <div className="flex items-center space-x-1.5 font-bold text-academic-primaryGreen">
                <CheckCircle2 className="w-4 h-4" />
                <span>Scope: MCA Security Stream (CYBER)</span>
              </div>
              <p className="text-[11px] text-academic-muted leading-relaxed">
                Includes all 16 Security stream students, official course allocations, and dynamic formative assessment marks sorted naturally by ascending USN.
              </p>
            </div>

            {loadingOptions ? (
              <div className="py-8 flex flex-col items-center justify-center space-y-2 text-academic-muted">
                <Loader2 className="w-5 h-5 animate-spin text-academic-primaryGreen" />
                <span className="text-xs">Loading report configurations...</span>
              </div>
            ) : optionsError ? (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{optionsError}</span>
              </div>
            ) : (
              <>
                {/* 1. Report Type Selection */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-academic-deepGreen flex items-center space-x-1.5">
                    <Layers className="w-3.5 h-3.5 text-academic-primaryGreen" />
                    <span>Select Report Type</span>
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      type="button"
                      onClick={() => { setReportType('consolidated'); handleRegeneratePreview(); }}
                      className={`text-left p-2.5 rounded-lg border text-xs transition-all ${
                        reportType === 'consolidated'
                          ? 'border-academic-primaryGreen bg-academic-paleGreen text-academic-deepGreen font-semibold shadow-xs'
                          : 'border-academic-border bg-white text-academic-muted hover:border-academic-primaryGreen/50'
                      }`}
                    >
                      <div className="font-bold">1. Consolidated Marks Report</div>
                      <div className="text-[11px] opacity-80">All subjects & assessments in one table (A3 Landscape)</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setReportType('subject'); handleRegeneratePreview(); }}
                      className={`text-left p-2.5 rounded-lg border text-xs transition-all ${
                        reportType === 'subject'
                          ? 'border-academic-primaryGreen bg-academic-paleGreen text-academic-deepGreen font-semibold shadow-xs'
                          : 'border-academic-border bg-white text-academic-muted hover:border-academic-primaryGreen/50'
                      }`}
                    >
                      <div className="font-bold">2. Subject-Specific Marks Report</div>
                      <div className="text-[11px] opacity-80">Roster for a single Security stream course (A4 Landscape)</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setReportType('student'); handleRegeneratePreview(); }}
                      className={`text-left p-2.5 rounded-lg border text-xs transition-all ${
                        reportType === 'student'
                          ? 'border-academic-primaryGreen bg-academic-paleGreen text-academic-deepGreen font-semibold shadow-xs'
                          : 'border-academic-border bg-white text-academic-muted hover:border-academic-primaryGreen/50'
                      }`}
                    >
                      <div className="font-bold">3. Individual Student Report</div>
                      <div className="text-[11px] opacity-80">Complete student assessment scorecard (A4 Portrait)</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setReportType('rubric'); handleRegeneratePreview(); }}
                      className={`text-left p-2.5 rounded-lg border text-xs transition-all ${
                        reportType === 'rubric'
                          ? 'border-academic-primaryGreen bg-academic-paleGreen text-academic-deepGreen font-semibold shadow-xs'
                          : 'border-academic-border bg-white text-academic-muted hover:border-academic-primaryGreen/50'
                      }`}
                    >
                      <div className="font-bold">4. Detailed Rubric Evaluation</div>
                      <div className="text-[11px] opacity-80">Itemized rubric breakdown & feedback (A4 Portrait)</div>
                    </button>
                  </div>
                </div>

                {/* 2. Dynamic Filters */}
                <div className="space-y-3 pt-2 border-t border-academic-border">
                  
                  {/* Subject Filter (Visible for Subject, Rubric) */}
                  {reportType !== 'consolidated' && reportType !== 'student' && (
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-academic-deepGreen flex items-center space-x-1">
                        <BookOpen className="w-3.5 h-3.5 text-academic-muted" />
                        <span>Security Stream Subject</span>
                      </label>
                      <select
                        value={selectedSubjectId}
                        onChange={(e) => { setSelectedSubjectId(e.target.value); handleRegeneratePreview(); }}
                        className="w-full text-xs p-2 rounded-md border border-academic-border bg-white focus:outline-none focus:ring-1 focus:ring-academic-primaryGreen"
                      >
                        {options?.subjects.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.code} — {s.name} ({s.credits} Credits)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Assessment Filter (Visible for Rubric) */}
                  {reportType === 'rubric' && (
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-academic-deepGreen flex items-center space-x-1">
                        <Calendar className="w-3.5 h-3.5 text-academic-muted" />
                        <span>Assessment Task</span>
                      </label>
                      <select
                        value={selectedAssessmentId}
                        onChange={(e) => { setSelectedAssessmentId(e.target.value); handleRegeneratePreview(); }}
                        className="w-full text-xs p-2 rounded-md border border-academic-border bg-white focus:outline-none focus:ring-1 focus:ring-academic-primaryGreen"
                      >
                        {options?.assessments.map(a => (
                          <option key={a.id} value={a.id}>
                            {a.title} (Max: {a.max_marks})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Student Filter (Visible for Student, Rubric) */}
                  {(reportType === 'student' || reportType === 'rubric') && (
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-academic-deepGreen flex items-center space-x-1">
                        <GraduationCap className="w-3.5 h-3.5 text-academic-muted" />
                        <span>Select Student (Ascending USN)</span>
                      </label>
                      <select
                        value={selectedStudentId}
                        onChange={(e) => { setSelectedStudentId(e.target.value); handleRegeneratePreview(); }}
                        className="w-full text-xs p-2 rounded-md border border-academic-border bg-white focus:outline-none focus:ring-1 focus:ring-academic-primaryGreen"
                      >
                        {options?.students.map(st => (
                          <option key={st.id} value={st.id}>
                            {st.usn} — {st.full_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* 3. Action Buttons */}
                <div className="pt-3 space-y-2">
                  <button
                    type="button"
                    onClick={handleRegeneratePreview}
                    disabled={generating}
                    className="w-full py-2 px-3 rounded-md bg-white border border-academic-border hover:bg-academic-paleGreen text-academic-deepGreen font-semibold text-xs flex items-center justify-center space-x-1.5 transition-colors disabled:opacity-50"
                  >
                    {generating ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-academic-primaryGreen" />
                        <span>Rendering Preview...</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5 text-academic-primaryGreen" />
                        <span>Refresh Preview</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleDownload}
                    disabled={isDownloading || generating}
                    className="w-full py-2.5 px-3 rounded-md bg-academic-primaryGreen hover:bg-academic-deepGreen text-white font-bold text-xs flex items-center justify-center space-x-1.5 shadow-sm transition-colors disabled:opacity-50"
                  >
                    {isDownloading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span>Preparing PDF...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 text-white" />
                        <span>Download Official PDF</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            )}

            {pdfError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span className="leading-tight">{pdfError}</span>
              </div>
            )}
          </div>

          {/* Interactive Document Preview Pane */}
          <div className="flex-1 bg-academic-surface flex flex-col overflow-hidden min-h-[450px]">
            <div className="px-4 py-2 border-b border-academic-border bg-[#FBFDFB] flex items-center justify-between text-xs text-academic-muted">
              <span className="font-semibold text-academic-deepGreen flex items-center space-x-1.5">
                <Eye className="w-4 h-4 text-academic-primaryGreen" />
                <span>Institutional PDF Document Preview</span>
              </span>
              <span className="text-[11px]">
                Layout: {reportType === 'consolidated' ? 'A3 Landscape' : reportType === 'subject' ? 'A4 Landscape' : 'A4 Portrait'}
              </span>
            </div>

            <div className="flex-1 overflow-auto p-4 bg-academic-bg flex justify-center items-center">
              <PdfViewer
                key={previewKey}
                customFetchBlob={fetchPdfBlob}
                filename={`SJBIT-MCA-Security-Marks-Report-${reportType}.pdf`}
                className="w-full h-full max-h-[75vh]"
              />
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-[#FCFDFD] border-t border-academic-border flex items-center justify-between text-xs text-academic-muted flex-shrink-0">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Natural Alphanumeric Ascending USN Sorting Enforced</span>
          </div>
          <button
            onClick={onClose}
            className="py-1.5 px-4 rounded-md border border-academic-border hover:bg-academic-paleGreen text-academic-deepGreen font-semibold transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
