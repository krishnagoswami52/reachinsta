import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { PlanBadge } from "@/components/dashboard/plan-badge";
import { Camera, Check, Loader2, User, CreditCard, BarChart3 } from "lucide-react";
import type { Profile, Competitor } from "@shared/schema";

export default function ProfilePage() {
  useEffect(() => { document.title = "My Profile - ReachInsta"; }, []);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: profile } = useQuery<Profile>({
    queryKey: ["/api/profile"],
  });

  const { data: competitors = [] } = useQuery<Competitor[]>({
    queryKey: ["/api/competitors"],
  });

  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // Keep fields in sync if user loads after mount
  const [initialized, setInitialized] = useState(false);
  if (user && !initialized) {
    setFirstName(user.firstName ?? "");
    setLastName(user.lastName ?? "");
    setInitialized(true);
  }

  const updateMutation = useMutation({
    mutationFn: async (data: { firstName?: string | null; lastName?: string | null; profileImageUrl?: string | null }) => {
      const res = await apiRequest("PATCH", "/api/auth/user", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setAvatarPreview(null);
      toast({ title: "Profile updated", description: "Your changes have been saved." });
    },
    onError: () => {
      toast({ title: "Update failed", description: "Could not save your changes.", variant: "destructive" });
    },
  });

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Please choose an image under 5 MB.", variant: "destructive" });
      return;
    }
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const MAX = 256;
      const scale = Math.min(MAX / img.width, MAX / img.height, 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      setAvatarPreview(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.src = objectUrl;
  }

  function handleSaveProfile() {
    const data: { firstName?: string | null; lastName?: string | null; profileImageUrl?: string | null } = {
      firstName: firstName.trim() || null,
      lastName: lastName.trim() || null,
    };
    if (avatarPreview !== null) {
      data.profileImageUrl = avatarPreview;
    }
    updateMutation.mutate(data);
  }

  function handleRemoveAvatar() {
    setAvatarPreview(null);
    updateMutation.mutate({ profileImageUrl: null });
  }

  const displayAvatar = avatarPreview ?? user?.profileImageUrl ?? undefined;
  const initials = (user?.firstName?.charAt(0) ?? user?.email?.charAt(0) ?? "U").toUpperCase();

  const planDetails = {
    free: { label: "Free", competitors: 5, fetches: 1, timeRange: "7 days", csvExport: false },
    plus: { label: "Plus", competitors: 50, fetches: 2, timeRange: "28 days", csvExport: false },
    pro: { label: "Pro", competitors: 100, fetches: 4, timeRange: "28 days", csvExport: true },
  };
  const currentPlan = profile?.plan ?? "free";
  const planInfo = planDetails[currentPlan];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Profile</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your account settings and preferences.</p>
      </div>

      {/* Avatar & Name */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="w-4 h-4" />
            Personal Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Avatar */}
          <div className="flex items-center gap-5">
            <div className="relative group">
              <Avatar className="w-20 h-20 border-2 border-border">
                <AvatarImage src={displayAvatar} />
                <AvatarFallback className="bg-primary/10 text-primary text-xl font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <button
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                <Camera className="w-5 h-5 text-white" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Profile photo</p>
              <p className="text-xs text-muted-foreground">JPG, PNG or GIF · Max 5 MB · Auto-resized to 256×256</p>
              <div className="flex gap-2 mt-2">
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  Upload photo
                </Button>
                {(displayAvatar) && (
                  <Button variant="ghost" size="sm" onClick={handleRemoveAvatar} disabled={updateMutation.isPending}>
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Name fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">First name</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
              />
            </div>
          </div>

          {/* Email (read-only) */}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={user?.email ?? ""} readOnly className="bg-muted cursor-not-allowed" />
            <p className="text-xs text-muted-foreground">Email cannot be changed here.</p>
          </div>

          <Button onClick={handleSaveProfile} disabled={updateMutation.isPending} className="w-full sm:w-auto">
            {updateMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
            ) : (
              <><Check className="w-4 h-4 mr-2" />Save changes</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Plan & Usage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="w-4 h-4" />
            Plan &amp; Billing
          </CardTitle>
          <CardDescription>Your current plan and usage limits.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Current plan</span>
            {profile && <PlanBadge plan={profile.plan} />}
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <BarChart3 className="w-4 h-4" />
              <span className="font-medium text-foreground">Plan limits</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-muted/50 rounded-lg p-3 space-y-0.5">
                <p className="text-muted-foreground text-xs">Competitors</p>
                <p className="font-semibold">{planInfo.competitors}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 space-y-0.5">
                <p className="text-muted-foreground text-xs">Monthly fetches</p>
                <p className="font-semibold">{planInfo.fetches}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 space-y-0.5">
                <p className="text-muted-foreground text-xs">Max time range</p>
                <p className="font-semibold">{planInfo.timeRange}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 space-y-0.5">
                <p className="text-muted-foreground text-xs">CSV export</p>
                <p className="font-semibold">{planInfo.csvExport ? "Yes" : "No"}</p>
              </div>
            </div>
          </div>

          {profile && (
            <>
              <Separator />
              <div className="space-y-2 text-sm">
                <p className="font-medium">Usage this month</p>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fetches used</span>
                  <span className="font-medium">{profile.fetchesUsed} / {profile.monthlyFetchLimit}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Competitors added</span>
                  <span className="font-medium">{competitors.length} / {profile.maxCompetitors}</span>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
