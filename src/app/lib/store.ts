"use client"

import { useState, useEffect } from 'react';

export interface Idea {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'ideaspark_ideas';

export function useIdeas() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setIdeas(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse ideas", e);
      }
    }
    setLoading(false);
  }, []);

  const saveIdeas = (newIdeas: Idea[]) => {
    setIdeas(newIdeas);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newIdeas));
  };

  const addIdea = (title: string, content: string) => {
    const newIdea: Idea = {
      id: Math.random().toString(36).substring(2, 9),
      title,
      content,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    saveIdeas([newIdea, ...ideas]);
    return newIdea;
  };

  const updateIdea = (id: string, updates: Partial<Pick<Idea, 'title' | 'content'>>) => {
    saveIdeas(ideas.map(idea => 
      idea.id === id 
        ? { ...idea, ...updates, updatedAt: Date.now() } 
        : idea
    ));
  };

  const deleteIdea = (id: string) => {
    saveIdeas(ideas.filter(idea => idea.id !== id));
  };

  return {
    ideas,
    loading,
    addIdea,
    updateIdea,
    deleteIdea
  };
}
