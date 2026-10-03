'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useRealtimeSubscription } from '@/lib/socket';
import {
  WorkItem,
  WorkItemStatus,
  WorkItemPriority,
  AuditEvent,
  Comment,
  VALID_TRANSITIONS,
} from '@newtonite/shared';

export default function WorkItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [item, setItem] = useState<WorkItem | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);

  // Edit / Action states
  const [actionLoading, setActionLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  // Team members for assignment dropdown
  const [teamMembers, setTeamMembers] = useState<any[]>([]);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      setConflictError(null);
      const [itemRes, eventsRes, commentsRes] = await Promise.all([
        api.getWorkItem(id),
        api.getEvents(id),
        api.getComments(id),
      ]);
      setItem(itemRes.data);
      setEvents(eventsRes.data);
      setComments(commentsRes.data);
      setError(null);

      if (itemRes.data.teamId) {
        api.getTeamMembers(itemRes.data.teamId)
          .then((res) => setTeamMembers(res.data))
          .catch(console.error);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load work item');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time socket events for this work item
  useRealtimeSubscription(
    'work_item:updated',
    (updated: WorkItem) => {
      if (updated.id === id) {
        setItem(updated);
        // Refresh events log
        api.getEvents(id).then((res) => setEvents(res.data)).catch(console.error);
      }
    },
    id
  );

  useRealtimeSubscription(
    'comment:added',
    (newComment: Comment) => {
      if (newComment.workItemId === id) {
        setComments((prev) => [...prev.filter((c) => c.id !== newComment.id), newComment]);
        api.getEvents(id).then((res) => setEvents(res.data)).catch(console.error);
      }
    },
    id
  );

  // Transition status with optimistic lock version
  const handleStatusChange = async (newStatus: WorkItemStatus) => {
    if (!item) return;
    setActionLoading(true);
    setConflictError(null);
    try {
      const idempotencyKey = `status-${item.id}-${newStatus}-${Date.now()}`;
      const res = await api.updateWorkItem(
        item.id,
        {
          status: newStatus,
          expectedVersion: item.version,
        },
        idempotencyKey
      );
      setItem(res.data);
      const eventsRes = await api.getEvents(id);
      setEvents(eventsRes.data);
    } catch (err: any) {
      if (err.status === 409 || err.code === 'CONCURRENT_UPDATE_CONFLICT') {
        setConflictError(
          'Conflict detected: Another user has modified this work item simultaneously. Please refresh to load the latest state before retrying.'
        );
      } else {
        alert(err.message || 'Failed to update status');
      }
    } finally {
      setActionLoading(false);
    }
  };

  // Change priority
  const handlePriorityChange = async (newPriority: WorkItemPriority) => {
    if (!item || newPriority === item.priority) return;
    setActionLoading(true);
    setConflictError(null);
    try {
      const idempotencyKey = `prio-${item.id}-${newPriority}-${Date.now()}`;
      const res = await api.updateWorkItem(
        item.id,
        {
          priority: newPriority,
          expectedVersion: item.version,
        },
        idempotencyKey
      );
      setItem(res.data);
      const eventsRes = await api.getEvents(id);
      setEvents(eventsRes.data);
    } catch (err: any) {
      if (err.status === 409 || err.code === 'CONCURRENT_UPDATE_CONFLICT') {
        setConflictError('Conflict: Work item was updated concurrently. Click Reload below.');
      } else {
        alert(err.message || 'Failed to change priority');
      }
    } finally {
      setActionLoading(false);
    }
  };

  // Atomic claim
  const handleClaim = async () => {
    if (!item) return;
    setActionLoading(true);
    try {
      const idempotencyKey = `claim-${item.id}-${Date.now()}`;
      const res = await api.claimWorkItem(item.id, idempotencyKey);
      setItem(res.data);
      const eventsRes = await api.getEvents(id);
      setEvents(eventsRes.data);
    } catch (err: any) {
      alert(err.message || 'Failed to claim item');
    } finally {
      setActionLoading(false);
    }
  };

  // Assign to team member
  const handleAssignMember = async (targetUserId: string | null) => {
    if (!item) return;
    setActionLoading(true);
    setConflictError(null);
    try {
      const idempotencyKey = `assign-${item.id}-${targetUserId || 'none'}-${Date.now()}`;
      const res = await api.updateWorkItem(
        item.id,
        {
          assignedToId: targetUserId,
          expectedVersion: item.version,
        },
        idempotencyKey
      );
      setItem(res.data);
      const eventsRes = await api.getEvents(id);
      setEvents(eventsRes.data);
    } catch (err: any) {
      if (err.status === 409 || err.code === 'CONCURRENT_UPDATE_CONFLICT') {
        setConflictError('Conflict: Work item was updated concurrently. Click Reload below.');
      } else {
        alert(err.message || 'Failed to assign item');
      }
    } finally {
      setActionLoading(false);
    }
  };

  // Post comment
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || !item) return;

    setPostingComment(true);
    try {
      const idempotencyKey = `comment-${item.id}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const res = await api.addComment(item.id, commentText.trim(), idempotencyKey);
      setComments((prev) => [...prev, res.data]);
      setCommentText('');
      const eventsRes = await api.getEvents(id);
      setEvents(eventsRes.data);
    } catch (err: any) {
      alert(err.message || 'Failed to post comment');
    } finally {
      setPostingComment(false);
    }
  };

  if (loading) {
    return <div className="loading" style={{ padding: 60, textAlign: 'center' }}>Loading work item #{id?.substring(0, 8)}...</div>;
  }

  if (error || !item) {
    return (
      <div className="page-content">
        <div style={{ padding: 24, background: 'rgba(255, 77, 109, 0.1)', border: '1px solid var(--critical)', borderRadius: 'var(--radius)', color: 'var(--critical)' }}>
          <h3>Unable to find work item</h3>
          <p style={{ marginTop: 8 }}>{error || 'This work item does not exist or you do not have permission to view it.'}</p>
          <Link href="/work-items" className="btn btn-secondary" style={{ marginTop: 16 }}>
            ← Back to Work Items
          </Link>
        </div>
      </div>
    );
  }

  const validNextStatuses = VALID_TRANSITIONS[item.status] || [];

  return (
    <div>
      {/* Topbar navigation */}
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/work-items" className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: '0.85rem' }}>
            ← All Items
          </Link>
          <span style={{ color: 'var(--border)' }}>/</span>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
            {item.id.substring(0, 8)}
          </span>
          <span className={`badge badge-priority badge-${item.priority}`}>{item.priority}</span>
          <span className={`badge badge-status badge-${item.status.replace('_', '-')}`}>{item.status.replace('_', ' ')}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            v{item.version}
          </span>
          {!item.assignedToId && item.status !== 'closed' && (
            <button
              className="btn btn-primary"
              disabled={actionLoading}
              onClick={handleClaim}
            >
              ⚡ Claim Item
            </button>
          )}
        </div>
      </div>

      <div className="page-content">
        {/* Conflict Warning Banner */}
        {conflictError && (
          <div
            style={{
              padding: '16px 20px',
              background: 'rgba(255, 123, 53, 0.15)',
              border: '1px solid var(--high)',
              borderRadius: 'var(--radius-lg)',
              marginBottom: 24,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
            }}
          >
            <div>
              <div style={{ fontWeight: 600, color: 'var(--high)', fontSize: '0.95rem' }}>
                ⚠️ Optimistic Concurrency Conflict
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginTop: 4 }}>
                {conflictError}
              </div>
            </div>
            <button className="btn btn-secondary" onClick={loadData}>
              ↻ Reload Latest Version
            </button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 24, alignItems: 'start' }}>
          {/* Main Left Column: Title, Description, Timeline, Comments */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Header Card */}
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <span style={{ textTransform: 'capitalize' }}>{item.type}</span>
                <span>•</span>
                <span>Created {new Date(item.createdAt).toLocaleString()} by {item.createdByName || 'User'}</span>
              </div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 16, lineHeight: 1.3 }}>
                {item.title}
              </h1>

              <div style={{ fontSize: '0.95rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.6, background: 'var(--bg-surface)', padding: 16, borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                {item.description || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No description provided.</span>}
              </div>
            </div>

            {/* Workflow Action Bar */}
            <div className="card">
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Status Transitions (Workflow Guarded)
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Move to:</span>
                {validNextStatuses.length === 0 ? (
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    Terminal status reached (closed)
                  </span>
                ) : (
                  validNextStatuses.map((nextStatus) => (
                    <button
                      key={nextStatus}
                      className="btn btn-secondary"
                      disabled={actionLoading}
                      onClick={() => handleStatusChange(nextStatus)}
                      style={{ fontSize: '0.85rem', textTransform: 'capitalize' }}
                    >
                      → {nextStatus.replace('_', ' ')}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Comments & Discussion */}
            <div className="card">
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: 16 }}>
                Discussion ({comments.length})
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
                {comments.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic', padding: '12px 0' }}>
                    No comments yet. Start the conversation below.
                  </div>
                ) : (
                  comments.map((comment) => (
                    <div
                      key={comment.id}
                      style={{
                        padding: '12px 14px',
                        background: 'var(--bg-surface)',
                        borderRadius: 'var(--radius)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.8rem' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{comment.authorName}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{new Date(comment.createdAt).toLocaleString()}</span>
                      </div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                        {comment.body}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Add Comment Form */}
              <form onSubmit={handleAddComment}>
                <textarea
                  rows={3}
                  placeholder="Leave a comment or operational update..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  className="form-control"
                  style={{ width: '100%', padding: '10px 12px', fontFamily: 'inherit', resize: 'vertical', marginBottom: 10 }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="submit"
                    disabled={postingComment || !commentText.trim()}
                    className="btn btn-primary"
                  >
                    {postingComment ? 'Posting...' : 'Post Comment'}
                  </button>
                </div>
              </form>
            </div>

            {/* Audit Log / Event History */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>Immutable Audit Trail</h3>
                <span className="badge" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                  {events.length} Events
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {events.map((ev) => (
                  <div
                    key={ev.id}
                    style={{
                      display: 'flex',
                      gap: 12,
                      fontSize: '0.85rem',
                      borderLeft: '2px solid var(--border)',
                      paddingLeft: 14,
                      position: 'relative',
                    }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', position: 'absolute', left: -5, top: 4 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: 2 }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{ev.actorName}</span>
                        <span>{new Date(ev.createdAt).toLocaleString()}</span>
                      </div>
                      <div style={{ color: 'var(--text-primary)' }}>
                        <span className="badge" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', marginRight: 6, fontSize: '0.7rem' }}>
                          {ev.eventType.replace('_', ' ')}
                        </span>
                        {ev.eventType === 'status_changed' && (
                          <span>changed status from <strong>{(ev.payload as any)?.from}</strong> to <strong>{(ev.payload as any)?.to}</strong></span>
                        )}
                        {ev.eventType === 'priority_changed' && (
                          <span>changed priority from <strong>{(ev.payload as any)?.from}</strong> to <strong>{(ev.payload as any)?.to}</strong></span>
                        )}
                        {ev.eventType === 'assigned' && (
                          <span>assigned item to <strong>{(ev.payload as any)?.toName || (ev.payload as any)?.to || 'user'}</strong></span>
                        )}
                        {ev.eventType === 'unassigned' && <span>unassigned the item</span>}
                        {ev.eventType === 'commented' && <span>added a comment</span>}
                        {ev.eventType === 'created' && <span>created this work item</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Sidebar: Metadata & Attributes */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 16, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Item Attributes
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>CURRENT STATUS</div>
                  <div>
                    <span className={`badge badge-status badge-${item.status.replace('_', '-')}`} style={{ fontSize: '0.85rem', padding: '4px 10px' }}>
                      {item.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>PRIORITY</div>
                  <select
                    value={item.priority}
                    disabled={actionLoading}
                    onChange={(e) => handlePriorityChange(e.target.value as WorkItemPriority)}
                    className="form-control"
                    style={{ width: '100%', padding: '6px 10px', fontSize: '0.85rem' }}
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>ASSIGNEE</div>
                  <select
                    value={item.assignedToId || ''}
                    disabled={actionLoading}
                    onChange={(e) => handleAssignMember(e.target.value ? e.target.value : null)}
                    className="form-control"
                    style={{ width: '100%', padding: '6px 10px', fontSize: '0.85rem' }}
                  >
                    <option value="">(Unassigned)</option>
                    {user && <option value={user.id}>{user.name} (You)</option>}
                    {teamMembers
                      .filter((m) => m.id !== user?.id)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.role})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>RESPONSIBLE TEAM</div>
                  <div style={{ fontWeight: 500 }}>{item.teamName || 'None'}</div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>VERSION (OCC)</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    v{item.version}
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div>Created: {new Date(item.createdAt).toLocaleString()}</div>
                  <div>Last Updated: {new Date(item.updatedAt).toLocaleString()}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
