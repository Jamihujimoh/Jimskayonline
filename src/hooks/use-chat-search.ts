import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { webSearch } from '@/ai/flows/web-search-flow';
import { useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';

export function useChatSearch(user: { uid: string } | null | undefined, currentChatId: string | null) {
  const db = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);

  const handleWebSearch = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!searchQuery.trim() || isSearching || !user || !db) return;

    setIsSearching(true);
    setIsAiThinking(true);
    const originalQuery = searchQuery.trim();
    let activeChatId = currentChatId;

    try {
      if (!activeChatId) {
        const chatRef = await addDoc(collection(db, 'users', user.uid, 'chats'), {
          userId: user.uid,
          lastMessage: `Search: ${originalQuery}`,
          updatedAt: serverTimestamp(),
        });
        activeChatId = chatRef.id;
        router.push(`/chat?id=${activeChatId}`);
      }

      await addDoc(collection(db, 'users', user.uid, 'chats', activeChatId, 'messages'), {
        role: 'user',
        content: `Search: **${originalQuery}**`,
        timestamp: serverTimestamp(),
      });

      setSearchQuery('');
      const response = await webSearch({ query: originalQuery });
      await addDoc(collection(db, 'users', user.uid, 'chats', activeChatId, 'messages'), {
        role: 'model',
        content: response.results,
        timestamp: serverTimestamp(),
      });
      await updateDoc(doc(db, 'users', user.uid, 'chats', activeChatId), {
        lastMessage: `Search: ${originalQuery}`,
        updatedAt: serverTimestamp(),
      });
    } catch {
      toast({ variant: 'destructive', title: 'Search failed', description: 'The web intelligence link could not be reached.' });
    } finally {
      setIsSearching(false);
      setIsAiThinking(false);
    }
  };

  return { searchQuery, setSearchQuery, isSearching, isAiThinking, handleWebSearch };
}
