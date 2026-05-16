import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { PlanBadge } from "@/components/dashboard/plan-badge";
import { Search, Shield, Users, Settings } from "lucide-react";
import type { Profile, PlanType, RoleType } from "@shared/schema";
import { useLocation } from "wouter";

interface AdminUser extends Profile {
  competitorsCount?: number;
}

export default function AdminPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    maxCompetitors: 5,
    monthlyFetchLimit: 1,
    timeRangeMaxDays: 7,
    csvExport: false,
  });

  const { data: profile, isLoading: isProfileLoading } = useQuery<Profile>({
    queryKey: ["/api/profile"],
  });

  const isAdmin = profile?.role === "admin";

  const { data: users = [], isLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
    enabled: isAdmin,
  });

  const updatePlanMutation = useMutation({
    mutationFn: async ({ userId, plan }: { userId: string; plan: PlanType }) => {
      await apiRequest("POST", `/api/admin/users/${userId}/plan`, { plan });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Plan updated", description: "User plan has been updated." });
    },
    onError: (error) => {
      toast({
        title: "Failed to update plan",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const updateLimitsMutation = useMutation({
    mutationFn: async ({
      userId,
      limits,
    }: {
      userId: string;
      limits: Partial<Pick<Profile, "maxCompetitors" | "monthlyFetchLimit" | "timeRangeMaxDays" | "csvExport">>;
    }) => {
      await apiRequest("POST", `/api/admin/users/${userId}/limits`, limits);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setIsEditDialogOpen(false);
      toast({ title: "Limits updated", description: "User limits have been updated." });
    },
    onError: (error) => {
      toast({
        title: "Failed to update limits",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: RoleType }) => {
      await apiRequest("POST", `/api/admin/users/${userId}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Role updated", description: "User role has been updated." });
    },
    onError: (error) => {
      toast({
        title: "Failed to update role",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!isProfileLoading && profile && !isAdmin) {
      setLocation("/dashboard");
    }
  }, [isAdmin, isProfileLoading, profile, setLocation]);

  const filteredUsers = users.filter(
    (user) =>
      user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openEditDialog = (user: AdminUser) => {
    setSelectedUser(user);
    setEditForm({
      maxCompetitors: user.maxCompetitors,
      monthlyFetchLimit: user.monthlyFetchLimit,
      timeRangeMaxDays: user.timeRangeMaxDays,
      csvExport: user.csvExport,
    });
    setIsEditDialogOpen(true);
  };

  if (isProfileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-base">
        <div className="animate-spin w-6 h-6 border-2 border-mint border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!profile || !isAdmin) {
    return null;
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <Shield className="w-5 h-5 text-text-secondary" strokeWidth={1.5} />
          <h1 className="font-tight font-bold text-[36px] tracking-tightest text-text-primary leading-none">Admin Panel</h1>
        </div>
        <p className="font-mono text-[12px] text-text-muted">Manage users, plans, and limits</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-bg-surface border border-border-subtle rounded-lg p-5">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-mint-dim border border-mint/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-mint" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-mono text-[28px] font-medium text-text-primary leading-none mb-0.5">{users.length}</p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">// Total Users</p>
            </div>
          </div>
        </div>
        <div className="bg-bg-surface border border-border-subtle rounded-lg p-5">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-bg-elevated border border-border-subtle flex items-center justify-center">
              <Users className="w-5 h-5 text-text-secondary" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-mono text-[28px] font-medium text-text-primary leading-none mb-0.5">
                {users.filter((u) => u.plan === "plus").length}
              </p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">// Plus Users</p>
            </div>
          </div>
        </div>
        <div className="bg-bg-surface border border-border-subtle rounded-lg p-5">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-mint-dim border border-mint/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-mint" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-mono text-[28px] font-medium text-text-primary leading-none mb-0.5">
                {users.filter((u) => u.plan === "pro").length}
              </p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">// Pro Users</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-bg-surface border border-border-subtle rounded-lg p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <h3 className="font-tight font-semibold text-[16px] text-text-primary">User Management</h3>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
            <input
              type="text"
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 h-8 bg-bg-base border border-border-subtle rounded-md font-mono text-[12px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-mint focus:shadow-[0_0_0_3px_rgba(124,255,178,0.1)] transition-all"
              data-testid="input-search-users"
            />
          </div>
        </div>

        <div className="rounded-lg border border-border-subtle overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-bg-elevated border-border-subtle hover:bg-bg-elevated">
                <TableHead className="font-mono text-[10px] uppercase tracking-wider text-text-muted">User</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Plan</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Role</TableHead>
                <TableHead className="text-center font-mono text-[10px] uppercase tracking-wider text-text-muted">Competitors</TableHead>
                <TableHead className="text-center font-mono text-[10px] uppercase tracking-wider text-text-muted">Fetches Used</TableHead>
                <TableHead className="text-center font-mono text-[10px] uppercase tracking-wider text-text-muted">CSV Export</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow className="border-border-subtle">
                  <TableCell colSpan={7} className="text-center py-8 font-mono text-[12px] text-text-muted">
                    Loading users...
                  </TableCell>
                </TableRow>
              ) : filteredUsers.length === 0 ? (
                <TableRow className="border-border-subtle">
                  <TableCell colSpan={7} className="text-center py-8 font-mono text-[12px] text-text-muted">
                    No users found
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user) => (
                  <TableRow key={user.id} className="border-border-subtle hover:bg-bg-elevated" data-testid={`user-row-${user.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-md bg-gradient-to-br from-border-soft to-border-subtle border border-border-subtle flex items-center justify-center">
                          <span className="font-mono text-[12px] font-semibold text-text-primary">
                            {user.email?.charAt(0).toUpperCase() || "U"}
                          </span>
                        </div>
                        <div>
                          <p className="font-mono text-[13px] text-text-primary">{user.email || "No email"}</p>
                          <p className="font-mono text-[10px] text-text-muted">{user.id.slice(0, 8)}...</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={user.plan}
                        onValueChange={(plan: PlanType) =>
                          updatePlanMutation.mutate({ userId: user.id, plan })
                        }
                      >
                        <SelectTrigger className="w-24 h-7 bg-bg-base border-border-subtle font-mono text-[11px]" data-testid={`select-plan-${user.id}`}>
                          <SelectValue>
                            <PlanBadge plan={user.plan} />
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="bg-bg-elevated border-border-subtle">
                          <SelectItem value="free" className="font-mono text-[12px]">Free</SelectItem>
                          <SelectItem value="plus" className="font-mono text-[12px]">Plus</SelectItem>
                          <SelectItem value="pro" className="font-mono text-[12px]">Pro</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={user.role}
                        onValueChange={(role: RoleType) =>
                          updateRoleMutation.mutate({ userId: user.id, role })
                        }
                      >
                        <SelectTrigger className="w-24 h-7 bg-bg-base border-border-subtle font-mono text-[11px]">
                          <SelectValue>
                            <span className={`font-mono text-[11px] px-1.5 py-0.5 rounded border ${user.role === "admin" ? "text-mint border-mint/30 bg-mint-dim" : "text-text-muted border-border-subtle bg-bg-elevated"}`}>
                              {user.role}
                            </span>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="bg-bg-elevated border-border-subtle">
                          <SelectItem value="user" className="font-mono text-[12px]">User</SelectItem>
                          <SelectItem value="admin" className="font-mono text-[12px]">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-center font-mono text-[13px] text-text-primary">
                      {user.competitorsCount || 0}/{user.maxCompetitors}
                    </TableCell>
                    <TableCell className="text-center font-mono text-[13px] text-text-primary">
                      {user.fetchesUsed}/{user.monthlyFetchLimit}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`font-mono text-[11px] px-2 py-0.5 rounded border ${user.csvExport ? "text-mint border-mint/30 bg-mint-dim" : "text-text-muted border-border-subtle"}`}>
                        {user.csvExport ? "Yes" : "No"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <button
                        className="w-8 h-8 flex items-center justify-center rounded-md text-text-muted hover:text-mint hover:bg-mint-dim transition-colors"
                        onClick={() => openEditDialog(user)}
                        data-testid={`button-edit-${user.id}`}
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="bg-bg-surface border-border-subtle">
          <DialogHeader>
            <DialogTitle className="font-tight font-semibold text-[18px] text-text-primary">Edit User Limits</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-bg-elevated border border-border-subtle">
                <div className="w-10 h-10 rounded-md bg-gradient-to-br from-border-soft to-border-subtle border border-border-subtle flex items-center justify-center">
                  <span className="font-mono text-[14px] font-semibold text-text-primary">
                    {selectedUser.email?.charAt(0).toUpperCase() || "U"}
                  </span>
                </div>
                <div>
                  <p className="font-mono text-[13px] text-text-primary">{selectedUser.email}</p>
                  <PlanBadge plan={selectedUser.plan} />
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="font-mono text-[10px] uppercase tracking-wider text-text-muted">// Max Competitors</Label>
                  <Input
                    type="number"
                    value={editForm.maxCompetitors}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, maxCompetitors: parseInt(e.target.value) || 0 }))
                    }
                    className="bg-bg-base border-border-subtle font-mono text-[13px] focus:border-mint focus:shadow-[0_0_0_3px_rgba(124,255,178,0.1)]"
                    data-testid="input-max-competitors"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="font-mono text-[10px] uppercase tracking-wider text-text-muted">// Monthly Fetch Limit</Label>
                  <Input
                    type="number"
                    value={editForm.monthlyFetchLimit}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, monthlyFetchLimit: parseInt(e.target.value) || 0 }))
                    }
                    className="bg-bg-base border-border-subtle font-mono text-[13px] focus:border-mint focus:shadow-[0_0_0_3px_rgba(124,255,178,0.1)]"
                    data-testid="input-fetch-limit"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="font-mono text-[10px] uppercase tracking-wider text-text-muted">// Time Range Max Days</Label>
                  <Select
                    value={String(editForm.timeRangeMaxDays)}
                    onValueChange={(v) =>
                      setEditForm((f) => ({ ...f, timeRangeMaxDays: parseInt(v) }))
                    }
                  >
                    <SelectTrigger className="bg-bg-base border-border-subtle font-mono text-[13px]" data-testid="select-time-range">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-bg-elevated border-border-subtle">
                      <SelectItem value="7" className="font-mono text-[12px]">7 days</SelectItem>
                      <SelectItem value="14" className="font-mono text-[12px]">14 days</SelectItem>
                      <SelectItem value="28" className="font-mono text-[12px]">28 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between py-1">
                  <Label className="font-mono text-[10px] uppercase tracking-wider text-text-muted">// CSV Export</Label>
                  <Switch
                    checked={editForm.csvExport}
                    onCheckedChange={(checked) =>
                      setEditForm((f) => ({ ...f, csvExport: checked }))
                    }
                    data-testid="switch-csv-export"
                  />
                </div>
              </div>

              <button
                className="w-full flex items-center justify-center px-4 py-2.5 bg-mint hover:bg-mint-hover text-bg-base rounded-md font-mono text-[13px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() =>
                  updateLimitsMutation.mutate({
                    userId: selectedUser.id,
                    limits: editForm,
                  })
                }
                disabled={updateLimitsMutation.isPending}
                data-testid="button-save-limits"
              >
                {updateLimitsMutation.isPending ? "Saving..." : "Save Changes"}
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
