import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ArrowLeft, Shield, Trash2, Loader2, ShieldAlert, ShieldCheck, ShieldMinus, Key, Plus, Eye, EyeOff, ToggleLeft, ToggleRight, ChevronDown, ChevronUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { ThemeToggle } from '@/components/ThemeToggle';

interface UserProfile {
  user_id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  roles: string[];
}

interface SignupPassword {
  id: string;
  password_text: string;
  max_uses: number;
  use_count: number;
  is_active: boolean;
  created_by: string;
  created_at: string;
}

interface PasswordUsage {
  id: string;
  password_id: string;
  user_email: string;
  used_at: string;
}

export default function Admin() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserProfile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [promotingId, setPromotingId] = useState<string | null>(null);

  // Signup passwords
  const [passwords, setPasswords] = useState<SignupPassword[]>([]);
  const [loadingPasswords, setLoadingPasswords] = useState(false);
  const [newPasswordText, setNewPasswordText] = useState('');
  const [newMaxUses, setNewMaxUses] = useState('5');
  const [creatingPassword, setCreatingPassword] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [usageLog, setUsageLog] = useState<Record<string, PasswordUsage[]>>({});
  const [expandedPassword, setExpandedPassword] = useState<string | null>(null);
  const [loadingUsage, setLoadingUsage] = useState<string | null>(null);

  // Active tab
  const [activeSection, setActiveSection] = useState<'users' | 'passwords'>('users');

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setIsAdmin(false);
      return;
    }
    const checkAdmin = async () => {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();
      setIsAdmin(!!data);
    };
    checkAdmin();
  }, [user, authLoading]);

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
      fetchPasswords();
    }
  }, [isAdmin]);

  const adminFetch = async (body: any) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify(body),
      }
    );
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Request failed');
    return result;
  };

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const result = await adminFetch({});
      setUsers(result.users || []);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchPasswords = async () => {
    setLoadingPasswords(true);
    try {
      const result = await adminFetch({ action: 'list_passwords' });
      setPasswords(result.passwords || []);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoadingPasswords(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await adminFetch({ action: 'delete', user_id: deleteTarget.user_id });
      toast({ title: 'User deleted', description: `${deleteTarget.email} has been removed.` });
      setUsers(prev => prev.filter(u => u.user_id !== deleteTarget.user_id));
      setDeleteTarget(null);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleAdmin = async (targetUser: UserProfile) => {
    const isTargetAdmin = targetUser.roles.includes('admin');
    setPromotingId(targetUser.user_id);
    try {
      await adminFetch({
        action: isTargetAdmin ? 'demote_admin' : 'promote_admin',
        user_id: targetUser.user_id,
      });
      toast({
        title: isTargetAdmin ? 'Admin removed' : 'Admin granted',
        description: `${targetUser.email} has been ${isTargetAdmin ? 'demoted' : 'promoted'}.`,
      });
      fetchUsers();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setPromotingId(null);
    }
  };

  const handleCreatePassword = async () => {
    if (!newPasswordText.trim()) return;
    setCreatingPassword(true);
    try {
      await adminFetch({
        action: 'create_password',
        password_text: newPasswordText.trim(),
        max_uses: parseInt(newMaxUses) || 5,
      });
      toast({ title: 'Password created', description: 'New signup password has been created.' });
      setNewPasswordText('');
      setNewMaxUses('5');
      fetchPasswords();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setCreatingPassword(false);
    }
  };

  const handleTogglePassword = async (pwd: SignupPassword) => {
    try {
      await adminFetch({ action: 'toggle_password', password_id: pwd.id, is_active: !pwd.is_active });
      setPasswords(prev => prev.map(p => p.id === pwd.id ? { ...p, is_active: !p.is_active } : p));
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleDeletePassword = async (pwd: SignupPassword) => {
    try {
      await adminFetch({ action: 'delete_password', password_id: pwd.id });
      setPasswords(prev => prev.filter(p => p.id !== pwd.id));
      toast({ title: 'Deleted', description: 'Signup password deleted.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleViewUsage = async (passwordId: string) => {
    if (expandedPassword === passwordId) {
      setExpandedPassword(null);
      return;
    }
    setExpandedPassword(passwordId);
    if (usageLog[passwordId]) return;

    setLoadingUsage(passwordId);
    try {
      const result = await adminFetch({ action: 'password_usage_log', password_id: passwordId });
      setUsageLog(prev => ({ ...prev, [passwordId]: result.usage || [] }));
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoadingUsage(null);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <ShieldAlert className="h-16 w-16 text-destructive" />
        <h1 className="text-2xl font-bold text-foreground">Access Denied</h1>
        <p className="text-muted-foreground">You do not have admin privileges.</p>
        <Button variant="outline" onClick={() => navigate('/')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Go Home
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-50 glass-nav border-b border-border/50">
        <div className="container mx-auto flex items-center justify-between h-16 px-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <span className="font-heading text-lg font-bold text-foreground">Admin Panel</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Section tabs */}
        <div className="flex rounded-xl bg-muted/50 p-1 mb-8 max-w-md">
          <button
            onClick={() => setActiveSection('users')}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
              activeSection === 'users'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Shield className="h-4 w-4" /> Users & Roles
          </button>
          <button
            onClick={() => setActiveSection('passwords')}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
              activeSection === 'passwords'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Key className="h-4 w-4" /> Signup Passwords
          </button>
        </div>

        {/* ── USERS SECTION ── */}
        {activeSection === 'users' && (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-foreground">User Management</h1>
                <p className="text-muted-foreground text-sm mt-1">{users.length} registered users</p>
              </div>
              <Button variant="outline" onClick={fetchUsers} disabled={loadingUsers}>
                {loadingUsers ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Refresh
              </Button>
            </div>

            <div className="rounded-xl border border-border/50 glass-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Signed Up</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingUsers ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ) : users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                        No users found
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((u) => (
                      <TableRow key={u.user_id}>
                        <TableCell className="font-medium">{u.email || '—'}</TableCell>
                        <TableCell>{u.full_name || '—'}</TableCell>
                        <TableCell>
                          {u.roles.includes('admin') ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                              <ShieldCheck className="h-3 w-3" /> Admin
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">User</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(u.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {u.user_id === user?.id ? (
                            <span className="text-xs text-muted-foreground">You</span>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className={u.roles.includes('admin')
                                  ? 'text-amber-500 hover:text-amber-600 hover:bg-amber-500/10'
                                  : 'text-primary hover:text-primary hover:bg-primary/10'}
                                onClick={() => handleToggleAdmin(u)}
                                disabled={promotingId === u.user_id}
                                title={u.roles.includes('admin') ? 'Remove admin' : 'Make admin'}
                              >
                                {promotingId === u.user_id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : u.roles.includes('admin') ? (
                                  <ShieldMinus className="h-4 w-4" />
                                ) : (
                                  <ShieldCheck className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => setDeleteTarget(u)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        {/* ── SIGNUP PASSWORDS SECTION ── */}
        {activeSection === 'passwords' && (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-foreground">Signup Passwords</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Create passwords that new users must enter to sign up.
              </p>
            </div>

            {/* Create new password */}
            <div className="rounded-xl border border-border/50 glass-card p-5 mb-6">
              <h3 className="text-sm font-semibold text-foreground mb-3">Create New Password</h3>
              <div className="flex flex-col sm:flex-row gap-3">
                <Input
                  placeholder="Enter any password text..."
                  value={newPasswordText}
                  onChange={(e) => setNewPasswordText(e.target.value)}
                  className="flex-1"
                />
                <Input
                  type="number"
                  placeholder="Max uses"
                  value={newMaxUses}
                  onChange={(e) => setNewMaxUses(e.target.value)}
                  className="w-28"
                  min={1}
                />
                <Button
                  onClick={handleCreatePassword}
                  disabled={creatingPassword || !newPasswordText.trim()}
                  variant="glow"
                >
                  {creatingPassword ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                  Create
                </Button>
              </div>
            </div>

            {/* Password list */}
            <div className="space-y-3">
              {loadingPasswords ? (
                <div className="text-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </div>
              ) : passwords.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground rounded-xl border border-border/50 glass-card">
                  No signup passwords created yet
                </div>
              ) : (
                passwords.map((pwd) => (
                  <div key={pwd.id} className="rounded-xl border border-border/50 glass-card overflow-hidden">
                    <div className="p-4 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <code className="text-sm font-mono text-foreground bg-muted/50 px-2 py-0.5 rounded">
                            {showPasswords[pwd.id] ? pwd.password_text : '•'.repeat(Math.min(pwd.password_text.length, 12))}
                          </code>
                          <button
                            onClick={() => setShowPasswords(prev => ({ ...prev, [pwd.id]: !prev[pwd.id] }))}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            {showPasswords[pwd.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                          {!pwd.is_active && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">Disabled</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Used {pwd.use_count}/{pwd.max_uses} times • Created {new Date(pwd.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewUsage(pwd.id)}
                          className="text-muted-foreground hover:text-foreground"
                          title="View usage log"
                        >
                          {expandedPassword === pwd.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleTogglePassword(pwd)}
                          className={pwd.is_active ? 'text-primary hover:text-primary' : 'text-muted-foreground hover:text-foreground'}
                          title={pwd.is_active ? 'Disable' : 'Enable'}
                        >
                          {pwd.is_active ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeletePassword(pwd)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Usage log */}
                    {expandedPassword === pwd.id && (
                      <div className="border-t border-border/50 bg-muted/20 p-4">
                        {loadingUsage === pwd.id ? (
                          <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                        ) : (usageLog[pwd.id] || []).length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center">No usage yet</p>
                        ) : (
                          <div className="space-y-1.5">
                            <p className="text-xs font-semibold text-foreground mb-2">Usage Log</p>
                            {(usageLog[pwd.id] || []).map((u) => (
                              <div key={u.id} className="flex items-center justify-between text-xs">
                                <span className="text-foreground">{u.user_email}</span>
                                <span className="text-muted-foreground">{new Date(u.used_at).toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{deleteTarget?.email}</strong> and all their data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
