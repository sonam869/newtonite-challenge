'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useRealtimeSubscription } from '@/lib/socket';
import { WorkItem, WorkItemStatus, WorkItemPriority } from '@newtonite/shared';

export default function DashboardPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await api.getWorkItems({ pageSize: '50' });
      setItems(res.data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Real-time updates
  useRealtimeSubscription('work_item:created', (newItem: WorkItem) => {
    setItems((prev) => [newItem, ...prev.filter((i) => i.id !== newItem.id)]);
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

  const openCount = items.filter((i) => i.status === 'open').length;
  const inProgressCount = items.filter((i) => i.status === 'in_progress').length;
  const pendingCount = items.filter((i) => i.status === 'pending_approval').length;
  const criticalCount = items.filter((i) => (i.priority === 'critical' || i.priority === 'high') && i.status !== 'resolved' && i.status !== 'closed').length;
  const unassignedItems = items.filter((i) => !i.assignedToId && i.status !== 'closed' && i.status !== 'resolved');
  const myAssignedItems = items.filter((i) => i.assignedToId === user?.id && i.status !== 'closed');

  return (
    <div>
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Operations Dashboard</h1>
          <span className="badge" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
            Overview
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link href="/work-items?create=true" className="btn btn-primary" id="new-item-btn">
            + New Work Item
          </Link>
        </div>
      </div>

      <div className="page-content">
        {error && (
          <div style={{ padding: '12px 16px', background: 'rgba(255, 77, 109, 0.1)', border: '1px solid var(--critical)', borderRadius: 'var(--radius)', color: 'var(--critical)', marginBottom: 20 }}>
            {error}
          </div>
        )}

        {/* Metric Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
          <div className="card" style={{ borderLeft: '4px solid var(--accent)' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Open Items</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, marginTop: 4 }}>{openCount}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>Awaiting action or assignment</div>
          </div>

          <div className="card" style={{ borderLeft: '4px solid var(--status-in-progress)' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>In Progress</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, marginTop: 4 }}>{inProgressCount}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>Actively worked on</div>
          </div>

          <div className="card" style={{ borderLeft: '4px solid var(--status-pending)' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pending Approval</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, marginTop: 4 }}>{pendingCount}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>Requires review/sign-off</div>
          </div>

          <div className="card" style={{ borderLeft: '4px solid var(--critical)' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--critical)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Critical / High</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, marginTop: 4, color: 'var(--critical)' }}>{criticalCount}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>High pressure operational items</div>
          </div>
        </div>

        {/* Main Grid: Unassigned triage & My assigned work */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: 24 }}>
          {/* Triage Queue: Unassigned items */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: '1.05rem', fontWeight: 600 }}>Unassigned Triage Queue</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Items needing ownership and fast response</p>
              </div>
              <span className="badge badge-open">{unassignedItems.length} unassigned</span>
            </div>

            {loading ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading triage items...</div>
            ) : unassignedItems.length === 0 ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
                ✨ All open items are assigned! Good job team.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {unassignedItems.slice(0, 6).map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      gap: 12,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span className={`badge badge-priority badge-${item.priority}`}>{item.priority}</span>
                        <span className="badge" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                          {item.type}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{item.teamName || 'No Team'}</span>
                      </div>
                      <Link href={`/work-items/${item.id}`} style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.title}
                      </Link>
                    </div>

                    <button
                      className="btn btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                      disabled={claimingId === item.id}
                      onClick={() => handleClaim(item.id)}
                    >
                      {claimingId === item.id ? 'Claiming...' : '⚡ Claim'}
                    </button>
                  </div>
                ))}

                {unassignedItems.length > 6 && (
                  <Link href="/work-items?unassigned=true" style={{ textAlign: 'center', padding: '8px 0', fontSize: '0.85rem', color: 'var(--accent)' }}>
                    View all {unassignedItems.length} unassigned items →
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Assigned to Me */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: '1.05rem', fontWeight: 600 }}>Assigned to Me</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Active items under your responsibility</p>
              </div>
              <span className="badge" style={{ background: 'var(--accent-glow)', color: 'var(--accent)' }}>
                {myAssignedItems.length} active
              </span>
            </div>

            {loading ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading your items...</div>
            ) : myAssignedItems.length === 0 ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
                You have no pending items assigned to you.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {myAssignedItems.slice(0, 6).map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      gap: 12,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span className={`badge badge-status badge-${item.status.replace('_', '-')}`}>{item.status.replace('_', ' ')}</span>
                        <span className={`badge badge-priority badge-${item.priority}`}>{item.priority}</span>
                      </div>
                      <Link href={`/work-items/${item.id}`} style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.title}
                      </Link>
                    </div>

                    <Link href={`/work-items/${item.id}`} className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                      View →
                    </Link>
                  </div>
                ))}

                {myAssignedItems.length > 6 && (
                  <Link href={`/work-items?assignedTo=${user?.id}`} style={{ textAlign: 'center', padding: '8px 0', fontSize: '0.85rem', color: 'var(--accent)' }}>
                    View all {myAssignedItems.length} of your items →
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Operational Flow Summary */}
        <div className="card" style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 600 }}>All Active Work Items</h2>
            <Link href="/work-items" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
              Full Work Items Table & Filters →
            </Link>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 12px' }}>Title</th>
                  <th style={{ padding: '10px 12px' }}>Status</th>
                  <th style={{ padding: '10px 12px' }}>Priority</th>
                  <th style={{ padding: '10px 12px' }}>Type</th>
                  <th style={{ padding: '10px 12px' }}>Team</th>
                  <th style={{ padding: '10px 12px' }}>Assignee</th>
                  <th style={{ padding: '10px 12px' }}>Updated</th>
                </tr>
              </thead>
              <tbody>
                {items.slice(0, 10).map((item) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}>
                    <td style={{ padding: '12px' }}>
                      <Link href={`/work-items/${item.id}`} style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {item.title}
                      </Link>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span className={`badge badge-status badge-${item.status.replace('_', '-')}`}>{item.status.replace('_', ' ')}</span>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span className={`badge badge-priority badge-${item.priority}`}>{item.priority}</span>
                    </td>
                    <td style={{ padding: '12px', textTransform: 'capitalize', color: 'var(--text-secondary)' }}>{item.type}</td>
                    <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{item.teamName || '—'}</td>
                    <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{item.assignedToName || <span style={{ color: 'var(--text-muted)' }}>Unassigned</span>}</td>
                    <td style={{ padding: '12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {new Date(item.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
