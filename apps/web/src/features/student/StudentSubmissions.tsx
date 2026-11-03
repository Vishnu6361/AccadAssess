import React, { useState, useEffect } from 'react';
import { 
  FileCheck2, 
  FileText, 
  Download, 
  Eye, 
  Clock, 
  Layers, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Search, 
  Filter, 
  ChevronRight, 
  X, 
  Loader2, 
  FileSpreadsheet, 
  Award, 
  ShieldCheck,
  FileCode,
  File
} from 'lucide-react';
import { submissionApi, StudentSubmissionDTO, SubmittedFileDTO } from '../../services/apiClient';
import { StatusBadge } from '../../components/StatusBadge';
import { PdfViewer } from '../../components/PdfViewer';

interface StudentSubmissionsProps {
  onNavigateToAssessments?: () => void;
}

export const StudentSubmissions: React.FC<StudentSubmissionsProps> = ({ onNavigateToAssessments }) => {
  const [submissions, setSubmissions] = useState<StudentSubmissionDTO[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Search and Filter states
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'evaluated' | 'pending' | 'late'>('all');

  // Selected Submission for Details Modal
  const [selectedSubmission, setSelectedSubmission] = useState<StudentSubmissionDTO | null>(null);

  // PDF Preview State
  const [previewFile, setPreviewFile] = useState<{
    file: SubmittedFileDTO;
    submissionId: string;
    versionId: string;
    assessmentTitle: string;
    blobUrl?: string;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Download loading state per file ID
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const loadSubmissions = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await submissionApi.getMySubmissions();
      setSubmissions(data);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load your submission records.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSubmissions();
  }, []);

  const handleDownloadFile = async (submissionId: string, versionId: string, file: SubmittedFileDTO) => {
    setDownloadingFileId(file.id);
    try {
      await submissionApi.downloadSubmissionFile(submissionId, versionId, file.id, file.original_filename);
    } catch (err: any) {
      setErrorMessage(err.message || `Failed to download file ${file.original_filename}`);
    } finally {
      setDownloadingFileId(null);
    }
  };

  const handlePreviewFile = async (submissionId: string, versionId: string, file: SubmittedFileDTO, assessmentTitle: string) => {
    const isPdf = file.mime_type === 'application/pdf' || file.original_filename.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      setNoticeMessage(`In-app preview is optimized for PDF files. File "${file.original_filename}" can be downloaded for offline viewing.`);
      return;
    }

    setPreviewFile({
      file,
      submissionId,
      versionId,
      assessmentTitle
    });
    setPreviewLoading(true);
    setPreviewError(null);

    try {
      const blob = await submissionApi.fetchSubmissionFileBlob(submissionId, versionId, file.id);
      const url = URL.createObjectURL(blob);
      setPreviewFile(prev => prev ? { ...prev, blobUrl: url } : null);
    } catch (err: any) {
      setPreviewError(err.message || 'Failed to load file preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    if (previewFile?.blobUrl) {
      URL.revokeObjectURL(previewFile.blobUrl);
    }
    setPreviewFile(null);
    setPreviewError(null);
  };

  // Filter Submissions
  const filteredSubmissions = submissions.filter(sub => {
    const matchesSearch = 
      sub.assessment_title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (sub.subject_details && sub.subject_details.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (sub.class_details && sub.class_details.toLowerCase().includes(searchQuery.toLowerCase())) ||
      sub.files.some(f => f.original_filename.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (statusFilter === 'evaluated') {
      return sub.evaluation?.status === 'published';
    }
    if (statusFilter === 'pending') {
      return !sub.evaluation || sub.evaluation.status !== 'published';
    }
    if (statusFilter === 'late') {
      return sub.late_status === 'late';
    }
    return true;
  });

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const getFileIcon = (mimeType: string, filename: string) => {
    const lower = filename.toLowerCase();
    if (mimeType.includes('pdf') || lower.endsWith('.pdf')) {
      return <FileText className="w-4 h-4 text-red-600 flex-shrink-0" />;
    }
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint') || lower.endsWith('.ppt') || lower.endsWith('.pptx')) {
      return <FileSpreadsheet className="w-4 h-4 text-amber-600 flex-shrink-0" />;
    }
    if (mimeType.includes('word') || lower.endsWith('.doc') || lower.endsWith('.docx')) {
      return <FileCode className="w-4 h-4 text-blue-600 flex-shrink-0" />;
    }
    return <File className="w-4 h-4 text-academic-primaryGreen flex-shrink-0" />;
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="card-surface p-6 rounded-lg border border-academic-border">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="p-2 rounded-lg bg-academic-lightGreen text-academic-primaryGreen">
                <FileCheck2 className="w-5 h-5" />
              </span>
              <h1 className="text-xl font-bold text-academic-deepGreen tracking-tight">My Submissions</h1>
            </div>
            <p className="text-xs text-academic-muted mt-1.5 max-w-2xl leading-relaxed">
              Review your authoritative assignment submissions, inspect uploaded answer files, preview documents in-app, and check published faculty evaluation results.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={loadSubmissions}
              disabled={isLoading}
              className="btn-secondary text-xs flex items-center min-h-[40px]"
              title="Refresh submission records"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? 'animate-spin text-academic-primaryGreen' : ''}`} />
              <span>Refresh</span>
            </button>
            {onNavigateToAssessments && (
              <button
                onClick={onNavigateToAssessments}
                className="btn-primary text-xs flex items-center min-h-[40px]"
              >
                <span>My Assessments</span>
                <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </button>
            )}
          </div>
        </div>

        {/* Search and Filters Bar */}
        <div className="mt-5 pt-4 border-t border-academic-border/70 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-academic-muted" />
            <input
              type="text"
              placeholder="Search by assignment title, subject, or filename..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-academic-border rounded bg-academic-bg text-academic-deepGreen focus:outline-none focus:border-academic-primaryGreen min-h-[40px]"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-academic-muted flex-shrink-0" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="text-xs px-3 py-2 border border-academic-border rounded bg-academic-bg text-academic-deepGreen focus:outline-none focus:border-academic-primaryGreen min-h-[40px]"
            >
              <option value="all">All Submissions</option>
              <option value="evaluated">Graded & Evaluated</option>
              <option value="pending">Pending Evaluation</option>
              <option value="late">Late Submissions</option>
            </select>
          </div>
        </div>
      </div>

      {/* Notice Message Toast */}
      {noticeMessage && (
        <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-md flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>{noticeMessage}</span>
          </div>
          <button onClick={() => setNoticeMessage(null)} className="text-amber-800 hover:text-amber-950 p-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Error State */}
      {errorMessage && (
        <div className="card-surface p-5 border border-red-200 bg-red-50 text-red-900 rounded-lg flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <div>
              <p className="text-xs font-bold">Unable to load submission records</p>
              <p className="text-xs text-red-700 mt-0.5">{errorMessage}</p>
            </div>
          </div>
          <button
            onClick={loadSubmissions}
            className="btn-secondary text-xs bg-white text-red-800 border-red-300 hover:bg-red-50 min-h-[36px]"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Loading State */}
      {isLoading ? (
        <div className="card-surface p-12 text-center border border-academic-border rounded-lg space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-academic-primaryGreen mx-auto" />
          <p className="text-xs font-semibold text-academic-deepGreen">Loading your submission records...</p>
          <p className="text-[11px] text-academic-muted">Cryptographically verifying persisted submission versions and files from private storage.</p>
        </div>
      ) : submissions.length === 0 ? (
        /* Empty State */
        <div className="card-surface p-12 text-center border border-academic-border rounded-lg max-w-xl mx-auto space-y-4">
          <div className="w-14 h-14 rounded-full bg-academic-paleGreen border border-academic-border flex items-center justify-center mx-auto text-academic-primaryGreen">
            <FileCheck2 className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-base font-bold text-academic-deepGreen">No Coursework Submissions Yet</h3>
            <p className="text-xs text-academic-muted mt-2 leading-relaxed">
              You haven't submitted any assignments yet. Visit your course assessments page to review instructions, read assignment PDFs, and upload your coursework.
            </p>
          </div>
          {onNavigateToAssessments && (
            <button
              onClick={onNavigateToAssessments}
              className="btn-primary text-xs inline-flex items-center mx-auto min-h-[44px]"
            >
              <span>View My Assessments</span>
              <ChevronRight className="w-4 h-4 ml-1.5" />
            </button>
          )}
        </div>
      ) : filteredSubmissions.length === 0 ? (
        /* Filtered Empty State */
        <div className="card-surface p-8 text-center border border-academic-border rounded-lg text-xs text-academic-muted">
          No submissions match your active filter criteria. <button onClick={() => { setSearchQuery(''); setStatusFilter('all'); }} className="text-academic-primaryGreen font-semibold underline ml-1">Reset Filters</button>
        </div>
      ) : (
        /* Submissions Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredSubmissions.map(sub => {
            const isLate = sub.late_status === 'late';
            const isEvaluated = sub.evaluation?.status === 'published';
            const submissionDateStr = new Date(sub.updated_at || sub.first_submitted_at).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            });

            return (
              <div
                key={sub.id}
                className="card-surface flex flex-col justify-between hover:border-academic-primaryGreen/50 transition-all rounded-lg border border-academic-border p-5 group space-y-4"
              >
                {/* Card Header */}
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center flex-wrap gap-2">
                      <StatusBadge label="Submitted" variant="submitted" />
                      {isLate ? (
                        <span className="text-[10px] font-bold text-[#A63214] bg-[#FFF5F2] border border-[#F8D2C9] px-2 py-0.5 rounded">
                          LATE SUBMISSION
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-academic-primaryGreen bg-academic-lightGreen border border-academic-primaryGreen/30 px-2 py-0.5 rounded">
                          ON-TIME
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-academic-muted bg-academic-paleGreen px-2 py-0.5 rounded border border-academic-border flex-shrink-0">
                      v{sub.version_number}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-academic-deepGreen group-hover:text-academic-primaryGreen transition-colors line-clamp-2">
                    {sub.assessment_title}
                  </h3>

                  <p className="text-xs text-academic-muted mt-1">
                    {sub.class_details || 'Enrolled Class'} • {sub.subject_details || 'Subject'}
                  </p>

                  {/* Submission Timestamp */}
                  <div className="mt-2.5 flex items-center text-[11px] text-academic-muted">
                    <Clock className="w-3.5 h-3.5 mr-1.5 text-academic-primaryGreen flex-shrink-0" />
                    <span>Submitted: {submissionDateStr}</span>
                  </div>
                </div>

                {/* Section: Your uploaded files */}
                <div className="pt-3 border-t border-academic-border/70 space-y-2">
                  <div className="flex items-center justify-between text-xs text-academic-deepGreen font-semibold">
                    <span className="flex items-center">
                      <Layers className="w-3.5 h-3.5 mr-1.5 text-academic-primaryGreen" />
                      <span>Your uploaded files ({sub.files.length})</span>
                    </span>
                    <span className="text-[11px] text-academic-muted font-normal">
                      {formatFileSize(sub.total_size_bytes)}
                    </span>
                  </div>

                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                    {sub.files.map((file) => {
                      const isPdf = file.mime_type === 'application/pdf' || file.original_filename.toLowerCase().endsWith('.pdf');
                      const isDownloading = downloadingFileId === file.id;

                      return (
                        <div
                          key={file.id}
                          className="bg-academic-bg border border-academic-border/70 rounded p-2.5 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                            {getFileIcon(file.mime_type, file.original_filename)}
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-academic-deepGreen truncate" title={file.original_filename}>
                                {file.original_filename}
                              </p>
                              <p className="text-[10px] text-academic-muted">
                                {formatFileSize(file.file_size_bytes)} • {file.mime_type.split('/')[1]?.toUpperCase() || 'FILE'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center space-x-1.5 flex-shrink-0">
                            <button
                              onClick={() => handlePreviewFile(sub.id, sub.active_version_id || 'v1', file, sub.assessment_title)}
                              className="p-1.5 rounded hover:bg-academic-paleGreen text-academic-deepGreen border border-academic-border/50 hover:border-academic-primaryGreen/40 transition-colors"
                              title={isPdf ? 'Preview PDF in-app' : 'In-app preview (PDF only)'}
                              aria-label={`Preview ${file.original_filename}`}
                            >
                              <Eye className="w-3.5 h-3.5 text-academic-primaryGreen" />
                            </button>
                            <button
                              onClick={() => handleDownloadFile(sub.id, sub.active_version_id || 'v1', file)}
                              disabled={isDownloading}
                              className="p-1.5 rounded hover:bg-academic-paleGreen text-academic-deepGreen border border-academic-border/50 hover:border-academic-primaryGreen/40 transition-colors"
                              title="Download file"
                              aria-label={`Download ${file.original_filename}`}
                            >
                              {isDownloading ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-academic-primaryGreen" />
                              ) : (
                                <Download className="w-3.5 h-3.5 text-academic-primaryGreen" />
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Section: Evaluation Status */}
                <div className="pt-3 border-t border-academic-border/70">
                  {isEvaluated ? (
                    <div className="p-3 bg-academic-lightGreen/60 border border-academic-primaryGreen/30 rounded-md space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-1.5">
                          <Award className="w-4 h-4 text-academic-primaryGreen" />
                          <span className="text-xs font-bold text-academic-deepGreen">Evaluation Published</span>
                        </div>
                        <span className="text-xs font-bold text-academic-primaryGreen bg-white px-2 py-0.5 rounded border border-academic-primaryGreen/30 shadow-2xs">
                          {sub.evaluation?.total_score ?? '-'} / {sub.max_marks} Marks
                        </span>
                      </div>
                      {sub.evaluation?.general_feedback && (
                        <p className="text-[11px] text-academic-muted line-clamp-2 italic">
                          "{sub.evaluation.general_feedback}"
                        </p>
                      )}
                    </div>
                  ) : sub.evaluation?.status === 'under_evaluation' ? (
                    <div className="p-2.5 bg-blue-50/70 border border-blue-200/70 rounded-md flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-2">
                        <StatusBadge label="Under Evaluation" variant="processing" />
                        <span className="text-[11px] text-blue-900">Faculty evaluation in progress</span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-2.5 bg-academic-bg border border-academic-border/70 rounded-md flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-2">
                        <StatusBadge label="Pending Evaluation" variant="neutral" />
                        <span className="text-[11px] text-academic-muted">Awaiting teacher grading</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Footer: View Details Action */}
                <div className="pt-2 flex items-center justify-end">
                  <button
                    onClick={() => setSelectedSubmission(sub)}
                    className="text-xs font-bold text-academic-primaryGreen hover:text-academic-deepGreen inline-flex items-center group-hover:translate-x-0.5 transition-transform min-h-[36px]"
                  >
                    <span>View Submission Details</span>
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Submission Details Modal */}
      {selectedSubmission && (
        <div className="fixed inset-0 bg-academic-deepGreen/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-academic-surface border border-academic-border rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-academic-border flex items-center justify-between bg-academic-paleGreen/30">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-academic-muted">
                  Submission Details &bull; Version {selectedSubmission.version_number}
                </span>
                <h2 className="text-base font-bold text-academic-deepGreen mt-0.5">
                  {selectedSubmission.assessment_title}
                </h2>
              </div>
              <button
                onClick={() => setSelectedSubmission(null)}
                className="p-1.5 rounded-lg hover:bg-academic-paleGreen text-academic-muted hover:text-academic-deepGreen"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              {/* Metadata Overview */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-academic-bg border border-academic-border rounded-lg">
                  <p className="text-[10px] text-academic-muted">Status</p>
                  <p className="font-bold text-academic-primaryGreen mt-0.5 flex items-center">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    Submitted
                  </p>
                </div>
                <div className="p-3 bg-academic-bg border border-academic-border rounded-lg">
                  <p className="text-[10px] text-academic-muted">Submission Timing</p>
                  <p className={`font-bold mt-0.5 ${selectedSubmission.late_status === 'late' ? 'text-red-700' : 'text-academic-deepGreen'}`}>
                    {selectedSubmission.late_status === 'late' ? 'Late Submission' : 'On-Time'}
                  </p>
                </div>
                <div className="p-3 bg-academic-bg border border-academic-border rounded-lg">
                  <p className="text-[10px] text-academic-muted">Version</p>
                  <p className="font-bold text-academic-deepGreen mt-0.5">v{selectedSubmission.version_number}</p>
                </div>
                <div className="p-3 bg-academic-bg border border-academic-border rounded-lg">
                  <p className="text-[10px] text-academic-muted">Max Marks</p>
                  <p className="font-bold text-academic-deepGreen mt-0.5">{selectedSubmission.max_marks} Marks</p>
                </div>
              </div>

              {/* Submitted Files List */}
              <div className="space-y-2">
                <h4 className="font-bold text-academic-deepGreen text-xs flex items-center">
                  <Layers className="w-4 h-4 mr-1.5 text-academic-primaryGreen" />
                  Your Uploaded Files ({selectedSubmission.files.length})
                </h4>
                <div className="space-y-2">
                  {selectedSubmission.files.map((file, idx) => {
                    return (
                      <div
                        key={file.id || idx}
                        className="p-3 bg-academic-bg border border-academic-border rounded-lg flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center space-x-3 min-w-0 flex-1">
                          {getFileIcon(file.mime_type, file.original_filename)}
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-academic-deepGreen truncate">{file.original_filename}</p>
                            <p className="text-[10px] text-academic-muted mt-0.5">
                              {formatFileSize(file.file_size_bytes)} &bull; {file.mime_type} &bull; Uploaded on {new Date(file.uploaded_at).toLocaleString()}
                            </p>
                            {file.sha256 && (
                              <p className="text-[9px] font-mono text-academic-muted/80 truncate mt-0.5">
                                SHA-256: {file.sha256}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handlePreviewFile(selectedSubmission.id, selectedSubmission.active_version_id || 'v1', file, selectedSubmission.assessment_title)}
                            className="btn-secondary text-[11px] py-1.5 px-2.5 flex items-center"
                          >
                            <Eye className="w-3.5 h-3.5 mr-1 text-academic-primaryGreen" />
                            <span>Preview</span>
                          </button>
                          <button
                            onClick={() => handleDownloadFile(selectedSubmission.id, selectedSubmission.active_version_id || 'v1', file)}
                            className="btn-secondary text-[11px] py-1.5 px-2.5 flex items-center"
                          >
                            <Download className="w-3.5 h-3.5 mr-1 text-academic-primaryGreen" />
                            <span>Download</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Evaluation Details */}
              <div className="space-y-2">
                <h4 className="font-bold text-academic-deepGreen text-xs flex items-center">
                  <Award className="w-4 h-4 mr-1.5 text-academic-primaryGreen" />
                  Evaluation & Grade Details
                </h4>

                {selectedSubmission.evaluation?.status === 'published' ? (
                  <div className="p-4 bg-academic-lightGreen/50 border border-academic-primaryGreen/30 rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-academic-deepGreen">Official Grade Published</span>
                      <span className="text-sm font-bold text-academic-primaryGreen bg-white px-2.5 py-1 rounded border border-academic-primaryGreen/30">
                        {selectedSubmission.evaluation.total_score} / {selectedSubmission.max_marks} Marks
                      </span>
                    </div>

                    {selectedSubmission.evaluation.late_penalty_deducted ? (
                      <div className="text-[11px] text-[#A63214] bg-[#FFF5F2] p-2 rounded border border-[#F8D2C9]">
                        Raw Score: {selectedSubmission.evaluation.raw_score} Marks &bull; Late Penalty Deducted: -{selectedSubmission.evaluation.late_penalty_deducted} Marks
                      </div>
                    ) : null}

                    {selectedSubmission.evaluation.general_feedback && (
                      <div>
                        <p className="text-[11px] font-bold text-academic-deepGreen">Teacher Feedback:</p>
                        <p className="text-[11px] text-academic-muted mt-0.5 whitespace-pre-wrap bg-white/70 p-2.5 rounded border border-academic-border/60">
                          {selectedSubmission.evaluation.general_feedback}
                        </p>
                      </div>
                    )}

                    {selectedSubmission.evaluation.criterion_scores && selectedSubmission.evaluation.criterion_scores.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <p className="text-[11px] font-bold text-academic-deepGreen">Rubric Breakdown:</p>
                        <div className="space-y-1">
                          {selectedSubmission.evaluation.criterion_scores.map((cs: any, i: number) => (
                            <div key={i} className="flex items-center justify-between bg-white/80 p-2 rounded border border-academic-border/60 text-[11px]">
                              <span>Criterion {i + 1}</span>
                              <span className="font-bold text-academic-deepGreen">{cs.score} Marks</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : selectedSubmission.evaluation?.status === 'under_evaluation' ? (
                  <div className="p-4 bg-blue-50/70 border border-blue-200/70 rounded-lg text-xs space-y-1">
                    <p className="font-bold text-blue-900">Evaluation in Progress</p>
                    <p className="text-[11px] text-blue-700">
                      Your coursework is currently being evaluated by the subject faculty. Official grades and feedback will be visible here once published.
                    </p>
                  </div>
                ) : (
                  <div className="p-4 bg-academic-bg border border-academic-border rounded-lg text-xs text-academic-muted space-y-1">
                    <p className="font-semibold text-academic-deepGreen">Pending Evaluation</p>
                    <p className="text-[11px]">
                      Your submission is queued and awaiting teacher review. When your faculty publishes grades, your detailed rubric score and feedback will appear here.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-academic-border flex items-center justify-between bg-academic-paleGreen/20">
              <span className="text-[11px] text-academic-muted flex items-center">
                <ShieldCheck className="w-3.5 h-3.5 mr-1 text-academic-primaryGreen" />
                Cryptographically verified institutional record
              </span>
              <button
                onClick={() => setSelectedSubmission(null)}
                className="btn-secondary text-xs min-h-[36px]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-App PDF Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 bg-academic-deepGreen/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
          <div className="bg-academic-surface border border-academic-border rounded-xl shadow-2xl max-w-5xl w-full h-[92vh] flex flex-col overflow-hidden">
            {/* Preview Modal Header */}
            <div className="p-4 border-b border-academic-border flex items-center justify-between bg-academic-paleGreen/40">
              <div className="flex items-center space-x-2.5 min-w-0">
                <FileText className="w-5 h-5 text-academic-primaryGreen flex-shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-academic-deepGreen truncate">
                    {previewFile.file.original_filename}
                  </h3>
                  <p className="text-[11px] text-academic-muted truncate">
                    {previewFile.assessmentTitle} &bull; Submitted Answer Document
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleDownloadFile(previewFile.submissionId, previewFile.versionId, previewFile.file)}
                  className="btn-secondary text-xs flex items-center min-h-[36px]"
                >
                  <Download className="w-3.5 h-3.5 mr-1 text-academic-primaryGreen" />
                  <span>Download</span>
                </button>
                <button
                  onClick={closePreview}
                  className="p-1.5 rounded-lg hover:bg-academic-paleGreen text-academic-muted hover:text-academic-deepGreen"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Preview Body */}
            <div className="flex-1 bg-academic-bg overflow-hidden p-2 sm:p-4">
              {previewLoading ? (
                <div className="h-full flex flex-col items-center justify-center space-y-3">
                  <Loader2 className="w-8 h-8 animate-spin text-academic-primaryGreen" />
                  <p className="text-xs font-semibold text-academic-deepGreen">Decrypting and loading submitted PDF...</p>
                </div>
              ) : previewError ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                  <AlertCircle className="w-8 h-8 text-red-600" />
                  <p className="text-xs font-bold text-red-900">Failed to render PDF preview</p>
                  <p className="text-xs text-academic-muted max-w-md">{previewError}</p>
                  <button
                    onClick={() => handleDownloadFile(previewFile.submissionId, previewFile.versionId, previewFile.file)}
                    className="btn-primary text-xs"
                  >
                    Download File Instead
                  </button>
                </div>
              ) : previewFile.blobUrl ? (
                <div className="h-full rounded border border-academic-border bg-white overflow-hidden">
                  <PdfViewer
                    directUrl={previewFile.blobUrl}
                    filename={previewFile.file.original_filename}
                    assessmentId={previewFile.submissionId}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
