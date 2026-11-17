import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Clock, 
  FileText, 
  RefreshCw,
  Search,
  AlertTriangle
} from 'lucide-react';
import { hodApi } from '../../services/apiClient';
import { AuditEvent } from '@smartfa/contracts';

export const AuditViewer: React.FC = () => {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAudit = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await hodApi.getAuditEvents();
      setEvents(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to retrieve audit records from server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAudit();
  }, []);

  const filtered = events.filter(e => 
    e.action.toLowerCase().includes(search.toLowerCase()) ||
    e.resource_type.toLowerCase().includes(search.toLowerCase()) ||
    (e.actor_id && e.actor_id.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-academic-border">
        <div>
          <h2 className="text-xl font-bold text-academic-deepGreen flex items-center">
            <ShieldCheck className="w-5 h-5 mr-2 text-academic-primaryGreen" />
            Institutional Audit Log
          </h2>
          <p className="text-xs text-academic-muted mt-1">
            Chronological record of institutional administrative actions, role assignments, and status updates.
          </p>
        </div>

        <button
          onClick={fetchAudit}
          disabled={loading}
          className="btn-secondary text-xs flex items-center space-x-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Log</span>
        </button>
      </div>

      {error && (
        <div className="card-surface p-4 border border-red-300 bg-red-50 text-red-800 rounded-md flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs">
            <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={fetchAudit}
            className="btn-secondary text-xs px-2.5 py-1 text-red-700 border-red-300 hover:bg-red-100"
          >
            Retry
          </button>
        </div>
      )}

      <div className="card-surface p-4 flex items-center justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="w-4 h-4 text-academic-muted absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search action or resource..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-academic-bg border border-academic-border rounded-md text-academic-deepGreen focus:outline-none focus:ring-2 focus:ring-academic-primaryGreen"
          />
        </div>

        <div className="text-[11px] text-academic-muted flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-academic-primaryGreen inline-block"></span>
          <span>Policy: Permanent Institutional Record</span>
        </div>
      </div>

      <div className="space-y-3">
        {loading && events.length === 0 ? (
          <div className="card-surface text-center py-12 text-academic-muted text-xs flex flex-col items-center justify-center space-y-2">
            <RefreshCw className="w-5 h-5 animate-spin text-academic-primaryGreen" />
            <span>Loading audit log records from server...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="card-surface text-center py-8 text-academic-muted text-xs">
            {error ? 'Unable to display audit records.' : 'No audit records found.'}
          </div>
        ) : (
          filtered.map(event => (
            <div key={event.id} className="card-surface p-4 border border-academic-border hover:border-academic-primaryGreen/50 transition-colors">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-academic-border/60 pb-2 mb-3">
                <div className="flex items-center space-x-2">
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-academic-lightGreen border border-academic-primaryGreen/30 text-academic-deepGreen">
                    {event.action}
                  </span>
                  <span className="text-xs text-academic-deepGreen font-semibold">
                    Target: <span className="font-mono">{event.resource_type}</span>
                  </span>
                </div>

                <div className="flex items-center space-x-3 text-[11px] text-academic-muted">
                  <span className="flex items-center">
                    <Clock className="w-3.5 h-3.5 mr-1 text-academic-muted" />
                    {new Date(event.created_at).toLocaleString()}
                  </span>
                  <span className="font-mono text-[10px]">
                    ID: {event.id.slice(0, 8)}...
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-[11px] text-academic-muted">Authorized User:</p>
                  <p className="font-mono text-academic-deepGreen font-medium">
                    {event.actor_id || 'System / Automated'}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-academic-muted">Target Resource:</p>
                  <p className="font-mono text-academic-deepGreen font-medium truncate">
                    {event.resource_id}
                  </p>
                </div>
              </div>

              {(event.before || event.after) && (
                <div className="mt-3 pt-2 border-t border-academic-border/40">
                  <p className="text-[10px] uppercase font-bold text-academic-muted tracking-wider mb-1 flex items-center">
                    <FileText className="w-3 h-3 mr-1 text-academic-primaryGreen" />
                    Record Snapshot
                  </p>
                  <pre className="p-2.5 bg-academic-paleGreen rounded text-[11px] font-mono text-academic-deepGreen overflow-x-auto">
                    {JSON.stringify({ before: event.before, after: event.after }, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
