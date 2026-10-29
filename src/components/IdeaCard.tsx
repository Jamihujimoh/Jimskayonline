"use client"

import { Idea } from '@/app/lib/store';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2, Edit3, Calendar } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface IdeaCardProps {
  idea: Idea;
  onView: (idea: Idea) => void;
  onEdit: (idea: Idea) => void;
  onDelete: (id: string) => void;
}

export function IdeaCard({ idea, onView, onEdit, onDelete }: IdeaCardProps) {
  const preview = idea.content.length > 120 
    ? idea.content.substring(0, 120) + '...' 
    : idea.content;

  return (
    <Card className="idea-card-transition cursor-pointer border-none shadow-sm flex flex-col group h-full" onClick={() => onView(idea)}>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start gap-2">
          <CardTitle className="text-lg font-bold line-clamp-1 text-primary">{idea.title}</CardTitle>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => onEdit(idea)}>
              <Edit3 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => onDelete(idea.id)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 pb-4">
        <p className="text-muted-foreground text-sm whitespace-pre-wrap leading-relaxed">
          {preview || <span className="italic">No content provided...</span>}
        </p>
      </CardContent>
      <CardFooter className="pt-0 text-[10px] text-muted-foreground flex items-center gap-1 border-t mt-auto py-3 bg-muted/5">
        <Calendar className="w-3 h-3" />
        <span>Updated {formatDistanceToNow(idea.updatedAt, { addSuffix: true })}</span>
      </CardFooter>
    </Card>
  );
}
