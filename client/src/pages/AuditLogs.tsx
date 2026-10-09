import { useEffect, useState } from 'react';
import {
  AuditLog,
  AuditLogPagination,
  getAuditLogsApi,
  getMembersApi,
  Member,
} from '../api/client';
import { useAuth } from '../context/AuthContext';

const COMMON_ACTIONS = [
  'MEMBER_INVITED',
  'INVITATION_ACCEPTED',
  'MEMBER_ROLE_UPDATED',
  'MEMBER_REMOVED',
  'PROJECT_CREATED',
  'PROJECT_UPDATED',
  'PROJECT_ARCHIVED',
  'TASK_CREATED',
  'TASK_UPDATED',
  'TASK_ASSIGNED',
  'TASK_STATUS_UPDATED',
  'CUSTOMER_CREATED',
  'CUSTOMER_UPDATED',
  'CUSTOMER_DELETED',
  'CUSTOMER_PROJECT_LINKED',
  'CUSTOMER_PROJECT_UNLINKED',
  'SUBSCRIPTION_PLAN_CHANGED',
];

export function AuditLogs() {
  const { accessToken, user } = useAuth();
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<AuditLogPagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [members, setMembers] = useState<Member[]>([]);

  // Filter States
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [selectedActorId, setSelectedActorId] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);

  // Status States
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isAccessDenied, setIsAccessDenied] = useState<boolean>(false);

  // Fetch Member List for Actor Filter Dropdown
  useEffect(() => {
    if (!accessToken) return;
    getMembersApi(accessToken)
      .then((res) => setMembers(res.members))
      .catch(() => {
        // Ignore member list load failure
      });
  }, [accessToken]);

  // Main Audit Log Fetcher
  const fetchLogs = async () => {
    if (!accessToken) return;

    // Frontend role pre-check
    if (user?.role && !['OWNER', 'ADMIN'].includes(user.role)) {
      setIsAccessDenied(true);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setIsAccessDenied(false);

    try {
      const res = await getAuditLogsApi(accessToken, {
        page: currentPage,
        limit: pageSize,
        action: selectedAction || undefined,
        actorId: selectedActorId || undefined,
      });
      setAuditLogs(res.auditLogs);
      setPagination(res.pagination);
    } catch (err: any) {
      if (err.code === 'INSUFFICIENT_ROLE' || err.message?.includes('permission')) {
        setIsAccessDenied(true);
      } else {
        setError(err.message || 'Unable to retrieve audit logs');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [accessToken, currentPage, pageSize, selectedAction, selectedActorId]);

  const handleActionChange = (action: string) => {
    setSelectedAction(action);
    setCurrentPage(1);
  };

  const handleActorChange = (actorId: string) => {
    setSelectedActorId(actorId);
    setCurrentPage(1);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSelectedAction('');
    setSelectedActorId('');
    setCurrentPage(1);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="flex items-center space-x-3 text-slate-400">
          <svg className="animate-spin h-6 w-6 text-sky-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <span className="text-sm font-medium">Loading audit logs...</span>
        </div>
      </div>
    );
  }

  if (isAccessDenied) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center space-y-4 max-w-xl mx-auto mt-12 shadow-xl">
        <div className="w-12 h-12 bg-amber-950/80 border border-amber-800 rounded-full flex items-center justify-center mx-auto text-amber-400 font-bold text-xl">
          🔒
        </div>
        <h2 className="text-xl font-bold text-white">Access Restricted</h2>
        <p className="text-slate-400 text-sm leading-relaxed">
          You do not have permission to view organization audit logs. Audit log retrieval is restricted to OWNER and ADMIN roles.
        </p>
      </div>
    );
  }

  const isFiltered = Boolean(selectedAction || selectedActorId);

  return (
    <div className="space-y-6 font-sans">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-xl">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Audit Logs</h1>
          <p className="text-slate-400 text-xs mt-1">
            Read-only chronological trail of system and organization events.
          </p>
        </div>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="bg-red-950/60 border border-red-800/80 p-4 rounded-xl flex items-center justify-between text-red-200 text-sm shadow-md">
          <span>{error}</span>
          <button
            onClick={fetchLogs}
            className="px-3 py-1 bg-red-900/80 hover:bg-red-800 text-white text-xs font-semibold rounded-md border border-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Filters & Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-4 rounded-xl">
        <div className="flex flex-wrap items-center gap-3">
          {/* Action Filter */}
          <div className="flex items-center space-x-2">
            <label className="text-xs font-mono text-slate-400">Action:</label>
            <select
              value={selectedAction}
              onChange={(e) => handleActionChange(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-sky-500"
            >
              <option value="">All Actions</option>
              {COMMON_ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </div>

          {/* Actor Filter */}
          <div className="flex items-center space-x-2">
            <label className="text-xs font-mono text-slate-400">Actor:</label>
            <select
              value={selectedActorId}
              onChange={(e) => handleActorChange(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-sky-500"
            >
              <option value="">All Actors</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.user.name || m.user.email}
                </option>
              ))}
            </select>
          </div>

          {/* Clear Filters Button */}
          {isFiltered && (
            <button
              onClick={handleClearFilters}
              className="text-xs text-slate-400 hover:text-white px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>

        {/* Page Size Selector */}
        <div className="flex items-center space-x-2">
          <label className="text-xs font-mono text-slate-400">Per Page:</label>
          <select
            value={pageSize}
            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
            className="bg-slate-950 border border-slate-800 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-sky-500"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>

      {/* Audit Logs Table / Cards */}
      {auditLogs.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-12 text-center space-y-3">
          <p className="text-slate-300 font-semibold text-base">
            {isFiltered ? 'No audit logs match your filter criteria.' : 'No audit logs found.'}
          </p>
          <p className="text-slate-500 text-xs">
            {isFiltered
              ? 'Try selecting a different action or clearing active filters.'
              : 'Audit events will appear here as organization mutations occur.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {auditLogs.map((log) => (
            <div
              key={log.id}
              className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3 shadow-lg hover:border-slate-700 transition-all"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-1 text-xs font-bold font-mono rounded-md bg-sky-950 text-sky-400 border border-sky-800/80">
                    {log.action}
                  </span>
                  {log.entityType && (
                    <span className="text-xs font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                      {log.entityType} {log.entityId ? `#${log.entityId.substring(0, 8)}` : ''}
                    </span>
                  )}
                </div>
                <span className="text-xs font-mono text-slate-500">
                  {new Date(log.createdAt).toLocaleString()}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs">
                <div className="flex items-center space-x-2">
                  <span className="text-slate-500 font-mono">Actor:</span>
                  <span className="text-slate-200 font-medium">
                    {log.actor ? `${log.actor.name} (${log.actor.email})` : log.actorId ? `User #${log.actorId.substring(0, 8)}` : 'System / Webhook'}
                  </span>
                </div>

                {log.entityId && (
                  <div className="text-slate-500 font-mono truncate max-w-xs">
                    Entity ID: <span className="text-slate-300">{log.entityId}</span>
                  </div>
                )}
              </div>

              {log.metadata && Object.keys(log.metadata).length > 0 && (
                <div className="bg-slate-950 border border-slate-800/80 rounded-lg p-3 text-xs font-mono space-y-1 overflow-x-auto">
                  <span className="text-[10px] uppercase text-slate-500 tracking-wider block font-sans">
                    Metadata Payload
                  </span>
                  <pre className="text-slate-300 text-[11px] leading-tight">
                    {JSON.stringify(log.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination Bar */}
      {pagination.totalPages > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg text-xs font-mono">
          <div className="text-slate-400">
            Page <span className="text-white font-semibold">{pagination.page}</span> of{' '}
            <span className="text-white font-semibold">{pagination.totalPages}</span>{' '}
            ({pagination.total} total events)
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage <= 1 || isLoading}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-white rounded-lg border border-slate-700 transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage((prev) => Math.min(pagination.totalPages, prev + 1))}
              disabled={currentPage >= pagination.totalPages || isLoading}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-white rounded-lg border border-slate-700 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
