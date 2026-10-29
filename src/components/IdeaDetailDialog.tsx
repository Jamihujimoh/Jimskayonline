"use client"

import { Idea } from '@/app/lib/store';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Trash2, Edit3, Calendar, Clock } from 'lucide-react';
import { format } from 'date-fns';

interface IdeaDetailDialogProps {
  idea: Idea | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (idea: Idea) => void;
  onDelete: (id: string) => void;
}

export function IdeaDetailDialog({ idea, isOpen, onClose, onEdit, onDelete }: IdeaDetailDialogProps) {
  if (!idea) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl">
        <div className="p-8 pb-4 flex-1 overflow-auto custom-scrollbar">
          <DialogHeader className="space-y-4 text-left">
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground uppercase tracking-wider font-semibold">
              <span className="flex items-center gap-1 bg-muted px-2 py-1 rounded">
                <Calendar className="w-3 h-3" />
                Created {format(idea.createdAt, 'MMM d, yyyy')}
              </span>
              <span className="flex items-center gap-1 bg-muted px-2 py-1 rounded">
                <Clock className="w-3 h-3" />
                Updated {format(idea.updatedAt, 'h:mm a')}
              </span>
            </div>
            <DialogTitle className="text-3xl font-bold text-primary leading-tight">
              {idea.title}
            </DialogTitle>
          </DialogHeader>
          
          <div className="mt-8">
            <div className="text-foreground leading-relaxed whitespace-pre-wrap text-lg font-body">
              {idea.content || <p className="italic text-muted-foreground">This idea has no detailed content yet. Click edit to add some thoughts!</p>}
            </div>
          </div>
        </div>

        <div className="bg-muted/30 p-4 border-t flex justify-between items-center px-8">
          <Button 
            variant="ghost" 
            className="text-destructive hover:bg-destructive/10 gap-2 h-10 px-4"
            onClick={() => {
              onDelete(idea.id);
              onClose();
            }}
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </Button>
          
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="h-10 px-6">Close</Button>
            <Button 
              className="bg-primary text-white gap-2 h-10 px-6"
              onClick={() => {
                onEdit(idea);
                onClose();
              }}
            >
              <Edit3 className="w-4 h-4" />
              Edit Idea
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
