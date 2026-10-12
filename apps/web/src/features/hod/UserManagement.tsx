import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserPlus, 
  Search, 
  UserCheck, 
  UserX,
  AlertCircle,
  X
} from 'lucide-react';
import { StatusBadge } from '../../components/StatusBadge';
import { hodApi } from '../../services/apiClient';
import { AppRole, InviteUserRequest } from '@smartfa/contracts';

export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Form State
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formUsn, setFormUsn] = useState('');
  const [formRole, setFormRole] = useState<AppRole>('student');
  const [formError, setFormError] = useState<string | null>(null);

  const fetchUsers = async () => {
    const data = await hodApi.getUsers();
    setUsers(data);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formName.trim() || !formEmail.trim()) {
      setFormError('Full name and email are mandatory.');
      return;
    }

    try {
      const payload: InviteUserRequest = {
        full_name: formName.trim(),
        email: formEmail.trim(),
        usn: formUsn.trim() ? formUsn.trim() : null,
        role: formRole
      };

      await hodApi.inviteUser(payload);
      setActionMessage(`Successfully invited ${payload.full_name} with role ${payload.role}.`);
      setShowInviteModal(false);
      setFormName('');
      setFormEmail('');
      setFormUsn('');
      fetchUsers();
    } catch (err: any) {
      setFormError(err.message || 'Failed to invite user.');
    }
  };

  const handleToggleStatus = async (user: any) => {
    // Invariant: HOD cannot deactivate self
    if (user.roles?.includes('hod')) {
      alert('Security Policy: Department HOD cannot deactivate own account.');
      return;
    }

    const nextStatus = user.status === 'active' ? 'inactive' : 'active';
    await hodApi.updateUserStatus(user.id, nextStatus);
    setActionMessage(`Updated account status for ${user.full_name} to ${nextStatus}.`);
    fetchUsers();
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = 
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.usn && u.usn.toLowerCase().includes(search.toLowerCase()));
    
    const matchesRole = roleFilter === 'all' || u.roles?.includes(roleFilter);
    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-academic-border">
        <div>
          <h2 className="text-xl font-bold text-academic-deepGreen flex items-center">
            <Users className="w-5 h-5 mr-2 text-academic-primaryGreen" />
            Institutional User Directory & Role Assignment
          </h2>
          <p className="text-xs text-academic-muted mt-1">
            Authoritative directory of institutional students, subject teachers, class teachers, and proctors.
          </p>
        </div>

        <button
          onClick={() => setShowInviteModal(true)}
          className="btn-primary flex items-center space-x-2 text-xs"
        >
          <UserPlus className="w-4 h-4" />
          <span>Invite / Add User</span>
        </button>
      </div>

      {actionMessage && (
        <div className="p-3 bg-academic-lightGreen border border-academic-primaryGreen/40 rounded-md text-xs text-academic-deepGreen flex items-center justify-between">
          <span>✓ {actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="text-academic-muted hover:text-academic-deepGreen">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="card-surface p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-academic-muted absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search by name, email, or USN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-academic-bg border border-academic-border rounded-md text-academic-deepGreen focus:outline-none focus:ring-2 focus:ring-academic-primaryGreen"
          />
        </div>

        <div className="flex items-center space-x-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 text-xs">
          <span className="text-academic-muted font-medium mr-1">Filter Role:</span>
          {['all', 'student', 'subject_teacher', 'class_teacher', 'proctor', 'hod'].map((role) => (
            <button
              key={role}
              onClick={() => setRoleFilter(role)}
              className={`px-3 py-1.5 rounded-md border font-medium capitalize transition-colors min-h-[36px] ${
                roleFilter === role
                  ? 'bg-academic-primaryGreen text-white border-transparent'
                  : 'bg-academic-surface text-academic-deepGreen border-academic-border hover:bg-academic-paleGreen'
              }`}
            >
              {role.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Users Table */}
      <div className="card-surface overflow-x-auto p-0">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-academic-paleGreen/70 border-b border-academic-border text-academic-deepGreen font-semibold">
              <th className="py-3 px-4">User Details</th>
              <th className="py-3 px-4">Institutional USN</th>
              <th className="py-3 px-4">Assigned Active Roles</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-academic-border/60">
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-academic-muted">
                  No users found matching the selected criteria.
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-academic-paleGreen/30 transition-colors">
                  <td className="py-3.5 px-4">
                    <p className="font-semibold text-academic-deepGreen">{user.full_name}</p>
                    <p className="text-[11px] text-academic-muted">{user.email}</p>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[11px] text-academic-deepGreen">
                    {user.usn || <span className="text-academic-muted italic">Staff / N/A</span>}
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex flex-wrap gap-1.5">
                      {user.roles?.map((r: string) => (
                        <span 
                          key={r} 
                          className="px-2 py-0.5 rounded text-[11px] font-medium bg-academic-lightGreen border border-academic-primaryGreen/30 text-academic-deepGreen uppercase tracking-wider"
                        >
                          {r.replace('_', ' ')}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <StatusBadge 
                      label={user.status === 'active' ? 'Active' : 'Inactive'} 
                      variant={user.status === 'active' ? 'completed' : 'warning'} 
                    />
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={() => handleToggleStatus(user)}
                      disabled={user.roles?.includes('hod')}
                      className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded text-xs border font-medium transition-colors ${
                        user.status === 'active'
                          ? 'border-red-300 text-red-700 hover:bg-red-50'
                          : 'border-academic-primaryGreen text-academic-primaryGreen hover:bg-academic-lightGreen'
                      } disabled:opacity-40 disabled:cursor-not-allowed`}
                      title={user.roles?.includes('hod') ? 'HOD account cannot be deactivated' : ''}
                    >
                      {user.status === 'active' ? (
                        <>
                          <UserX className="w-3.5 h-3.5 mr-1" />
                          <span>Deactivate</span>
                        </>
                      ) : (
                        <>
                          <UserCheck className="w-3.5 h-3.5 mr-1" />
                          <span>Activate</span>
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Invite User Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-academic-deepGreen/30 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="card-surface max-w-md w-full shadow-lg border border-academic-border animate-in fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-academic-border mb-4">
              <h3 className="text-base font-bold text-academic-deepGreen flex items-center">
                <UserPlus className="w-4 h-4 mr-2 text-academic-primaryGreen" />
                Invite Institutional User
              </h3>
              <button 
                onClick={() => setShowInviteModal(false)}
                className="p-1 rounded hover:bg-academic-paleGreen text-academic-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleInvite} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-academic-deepGreen mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Prof. Rajesh Kumar"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 bg-academic-bg border border-academic-border rounded text-academic-deepGreen focus:outline-none focus:ring-2 focus:ring-academic-primaryGreen"
                />
              </div>

              <div>
                <label className="block font-medium text-academic-deepGreen mb-1">Institutional Email *</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. rajesh@smartfa.edu"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-academic-bg border border-academic-border rounded text-academic-deepGreen focus:outline-none focus:ring-2 focus:ring-academic-primaryGreen"
                />
              </div>

              <div>
                <label className="block font-medium text-academic-deepGreen mb-1">USN (Mandatory for students)</label>
                <input
                  type="text"
                  placeholder="e.g. 1RV24MC045"
                  value={formUsn}
                  onChange={(e) => setFormUsn(e.target.value)}
                  className="w-full px-3 py-2 bg-academic-bg border border-academic-border rounded text-academic-deepGreen focus:outline-none focus:ring-2 focus:ring-academic-primaryGreen"
                />
              </div>

              <div>
                <label className="block font-medium text-academic-deepGreen mb-1">Initial Scoped Role *</label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as AppRole)}
                  className="w-full px-3 py-2 bg-academic-bg border border-academic-border rounded text-academic-deepGreen focus:outline-none focus:ring-2 focus:ring-academic-primaryGreen cursor-pointer"
                >
                  <option value="student">Student</option>
                  <option value="subject_teacher">Subject Teacher</option>
                  <option value="class_teacher">Class Teacher</option>
                  <option value="proctor">Proctor</option>
                </select>
                <p className="text-[10px] text-academic-muted mt-1">
                  * Note: Roles are assigned directly in PostgreSQL records and cannot be self-escalated.
                </p>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-academic-border">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary text-xs"
                >
                  Confirm & Send Invitation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
