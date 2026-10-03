'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { TeamRole } from '@newtonite/shared';

interface TeamWithMembers {
  id: string;
  name: string;
  createdAt: string;
  members: Array<{
    id: string;
    name: string;
    email: string;
    role: TeamRole;
  }>;
}

export default function TeamsPage() {
  const { user } = useAuth();
  const [teams, setTeams] = useState<TeamWithMembers[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create team state
  const [newTeamName, setNewTeamName] = useState('');
  const [creatingTeam, setCreatingTeam] = useState(false);

  // Add member modal/state
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [userQuery, setUserQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [memberRole, setMemberRole] = useState<TeamRole>('member');
  const [addingMember, setAddingMember] = useState(false);

  const loadTeams = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getTeams();
      const teamsData: TeamWithMembers[] = await Promise.all(
        res.data.map(async (t: any) => {
          try {
            const mRes = await api.getTeamMembers(t.id);
            return { ...t, members: mRes.data };
          } catch {
            return { ...t, members: [] };
          }
        })
      );
      setTeams(teamsData);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load teams');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    setCreatingTeam(true);
    try {
      await api.createTeam(newTeamName.trim());
      setNewTeamName('');
      await loadTeams();
    } catch (err: any) {
      alert(err.message || 'Failed to create team');
    } finally {
      setCreatingTeam(false);
    }
  };

  const handleSearchUsers = async (q: string) => {
    setUserQuery(q);
    if (q.trim().length >= 1) {
      try {
        const res = await api.searchUsers(q.trim());
        setSearchResults(res.data);
      } catch (err) {
        console.error(err);
      }
    } else {
      setSearchResults([]);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTeamId || !selectedUser) return;
    setAddingMember(true);
    try {
      await api.addTeamMember(activeTeamId, selectedUser.id, memberRole);
      setActiveTeamId(null);
      setSelectedUser(null);
      setUserQuery('');
      setSearchResults([]);
      await loadTeams();
    } catch (err: any) {
      alert(err.message || 'Failed to add member');
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = async (teamId: string, memberUserId: string) => {
    if (!confirm('Are you sure you want to remove this member from the team?')) return;
    try {
      await api.removeTeamMember(teamId, memberUserId);
      await loadTeams();
    } catch (err: any) {
      alert(err.message || 'Failed to remove member');
    }
  };

  const isAdmin = user?.globalRole === 'admin';

  return (
    <div>
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Teams & Routing</h1>
          <span className="badge" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
            {teams.length} Teams
          </span>
        </div>
      </div>

      <div className="page-content">
        {error && (
          <div style={{ padding: '12px 16px', background: 'rgba(255, 77, 109, 0.1)', border: '1px solid var(--critical)', borderRadius: 'var(--radius)', color: 'var(--critical)', marginBottom: 20 }}>
            {error}
          </div>
        )}

        {/* Create Team Card (Admin only) */}
        {isAdmin && (
          <div className="card" style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: 12 }}>Create New Operational Team</h2>
            <form onSubmit={handleCreateTeam} style={{ display: 'flex', gap: 12, maxWidth: 600 }}>
              <input
                type="text"
                required
                placeholder="Team name (e.g. Payments Ops, Platform SRE)"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                className="form-control"
                style={{ flex: 1, padding: '8px 12px' }}
              />
              <button type="submit" disabled={creatingTeam} className="btn btn-primary">
                {creatingTeam ? 'Creating...' : '+ Create Team'}
              </button>
            </form>
          </div>
        )}

        {/* Teams List */}
        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading teams and memberships...
          </div>
        ) : teams.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
            No teams configured yet.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 20 }}>
            {teams.map((team) => {
              const isLeadOfTeam = team.members.some((m) => m.id === user?.id && m.role === 'lead');
              const canManageTeam = isAdmin || isLeadOfTeam;

              return (
                <div key={team.id} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{team.name}</h3>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                        {team.members.length} members
                      </div>
                    </div>
                    {canManageTeam && (
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                        onClick={() => {
                          setActiveTeamId(team.id);
                          setSelectedUser(null);
                          setUserQuery('');
                          setSearchResults([]);
                        }}
                      >
                        + Add Member
                      </button>
                    )}
                  </div>

                  {/* Members list */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    {team.members.length === 0 ? (
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '12px 0' }}>
                        No members assigned to this team yet.
                      </div>
                    ) : (
                      team.members.map((member) => (
                        <div
                          key={member.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            background: 'var(--bg-surface)',
                            borderRadius: 'var(--radius)',
                            border: '1px solid var(--border)',
                          }}
                        >
                          <div>
                            <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                              {member.name} {member.id === user?.id && <span style={{ color: 'var(--accent)', fontSize: '0.75rem' }}>(You)</span>}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              {member.email}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span
                              className="badge"
                              style={{
                                textTransform: 'capitalize',
                                fontSize: '0.7rem',
                                background: member.role === 'lead' ? 'var(--accent-glow)' : 'var(--bg-hover)',
                                color: member.role === 'lead' ? 'var(--accent)' : 'var(--text-secondary)',
                              }}
                            >
                              {member.role}
                            </span>

                            {canManageTeam && member.id !== user?.id && (
                              <button
                                className="btn btn-ghost"
                                style={{ padding: '2px 6px', fontSize: '0.75rem', color: 'var(--critical)' }}
                                onClick={() => handleRemoveMember(team.id, member.id)}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: Add Member */}
      {activeTeamId && (
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
            if (e.target === e.currentTarget) setActiveTeamId(null);
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: 440,
              boxShadow: 'var(--shadow)',
              padding: 24,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 600 }}>Add Member to Team</h2>
              <button
                className="btn btn-ghost"
                style={{ padding: 4, fontSize: '1.2rem', lineHeight: 1 }}
                onClick={() => setActiveTeamId(null)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddMember} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Search User
                </label>
                <input
                  type="text"
                  placeholder="Type name or email to search..."
                  value={userQuery}
                  onChange={(e) => handleSearchUsers(e.target.value)}
                  className="form-control"
                  style={{ width: '100%', padding: '8px 12px' }}
                />

                {/* Search dropdown results */}
                {searchResults.length > 0 && !selectedUser && (
                  <div
                    style={{
                      maxHeight: 180,
                      overflowY: 'auto',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      marginTop: 4,
                    }}
                  >
                    {searchResults.map((u) => (
                      <div
                        key={u.id}
                        style={{
                          padding: '8px 12px',
                          cursor: 'pointer',
                          borderBottom: '1px solid var(--border)',
                          fontSize: '0.85rem',
                        }}
                        onClick={() => {
                          setSelectedUser(u);
                          setUserQuery(`${u.name} (${u.email})`);
                          setSearchResults([]);
                        }}
                      >
                        <div style={{ fontWeight: 500 }}>{u.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{u.email}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedUser && (
                <div style={{ padding: '8px 12px', background: 'var(--accent-glow)', borderRadius: 'var(--radius)', fontSize: '0.85rem' }}>
                  Selected: <strong>{selectedUser.name}</strong> ({selectedUser.email})
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Team Role
                </label>
                <select
                  value={memberRole}
                  onChange={(e) => setMemberRole(e.target.value as TeamRole)}
                  className="form-control"
                  style={{ width: '100%', padding: '8px 12px' }}
                >
                  <option value="member">Member</option>
                  <option value="lead">Lead</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setActiveTeamId(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingMember || !selectedUser}
                  className="btn btn-primary"
                >
                  {addingMember ? 'Adding...' : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
