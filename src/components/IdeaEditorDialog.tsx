"use client"

import { useState, useEffect } from 'react';
import { Idea } from '@/app/lib/store';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Lightbulb } from 'lucide-react';

interface IdeaEditorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (title: string, content: string) => void;
  editingIdea: Idea | null;
}

export function IdeaEditorDialog({ isOpen, onClose, onSave, editingIdea }: IdeaEditorDialogProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    if (editingIdea) {
      setTitle(editingIdea.title);
      setContent(editingIdea.content);
    } else {
      setTitle('');
      setContent('');
    }
  }, [editingIdea, isOpen]);

  const handleSave = () => {
    if (!title.trim()) return;
    onSave(title, content);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-primary" />
            {editingIdea ? 'Edit Idea' : 'Spark a New Idea'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Title</label>
            <Input 
              placeholder="What's the core concept?" 
              value={title} 
              onChange={(e) => setTitle(e.target.value)}
              className="font-medium"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Details</label>
            <Textarea 
              placeholder="Flesh out your thoughts here..." 
              value={content} 
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[200px] resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!title.trim()} className="bg-primary">
            {editingIdea ? 'Save Changes' : 'Add Idea'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
