import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Minimize2, 
  Download, 
  RotateCw, 
  FileText, 
  AlertCircle, 
  Loader2
} from 'lucide-react';
import { assessmentApi } from '../services/apiClient';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '3.11.174'}/pdf.worker.min.js`;
}

interface PdfViewerProps {
  assessmentId?: string;
  directUrl?: string;
  customFetchBlob?: () => Promise<Blob>;
  filename?: string | null;
  className?: string;
  onDownloadError?: (err: Error) => void;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  assessmentId,
  directUrl,
  customFetchBlob,
  filename = 'Document.pdf',
  className = ''
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [rendering, setRendering] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.1);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [pageInputValue, setPageInputValue] = useState<string>('1');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renderTaskRef = useRef<any>(null);

  // Load PDF Document via authenticated blob fetch
  const loadDocument = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setCurrentPage(1);
      setPageInputValue('1');

      let arrayBuffer: ArrayBuffer;
      if (directUrl) {
        const res = await fetch(directUrl);
        arrayBuffer = await res.arrayBuffer();
      } else if (customFetchBlob) {
        const blob = await customFetchBlob();
        arrayBuffer = await blob.arrayBuffer();
      } else if (assessmentId) {
        const blob = await assessmentApi.fetchDocumentBlob(assessmentId);
        arrayBuffer = await blob.arrayBuffer();
      } else {
        throw new Error('No PDF source provided');
      }

      const loadingTask = pdfjsLib.getDocument({
        data: arrayBuffer,
        cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
        cMapPacked: true,
      });

      const doc = await loadingTask.promise;
      setPdfDoc(doc);
      setNumPages(doc.numPages);
      setLoading(false);
    } catch (err: any) {
      console.error('Failed to load PDF document:', err);
      const msg = err?.message || 'Failed to load assignment PDF. Please ensure you are authorized.';
      setError(msg);
      setLoading(false);
    }
  }, [assessmentId, directUrl, customFetchBlob]);

  useEffect(() => {
    loadDocument();
    return () => {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [loadDocument]);

  // Render current page onto Canvas
  const renderPage = useCallback(async (pageNum: number, currentScale: number) => {
    if (!pdfDoc || !canvasRef.current) return;

    try {
      setRendering(true);

      // Cancel previous in-flight render
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore cancel error
        }
      }

      const page = await pdfDoc.getPage(pageNum);
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) return;

      const viewport = page.getViewport({ scale: currentScale });
      const pixelRatio = window.devicePixelRatio || 1;

      // Set actual canvas size (scaled for retina/high-DPI)
      canvas.width = Math.floor(viewport.width * pixelRatio);
      canvas.height = Math.floor(viewport.height * pixelRatio);

      // Set CSS display size
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      context.save();
      context.scale(pixelRatio, pixelRatio);

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      const renderTask = page.render(renderContext);
      renderTaskRef.current = renderTask;

      await renderTask.promise;
      context.restore();
      setRendering(false);
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.error('PDF Page render error:', err);
      }
      setRendering(false);
    }
  }, [pdfDoc]);

  // Re-render when page, scale, or doc changes
  useEffect(() => {
    if (pdfDoc && currentPage >= 1 && currentPage <= numPages) {
      renderPage(currentPage, scale);
    }
  }, [pdfDoc, currentPage, scale, renderPage]);

  // Navigation handlers
  const handlePrevPage = () => {
    if (currentPage > 1) {
      const prev = currentPage - 1;
      setCurrentPage(prev);
      setPageInputValue(String(prev));
    }
  };

  const handleNextPage = () => {
    if (currentPage < numPages) {
      const next = currentPage + 1;
      setCurrentPage(next);
      setPageInputValue(String(next));
    }
  };

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(pageInputValue, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= numPages) {
      setCurrentPage(parsed);
    } else {
      setPageInputValue(String(currentPage));
    }
  };

  // Zoom handlers
  const handleZoomIn = () => {
    setScale(prev => Math.min(prev + 0.2, 2.8));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev - 0.2, 0.6));
  };

  const handleResetZoom = () => {
    setScale(1.1);
  };

  const handleFitWidth = () => {
    if (!containerRef.current || !pdfDoc) return;
    pdfDoc.getPage(currentPage).then(page => {
      const unscaledViewport = page.getViewport({ scale: 1 });
      const containerWidth = containerRef.current?.clientWidth || 800;
      const availableWidth = Math.max(containerWidth - 48, 320);
      const fitScale = Math.min(Math.max(availableWidth / unscaledViewport.width, 0.6), 2.5);
      setScale(Number(fitScale.toFixed(2)));
    });
  };

  // Authenticated Download handler
  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      if (directUrl) {
        const res = await fetch(directUrl);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename || 'document.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else if (assessmentId) {
        await assessmentApi.downloadDocument(assessmentId, filename || 'Assignment-Document.pdf');
      }
    } catch (err: any) {
      console.error('Download failed:', err);
      alert(err?.message || 'Failed to download assignment PDF. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`card-surface border border-academic-border rounded-lg overflow-hidden flex flex-col transition-all duration-200 ${
        isFullscreen ? 'fixed inset-4 z-50 shadow-2xl bg-academic-surface flex flex-col' : 'w-full shadow-sm'
      } ${className}`}
    >
      {/* Viewer Header / Toolbar */}
      <div className="bg-academic-paleGreen/80 border-b border-academic-border px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 select-none">
        {/* Left: Document info badge */}
        <div className="flex items-center space-x-2 min-w-0">
          <FileText className="w-4 h-4 text-academic-primaryGreen flex-shrink-0" />
          <span className="text-xs font-bold text-academic-deepGreen truncate max-w-[180px] sm:max-w-xs" title={filename || 'Assignment PDF'}>
            {filename || 'Assignment Document.pdf'}
          </span>
          <span className="hidden sm:inline-block text-[10px] bg-academic-surface px-2 py-0.5 rounded border border-academic-border text-academic-muted font-mono font-semibold">
            PDF Preview
          </span>
        </div>

        {/* Center: Page Controls */}
        <div className="flex items-center space-x-1.5 bg-academic-surface px-2 py-1 rounded border border-academic-border shadow-2xs">
          <button
            type="button"
            onClick={handlePrevPage}
            disabled={currentPage <= 1 || loading}
            aria-label="Previous Page"
            className="p-1 rounded text-academic-deepGreen hover:bg-academic-paleGreen disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <form onSubmit={handlePageInputSubmit} className="flex items-center text-xs text-academic-deepGreen font-mono">
            <input
              type="text"
              value={pageInputValue}
              onChange={e => setPageInputValue(e.target.value)}
              onBlur={() => setPageInputValue(String(currentPage))}
              disabled={loading || numPages === 0}
              aria-label="Current Page Number"
              className="w-8 text-center text-xs py-0.5 px-1 font-bold border border-academic-border rounded bg-white focus:outline-none focus:ring-1 focus:ring-academic-primaryGreen"
            />
            <span className="mx-1 text-academic-muted font-semibold">/</span>
            <span className="font-bold text-academic-deepGreen">{numPages || '—'}</span>
          </form>

          <button
            type="button"
            onClick={handleNextPage}
            disabled={currentPage >= numPages || loading}
            aria-label="Next Page"
            className="p-1 rounded text-academic-deepGreen hover:bg-academic-paleGreen disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Right: Zoom & Actions */}
        <div className="flex items-center space-x-1 sm:space-x-1.5">
          <div className="flex items-center space-x-1 bg-academic-surface px-1.5 py-1 rounded border border-academic-border shadow-2xs">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={scale <= 0.6 || loading}
              aria-label="Zoom Out"
              title="Zoom Out"
              className="p-1 rounded text-academic-deepGreen hover:bg-academic-paleGreen disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={handleResetZoom}
              disabled={loading}
              title="Reset Zoom (100%)"
              className="text-[11px] font-mono font-semibold px-1.5 py-0.5 text-academic-deepGreen hover:bg-academic-paleGreen rounded transition-colors"
            >
              {Math.round(scale * 100)}%
            </button>

            <button
              type="button"
              onClick={handleZoomIn}
              disabled={scale >= 2.8 || loading}
              aria-label="Zoom In"
              title="Zoom In"
              className="p-1 rounded text-academic-deepGreen hover:bg-academic-paleGreen disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={handleFitWidth}
              disabled={loading}
              title="Fit Page to Width"
              className="hidden md:inline-flex text-[10px] font-semibold px-1.5 py-0.5 text-academic-primaryGreen hover:bg-academic-paleGreen rounded border border-academic-border/80 transition-colors ml-1"
            >
              Fit Width
            </button>
          </div>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={() => setIsFullscreen(prev => !prev)}
            aria-label={isFullscreen ? 'Exit Fullscreen' : 'View Fullscreen'}
            title={isFullscreen ? 'Exit Fullscreen' : 'View Fullscreen'}
            className="p-1.5 rounded bg-academic-surface text-academic-deepGreen hover:bg-academic-paleGreen border border-academic-border transition-colors shadow-2xs"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {/* Download for Offline Access */}
          <button
            type="button"
            onClick={handleDownload}
            disabled={isDownloading || loading}
            aria-label="Download Assignment PDF"
            title="Download original PDF for offline reference"
            className="btn-secondary text-xs px-2.5 py-1.5 h-auto min-h-[32px] inline-flex items-center space-x-1.5 shadow-2xs"
          >
            {isDownloading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-academic-primaryGreen" />
            ) : (
              <Download className="w-3.5 h-3.5 text-academic-primaryGreen" />
            )}
            <span className="hidden sm:inline font-semibold">
              {isDownloading ? 'Downloading...' : 'Download PDF'}
            </span>
          </button>
        </div>
      </div>

      {/* Viewer Main Body */}
      <div 
        className={`relative flex-1 bg-slate-100/90 overflow-auto flex items-center justify-center p-3 sm:p-6 select-text transition-colors ${
          isFullscreen ? 'max-h-[calc(100vh-120px)] min-h-[600px]' : 'min-h-[460px] max-h-[720px]'
        }`}
      >
        {/* Loading Spinner */}
        {loading && (
          <div className="flex flex-col items-center justify-center p-8 text-center space-y-3 bg-academic-surface/80 rounded-lg shadow-sm border border-academic-border">
            <Loader2 className="w-8 h-8 text-academic-primaryGreen animate-spin" />
            <p className="text-xs font-semibold text-academic-deepGreen">
              Loading assignment document...
            </p>
            <p className="text-[11px] text-academic-muted">
              Rendering layout, tables, diagrams and rubrics
            </p>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="max-w-md w-full bg-white p-5 rounded-lg border border-red-200 shadow-sm text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <h5 className="text-sm font-bold text-red-900">Unable to Display PDF</h5>
              <p className="text-xs text-red-700 mt-1 leading-relaxed">
                {error}
              </p>
            </div>
            <div className="flex items-center justify-center space-x-2 pt-2">
              <button
                type="button"
                onClick={loadDocument}
                className="btn-secondary text-xs px-3 py-1.5 h-auto inline-flex items-center"
              >
                <RotateCw className="w-3.5 h-3.5 mr-1.5" />
                <span>Retry</span>
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="btn-primary text-xs px-3 py-1.5 h-auto inline-flex items-center"
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                <span>Download File</span>
              </button>
            </div>
          </div>
        )}

        {/* Rendering Overlay */}
        {rendering && !loading && (
          <div className="absolute top-4 right-4 z-10 bg-academic-deepGreen/80 text-white px-2.5 py-1 rounded-full text-[10px] font-semibold flex items-center space-x-1.5 shadow-md">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Rendering page {currentPage}...</span>
          </div>
        )}

        {/* PDF Canvas Display */}
        <div
          className={`flex justify-center items-center shadow-lg rounded bg-white transition-opacity duration-150 ${
            loading || error ? 'hidden' : 'block'
          }`}
          style={{ maxWidth: '100%' }}
        >
          <canvas
            ref={canvasRef}
            className="block max-w-full h-auto mx-auto border border-slate-300"
          />
        </div>
      </div>

      {/* Viewer Footer */}
      <div className="bg-academic-paleGreen/40 border-t border-academic-border px-3 py-1.5 text-[11px] text-academic-muted flex items-center justify-between">
        <span>
          Showing page <span className="font-bold text-academic-deepGreen">{currentPage}</span> of <span className="font-bold text-academic-deepGreen">{numPages}</span>
        </span>
        <span className="hidden sm:inline">
          Use zoom controls or scroll to view details
        </span>
      </div>
    </div>
  );
};
