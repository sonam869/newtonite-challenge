'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useRealtimeSubscription } from '@/lib/socket';
import { WorkItem, WorkItemStatus, WorkItemPriority, WorkItemType } from '@newtonite/shared';

export default function WorkItemsPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [items, setItems] = useState<WorkItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') || '');
  const [priorityFilter, setPriorityFilter] = useState<string>(searchParams.get('priority') || '');
  const [typeFilter, setTypeFilter] = useState<string>(searchParams.get('type') || '');
  const [searchQuery, setSearchQuery] = useState<string>(searchParams.get('q') || '');
  const [teamFilter, setTeamFilter] = useState<string>(searchParams.get('teamId') || '');
  const [unassignedOnly, setUnassignedOnly] = useState<boolean>(searchParams.get('unassigned') === 'true');

  // Teams list for filter and create modal
  const [teams, setTeams] = useState<any[]>([]);

  // Create Modal state
  const [isCreateOpen, setIsCreateOpen] = useState(searchParams.get('create') === 'true');
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newPriority, setNewPriority] = useState<WorkItemPriority>('medium');
  const [newType, setNewType] = useState<WorkItemType>('task');
  const [newTeamId, setNewTeamId] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Claim loading state
  const [claimingId, setClaimingId] = useState<string | null>(null);

  useEffect(() => {
    api.getTeams().then((res) => {
      setTeams(res.data);
      if (res.data.length > 0 && !newTeamId) {
        setNewTeamId(res.data[0].id);
      }
    }).catch(console.error);
  }, []);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        page: page.toString(),
        pageSize: pageSize.toString(),
      };
      if (statusFilter) params.status = statusFilter;
      if (priorityFilter) params.priority = priorityFilter;
      if (typeFilter) params.type = typeFilter;
      if (teamFilter) params.teamId = teamFilter;
      if (searchQuery.trim()) params.q = searchQuery.trim();
      if (unassignedOnly) params.unassigned = 'true';

      const res = await api.getWorkItems(params);
      setItems(res.data);
      setTotal(res.total);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load work items');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, priorityFilter, typeFilter, teamFilter, searchQuery, unassignedOnly]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Real-time live synchronization
  useRealtimeSubscription('work_item:created', (newItem: WorkItem) => {
    setItems((prev) => [newItem, ...prev.filter((i) => i.id !== newItem.id)]);
    setTotal((prev) => prev + 1);
  });

  useRealtimeSubscription('work_item:updated', (updatedItem: WorkItem) => {
    setItems((prev) => prev.map((i) => (i.id === updatedItem.id ? updatedItem : i)));
  });

  const handleClaim = async (id: string) => {
    try {
      setClaimingId(id);
      const idempotencyKey = `claim-${id}-${Date.now()}`;
      await api.claimWorkItem(id, idempotencyKey);
      await fetchItems();
    } catch (err: any) {
      alert(err.message || 'Failed to claim work item');
    } finally {
      setClaimingId(null);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      setCreateError('Title is required');
      return;
    }
    if (!newTeamId) {
      setCreateError('Please select a team');
      return;
    }

    setCreating(true);
    setCreateError(null);
    try {
      // Idempotency key to guarantee single creation even on double submit
      const idempotencyKey = `create-item-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const res = await api.createWorkItem(
        {
          title: newTitle.trim(),
          description: newDescription.trim(),
          priority: newPriority,
          type: newType,
          teamId: newTeamId,
        },
        idempotencyKey
      );

      setIsCreateOpen(false);
      setNewTitle('');
      setNewDescription('');
      router.push(`/work-items/${res.data.id}`);
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create work item');
      setCreating(false);
    }
  };

  return (
    <div>
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Work Items</h1>
          <span className="badge" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
            {total} Total
          </span>
        </div>
        <button
          id="open-create-modal-btn"
          className="btn btn-primary"
          onClick={() => {
            setCreateError(null);
            setIsCreateOpen(true);
          }}
        >
          + Create Work Item
        </button>
      </div>

      <div className="page-content">
        {/* Filters Bar */}
        <div
          className="card"
          style={{
            marginBottom: 20,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            alignItems: 'center',
            padding: '14px 18px',
          }}
        >
          <div style={{ flex: '1 1 200px', minWidth: 180 }}>
            <input
              type="text"
              placeholder="Search by title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="form-control"
              style={{ width: '100%', padding: '7px 12px', fontSize: '0.875rem' }}
            />
          </div>

          <div style={{ minWidth: 130 }}>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="form-control"
              style={{ width: '100%', padding: '7px 12px', fontSize: '0.875rem' }}
            >
              <option value="">All Statuses</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="pending_approval">Pending Approval</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          <div style={{ minWidth: 130 }}>
            <select
              value={priorityFilter}
              onChange={(e) => {
                setPriorityFilter(e.target.value);
                setPage(1);
              }}
              className="form-control"
              style={{ width: '100%', padding: '7px 12px', fontSize: '0.875rem' }}
            >
              <option value="">All Priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div style={{ minWidth: 130 }}>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              className="form-control"
              style={{ width: '100%', padding: '7px 12px', fontSize: '0.875rem' }}
            >
              <option value="">All Types</option>
              <option value="incident">Incident</option>
              <option value="task">Task</option>
              <option value="compliance">Compliance</option>
              <option value="approval">Approval</option>
              <option value="investigation">Investigation</option>
            </select>
          </div>

          <div style={{ minWidth: 130 }}>
            <select
              value={teamFilter}
              onChange={(e) => {
                setTeamFilter(e.target.value);
                setPage(1);
              }}
              className="form-control"
              style={{ width: '100%', padding: '7px 12px', fontSize: '0.875rem' }}
            >
              <option value="">All Teams</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={unassignedOnly}
              onChange={(e) => {
                setUnassignedOnly(e.target.checked);
                setPage(1);
              }}
            />
            Unassigned only
          </label>

          {(statusFilter || priorityFilter || typeFilter || teamFilter || searchQuery || unassignedOnly) && (
            <button
              className="btn btn-ghost"
              style={{ fontSize: '0.8rem', padding: '6px 10px' }}
              onClick={() => {
                setStatusFilter('');
                setPriorityFilter('');
                setTypeFilter('');
                setTeamFilter('');
                setSearchQuery('');
                setUnassignedOnly(false);
                setPage(1);
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        {error && (
          <div style={{ padding: '12px 16px', background: 'rgba(255, 77, 109, 0.1)', border: '1px solid var(--critical)', borderRadius: 'var(--radius)', color: 'var(--critical)', marginBottom: 20 }}>
            {error}
          </div>
        )}

        {/* Work items table */}
        <div className="card">
          {loading ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
              Loading operational items...
            </div>
          ) : items.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No work items match your current filters.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                    <th style={{ padding: '12px' }}>Title</th>
                    <th style={{ padding: '12px' }}>Status</th>
                    <th style={{ padding: '12px' }}>Priority</th>
                    <th style={{ padding: '12px' }}>Type</th>
                    <th style={{ padding: '12px' }}>Team</th>
                    <th style={{ padding: '12px' }}>Assignee</th>
                    <th style={{ padding: '12px' }}>Created</th>
                    <th style={{ padding: '12px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        transition: 'background 0.1s',
                      }}
                    >
                      <td style={{ padding: '12px', maxWidth: 300 }}>
                        <Link
                          href={`/work-items/${item.id}`}
                          style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {item.title}
                        </Link>
                        {item.description && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                            {item.description}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span className={`badge badge-status badge-${item.status.replace('_', '-')}`}>
                          {item.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span className={`badge badge-priority badge-${item.priority}`}>
                          {item.priority}
                        </span>
                      </td>
                      <td style={{ padding: '12px', textTransform: 'capitalize', color: 'var(--text-secondary)' }}>
                        {item.type}
                      </td>
                      <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                        {item.teamName || '—'}
                      </td>
                      <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                        {item.assignedToName ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />
                            {item.assignedToName}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Unassigned</span>
                        )}
                      </td>
                      <td style={{ padding: '12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {new Date(item.createdAt).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                          {!item.assignedToId && item.status !== 'closed' && (
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                              disabled={claimingId === item.id}
                              onClick={() => handleClaim(item.id)}
                            >
                              {claimingId === item.id ? 'Claiming...' : 'Claim'}
                            </button>
                          )}
                          <Link
                            href={`/work-items/${item.id}`}
                            className="btn btn-ghost"
                            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                          >
                            Details →
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {total > pageSize && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                >
                  Previous
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={page * pageSize >= total}
                  onClick={() => setPage((p) => p + 1)}
                  style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Create Work Item */}
      {isCreateOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            backdropFilter: 'blur(3px)',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsCreateOpen(false);
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: 540,
              boxShadow: 'var(--shadow)',
              padding: 24,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Create New Work Item</h2>
              <button
                className="btn btn-ghost"
                style={{ padding: 4, fontSize: '1.2rem', lineHeight: 1 }}
                onClick={() => setIsCreateOpen(false)}
              >
                ✕
              </button>
            </div>

            {createError && (
              <div style={{ padding: '8px 12px', background: 'rgba(255, 77, 109, 0.1)', border: '1px solid var(--critical)', borderRadius: 'var(--radius)', color: 'var(--critical)', fontSize: '0.85rem', marginBottom: 16 }}>
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Payment gateway timeout investigation"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="form-control"
                  style={{ width: '100%', padding: '8px 12px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Description
                </label>
                <textarea
                  rows={4}
                  placeholder="Detailed context, reproduction steps, affected systems..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="form-control"
                  style={{ width: '100%', padding: '8px 12px', fontFamily: 'inherit', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    Type
                  </label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as WorkItemType)}
                    className="form-control"
                    style={{ width: '100%', padding: '8px 12px' }}
                  >
                    <option value="incident">Incident</option>
                    <option value="task">Task</option>
                    <option value="compliance">Compliance</option>
                    <option value="approval">Approval</option>
                    <option value="investigation">Investigation</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    Priority
                  </label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as WorkItemPriority)}
                    className="form-control"
                    style={{ width: '100%', padding: '8px 12px' }}
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Assigned Team *
                </label>
                <select
                  required
                  value={newTeamId}
                  onChange={(e) => setNewTeamId(e.target.value)}
                  className="form-control"
                  style={{ width: '100%', padding: '8px 12px' }}
                >
                  <option value="" disabled>Select team responsible</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsCreateOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="btn btn-primary"
                >
                  {creating ? 'Creating...' : 'Create Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
