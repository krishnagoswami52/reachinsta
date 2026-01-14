import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { PlanBadge } from "@/components/dashboard/plan-badge";
import { Search, Shield, Users, MoreVertical, Settings } from "lucide-react";
import type { Profile, PlanType, RoleType } from "@shared/schema";

interface AdminUser extends Profile {
  competitorsCount?: number;
}

export default function AdminPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const { data: users = [], isLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
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

  const filteredUsers = users.filter(
    (user) =>
      user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const [editForm, setEditForm] = useState({
    maxCompetitors: 5,
    monthlyFetchLimit: 1,
    timeRangeMaxDays: 7,
    csvExport: false,
  });

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Shield className="w-6 h-6" />
            Admin Panel
          </h1>
          <p className="text-muted-foreground">Manage users, plans, and limits</p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-primary/10">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{users.length}</p>
                <p className="text-sm text-muted-foreground">Total Users</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-blue-500/10">
                <Users className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {users.filter((u) => u.plan === "plus").length}
                </p>
                <p className="text-sm text-muted-foreground">Plus Users</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-primary/10">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {users.filter((u) => u.plan === "pro").length}
                </p>
                <p className="text-sm text-muted-foreground">Pro Users</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle>User Management</CardTitle>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-users"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>User</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-center">Competitors</TableHead>
                  <TableHead className="text-center">Fetches Used</TableHead>
                  <TableHead className="text-center">CSV Export</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Loading users...
                    </TableCell>
                  </TableRow>
                ) : filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No users found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow key={user.id} className="hover-elevate" data-testid={`user-row-${user.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="w-8 h-8">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                              {user.email?.charAt(0).toUpperCase() || "U"}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-sm">{user.email || "No email"}</p>
                            <p className="text-xs text-muted-foreground font-mono">{user.id.slice(0, 8)}...</p>
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
                          <SelectTrigger className="w-24" data-testid={`select-plan-${user.id}`}>
                            <SelectValue>
                              <PlanBadge plan={user.plan} />
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="free">Free</SelectItem>
                            <SelectItem value="plus">Plus</SelectItem>
                            <SelectItem value="pro">Pro</SelectItem>
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
                          <SelectTrigger className="w-24">
                            <SelectValue>
                              <Badge variant={user.role === "admin" ? "default" : "outline"}>
                                {user.role}
                              </Badge>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">User</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-center font-mono">
                        {user.competitorsCount || 0}/{user.maxCompetitors}
                      </TableCell>
                      <TableCell className="text-center font-mono">
                        {user.fetchesUsed}/{user.monthlyFetchLimit}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={user.csvExport ? "default" : "outline"}>
                          {user.csvExport ? "Yes" : "No"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(user)}
                          data-testid={`button-edit-${user.id}`}
                        >
                          <Settings className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User Limits</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Avatar className="w-10 h-10">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {selectedUser.email?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{selectedUser.email}</p>
                  <PlanBadge plan={selectedUser.plan} />
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Max Competitors</Label>
                  <Input
                    type="number"
                    value={editForm.maxCompetitors}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, maxCompetitors: parseInt(e.target.value) || 0 }))
                    }
                    data-testid="input-max-competitors"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Monthly Fetch Limit</Label>
                  <Input
                    type="number"
                    value={editForm.monthlyFetchLimit}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, monthlyFetchLimit: parseInt(e.target.value) || 0 }))
                    }
                    data-testid="input-fetch-limit"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Time Range Max Days</Label>
                  <Select
                    value={String(editForm.timeRangeMaxDays)}
                    onValueChange={(v) =>
                      setEditForm((f) => ({ ...f, timeRangeMaxDays: parseInt(v) }))
                    }
                  >
                    <SelectTrigger data-testid="select-time-range">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="14">14 days</SelectItem>
                      <SelectItem value="28">28 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <Label>CSV Export</Label>
                  <Switch
                    checked={editForm.csvExport}
                    onCheckedChange={(checked) =>
                      setEditForm((f) => ({ ...f, csvExport: checked }))
                    }
                    data-testid="switch-csv-export"
                  />
                </div>
              </div>

              <Button
                className="w-full"
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
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
