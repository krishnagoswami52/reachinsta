import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
      console.log("Initiating clear all competitors...");
      await onClearAll();
      console.log("Clear all successful");
      
      toast({
        title: "All competitors cleared",
        description: "Your competitor list is now empty",
      });
      setIsClearDialogOpen(false);
    } catch (error) {
      console.error("Clear all failed:", error);
      toast({
        title: "Failed to clear competitors",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsClearing(false);
    }
  };

  const handleAddSingle = async () => {
    const username = parseInstagramUsername(newUsername);
    if (!username) {
      toast({
        title: "Invalid username",
        description: "Please enter a valid Instagram username",
        variant: "destructive",
      });
      return;
    }

    if (competitors.some((c) => c.username.toLowerCase() === username.toLowerCase())) {
      toast({
        title: "Duplicate username",
        description: "This competitor is already in your list",
        variant: "destructive",
      });
      return;
    }

    if (remainingSlots <= 0) {
      toast({
        title: "Limit reached",
        description: "Upgrade your plan to add more competitors",
        variant: "destructive",
      });
      return;
    }

    setIsAdding(true);
    try {
      await onAdd([username]);
      setNewUsername("");
      toast({
        title: "Competitor added",
        description: `@${username} has been added to your list`,
      });
    } catch (error) {
      toast({
        title: "Failed to add competitor",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
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
      toast({
        title: "No new usernames",
        description: "All usernames are duplicates or invalid",
        variant: "destructive",
      });
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
      toast({
        title: "Failed to add competitors",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsAdding(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setBulkText(content);
    };
    reader.readAsText(file);
  };

  const handleRemove = async (id: string) => {
    setRemovingId(id);
    try {
      await onRemove(id);
      toast({
        title: "Competitor removed",
        description: "The competitor has been removed from your list",
      });
    } catch (error) {
      toast({
        title: "Failed to remove competitor",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="w-5 h-5" />
            Competitors
          </CardTitle>
          <span className="text-sm text-muted-foreground">
            {competitors.length}/{maxCompetitors}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Competitor username"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddSingle()}
            disabled={isAdding || remainingSlots <= 0}
            data-testid="input-add-competitor"
          />
          <Button
            onClick={handleAddSingle}
            disabled={isAdding || !newUsername.trim() || remainingSlots <= 0}
            data-testid="button-add-competitor"
          >
            <Plus className="w-4 h-4" />
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" disabled={remainingSlots <= 0} data-testid="button-bulk-add">
                Bulk Add
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
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
                  <div className="border-2 border-dashed rounded-lg p-8 text-center">
                    <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-4" />
                    <Label
                      htmlFor="txt-upload"
                      className="cursor-pointer text-primary hover:underline"
                    >
                      Click to upload .txt file
                    </Label>
                    <input
                      id="txt-upload"
                      type="file"
                      accept=".txt"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      One username per line
                    </p>
                  </div>
                  {bulkText && (
                    <Textarea
                      className="h-32 font-mono text-sm"
                      value={bulkText}
                      onChange={(e) => setBulkText(e.target.value)}
                    />
                  )}
                </TabsContent>
                <TabsContent value="csv" className="space-y-4">
                  <div className="border-2 border-dashed rounded-lg p-8 text-center">
                    <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-4" />
                    <Label
                      htmlFor="csv-upload"
                      className="cursor-pointer text-primary hover:underline"
                    >
                      Click to upload .csv file
                    </Label>
                    <input
                      id="csv-upload"
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      Single column with usernames
                    </p>
                  </div>
                  {bulkText && (
                    <Textarea
                      className="h-32 font-mono text-sm"
                      value={bulkText}
                      onChange={(e) => setBulkText(e.target.value)}
                    />
                  )}
                </TabsContent>
              </Tabs>
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                  {remainingSlots} slots remaining
                </p>
                <Button
                  onClick={handleBulkAdd}
                  disabled={isAdding || !bulkText.trim()}
                  data-testid="button-confirm-bulk"
                >
                  {isAdding ? "Adding..." : "Add Competitors"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {onClearAll && competitors.length > 0 && (
            <AlertDialog open={isClearDialogOpen} onOpenChange={setIsClearDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="destructive" 
                  disabled={isClearing} 
                  data-testid="button-clear-all"
                >
                  Clear All
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all competitors?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove all {competitors.length} competitors from your list. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isClearing}>Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={handleClearAll} 
                    disabled={isClearing}
                    className="bg-destructive hover:bg-destructive/90"
                  >
                    {isClearing ? "Clearing..." : "Clear All"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        <ScrollArea className="h-[300px]">
          {competitors.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-sm">No competitors added yet</p>
              <p className="text-xs mt-1">Add competitors to start tracking</p>
            </div>
          ) : (
            <div className="space-y-2">
              {competitors.map((competitor) => (
                <div
                  key={competitor.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/50 hover-elevate"
                  data-testid={`competitor-item-${competitor.username}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {competitor.username.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-mono text-sm truncate">
                      @{competitor.username}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      asChild
                      className="h-8 w-8"
                    >
                      <a
                        href={`https://instagram.com/${competitor.username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleRemove(competitor.id)}
                      disabled={removingId === competitor.id}
                      data-testid={`button-remove-${competitor.username}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
