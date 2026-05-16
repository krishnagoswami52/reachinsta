import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { parseInstagramUsername, validateInstagramUsernames } from "@/lib/utils";
import { Plus, Trash2, Upload, Users, ExternalLink } from "lucide-react";
import type { Competitor } from "@shared/schema";

interface CompetitorListProps {
  competitors: Competitor[];
  maxCompetitors: number;
  onAdd: (usernames: string[]) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onClearAll?: () => Promise<void>;
  isLoading?: boolean;
}

export function CompetitorList({
  competitors,
  maxCompetitors,
  onAdd,
  onRemove,
  onClearAll,
  isLoading,
}: CompetitorListProps) {
  const { toast } = useToast();
  const [newUsername, setNewUsername] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const remainingSlots = maxCompetitors - competitors.length;

  const handleClearAll = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!onClearAll) return;
    setIsClearing(true);
    try {
      await onClearAll();
      toast({ title: "All competitors cleared", description: "Your competitor list is now empty" });
      setIsClearDialogOpen(false);
    } catch (error) {
      toast({ title: "Failed to clear competitors", description: error instanceof Error ? error.message : "Unknown error", variant: "destructive" });
    } finally {
      setIsClearing(false);
    }
  };

  const handleAddSingle = async () => {
    const username = parseInstagramUsername(newUsername);
    if (!username) {
      toast({ title: "Invalid username", description: "Please enter a valid Instagram username", variant: "destructive" });
      return;
    }
    if (competitors.some((c) => c.username.toLowerCase() === username.toLowerCase())) {
      toast({ title: "Duplicate username", description: "This competitor is already in your list", variant: "destructive" });
      return;
    }
    if (remainingSlots <= 0) {
      toast({ title: "Limit reached", description: "Upgrade your plan to add more competitors", variant: "destructive" });
      return;
    }
    setIsAdding(true);
    try {
      await onAdd([username]);
      setNewUsername("");
      toast({ title: "Competitor added", description: `@${username} has been added to your list` });
    } catch (error) {
      toast({ title: "Failed to add competitor", description: error instanceof Error ? error.message : "Unknown error", variant: "destructive" });
    } finally {
      setIsAdding(false);
    }
  };

  const handleBulkAdd = async () => {
    const { valid, invalid } = validateInstagramUsernames(bulkText);
    const existingUsernames = new Set(competitors.map((c) => c.username.toLowerCase()));
    const newUsernames = valid.filter((u) => !existingUsernames.has(u.toLowerCase()));
    const toAdd = newUsernames.slice(0, remainingSlots);
    if (toAdd.length === 0) {
      toast({ title: "No new usernames", description: "All usernames are duplicates or invalid", variant: "destructive" });
      return;
    }
    setIsAdding(true);
    try {
      await onAdd(toAdd);
      setBulkText("");
      setIsDialogOpen(false);
      toast({
        title: "Competitors added",
        description: `${toAdd.length} competitors added${invalid.length > 0 ? `, ${invalid.length} invalid entries skipped` : ""}`,
      });
    } catch (error) {
      toast({ title: "Failed to add competitors", description: error instanceof Error ? error.message : "Unknown error", variant: "destructive" });
    } finally {
      setIsAdding(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => setBulkText(e.target?.result as string);
    reader.readAsText(file);
  };

  const handleRemove = async (id: string) => {
    setRemovingId(id);
    try {
      await onRemove(id);
      toast({ title: "Competitor removed", description: "The competitor has been removed from your list" });
    } catch (error) {
      toast({ title: "Failed to remove competitor", description: error instanceof Error ? error.message : "Unknown error", variant: "destructive" });
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="bg-bg-surface border border-border-subtle rounded-lg p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-text-secondary" strokeWidth={1.5} />
          <h3 className="font-tight font-semibold text-[15px] text-text-primary">Competitors</h3>
        </div>
        <span className="font-mono text-[11px] text-text-muted">
          {competitors.length}/{maxCompetitors}
        </span>
      </div>

      {/* Input + add button */}
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          placeholder="@competitor_handle"
          value={newUsername}
          onChange={(e) => setNewUsername(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAddSingle()}
          disabled={isAdding || remainingSlots <= 0}
          className="flex-1 bg-bg-base border border-border-subtle rounded-md px-3 py-2 text-[13px] font-mono text-text-primary placeholder:text-text-muted focus:border-mint focus:outline-none focus:shadow-[0_0_0_3px_rgba(124,255,178,0.1)] transition-all"
          data-testid="input-add-competitor"
        />
        <button
          onClick={handleAddSingle}
          disabled={isAdding || !newUsername.trim() || remainingSlots <= 0}
          className="bg-mint hover:bg-mint-hover text-bg-base px-3 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="button-add-competitor"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Bulk add + clear */}
      <div className="flex gap-2 mb-3">
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <button
              disabled={remainingSlots <= 0}
              className="flex-1 border border-border-subtle hover:border-border-soft text-text-secondary hover:text-text-primary text-[13px] py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="button-bulk-add"
            >
              Bulk Add
            </button>
          </DialogTrigger>
          <DialogContent className="w-full max-w-2xl mx-4 sm:mx-auto">
            <DialogHeader>
              <DialogTitle>Add Multiple Competitors</DialogTitle>
            </DialogHeader>
            <Tabs defaultValue="paste">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="paste">Paste Text</TabsTrigger>
                <TabsTrigger value="txt">Upload .txt</TabsTrigger>
                <TabsTrigger value="csv">Upload .csv</TabsTrigger>
              </TabsList>
              <TabsContent value="paste" className="space-y-4">
                <div className="space-y-2">
                  <Label>Enter usernames (one per line or comma-separated)</Label>
                  <Textarea
                    placeholder="@creator1&#10;@creator2&#10;@creator3"
                    className="h-64 font-mono text-sm"
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    data-testid="textarea-bulk-usernames"
                  />
                </div>
              </TabsContent>
              <TabsContent value="txt" className="space-y-4">
                <div className="border-2 border-dashed border-border-subtle rounded-lg p-8 text-center">
                  <Upload className="w-8 h-8 mx-auto text-text-muted mb-4" strokeWidth={1.5} />
                  <Label htmlFor="txt-upload" className="cursor-pointer text-mint hover:underline">
                    Click to upload .txt file
                  </Label>
                  <input id="txt-upload" type="file" accept=".txt" className="hidden" onChange={handleFileUpload} />
                  <p className="text-xs text-text-muted mt-2">One username per line</p>
                </div>
                {bulkText && <Textarea className="h-32 font-mono text-sm" value={bulkText} onChange={(e) => setBulkText(e.target.value)} />}
              </TabsContent>
              <TabsContent value="csv" className="space-y-4">
                <div className="border-2 border-dashed border-border-subtle rounded-lg p-8 text-center">
                  <Upload className="w-8 h-8 mx-auto text-text-muted mb-4" strokeWidth={1.5} />
                  <Label htmlFor="csv-upload" className="cursor-pointer text-mint hover:underline">
                    Click to upload .csv file
                  </Label>
                  <input id="csv-upload" type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                  <p className="text-xs text-text-muted mt-2">Single column with usernames</p>
                </div>
                {bulkText && <Textarea className="h-32 font-mono text-sm" value={bulkText} onChange={(e) => setBulkText(e.target.value)} />}
              </TabsContent>
            </Tabs>
            <div className="flex justify-between items-center">
              <p className="text-sm text-text-muted">{remainingSlots} slots remaining</p>
              <button
                onClick={handleBulkAdd}
                disabled={isAdding || !bulkText.trim()}
                className="bg-mint hover:bg-mint-hover text-bg-base font-semibold text-[14px] px-5 py-2.5 rounded-md transition-colors disabled:opacity-50"
                data-testid="button-confirm-bulk"
              >
                {isAdding ? "Adding..." : "Add Competitors"}
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {onClearAll && competitors.length > 0 && (
          <AlertDialog open={isClearDialogOpen} onOpenChange={setIsClearDialogOpen}>
            <AlertDialogTrigger asChild>
              <button
                disabled={isClearing}
                className="border border-border-subtle hover:border-danger text-text-muted hover:text-danger text-[13px] px-3 py-2 rounded-md transition-colors disabled:opacity-50"
                data-testid="button-clear-all"
              >
                Clear
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear all competitors?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove all {competitors.length} competitors. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isClearing}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleClearAll} disabled={isClearing} className="bg-destructive hover:bg-destructive/90">
                  {isClearing ? "Clearing..." : "Clear All"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {/* Competitor list */}
      <div className="max-h-[280px] overflow-y-auto space-y-1.5 mt-4 pt-4 border-t border-border-subtle">
        {competitors.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-10 h-10 rounded-full bg-bg-elevated border border-border-subtle flex items-center justify-center mx-auto mb-3">
              <Users className="w-4 h-4 text-text-muted" strokeWidth={1.5} />
            </div>
            <p className="text-[13px] text-text-primary mb-1">No competitors yet</p>
            <p className="font-mono text-[11px] text-text-muted">Drop a handle to begin</p>
          </div>
        ) : (
          competitors.map((competitor) => (
            <div
              key={competitor.id}
              className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-bg-elevated hover:bg-bg-base transition-colors"
              data-testid={`competitor-item-${competitor.username}`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-full bg-bg-base border border-border-subtle flex items-center justify-center text-[10px] font-semibold text-text-secondary shrink-0">
                  {competitor.username.slice(0, 2).toUpperCase()}
                </div>
                <span className="font-mono text-[13px] text-text-primary truncate">
                  @{competitor.username}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <a
                  href={`https://instagram.com/${competitor.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-text-muted hover:text-mint transition-colors p-1 rounded hover:bg-bg-surface"
                >
                  <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.5} />
                </a>
                <button
                  onClick={() => handleRemove(competitor.id)}
                  disabled={removingId === competitor.id}
                  className="text-text-muted hover:text-danger transition-colors p-1 rounded hover:bg-bg-surface disabled:opacity-50"
                  data-testid={`button-remove-${competitor.username}`}
                >
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
