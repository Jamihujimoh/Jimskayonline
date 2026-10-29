"use client"

import { useState, useRef, useEffect } from 'react';
import { useUser, useFirestore, useStorage, useDoc, useMemoFirebase } from '@/firebase';
import { collection, addDoc, serverTimestamp, doc, query, orderBy, limit, getDocs, updateDoc, setDoc } from 'firebase/firestore';
import { jimskayChat } from '@/ai/flows/jimskay-chat-flow';
import { adminChat } from '@/ai/flows/admin-agent-flow';
import { Send, Loader2, Mic, X, Paperclip, FileText, FolderOpen, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { clearAiTodos } from '@/components/ChatTodos';
import { addDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { CREATOR_VERIFICATION_CODE, getEffectiveCreatorStatus, setStoredCreatorVerification, verifyCreatorCode } from '@/lib/creator-state';
import { extensionLabel, formatFileSize, folderNameFromFiles, type AttachmentPipelineStatus } from '@/lib/attachment-pipeline';
import type { ChatModelId } from '@/lib/chat-models';
import type { ChatArtifact } from '@/lib/chat-artifacts';
import type { UniversalFileAttachment } from '@/lib/universal-file-workspace';

interface ChatInputProps {
  chatId: string | null;
  onChatCreated: (id: string) => void;
  onThinkingChange?: (isThinking: boolean) => void;
  interfaceMode?: 'ask' | 'admin';
  adminPin?: string;
  phoneConsentMode: 'ask' | 'allowAll';
  selectedModel: ChatModelId;
}

type PdfPayload = { base64Data?: string; downloadUrl?: string; filename: string };

// 📸 Native client-side image compression (fully bypasses Next.js component namespace conflicts)
const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = document.createElement('img'); // 👈 Safe browser element instantiation
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(event.target?.result as string); // Fallback to raw if canvas context fails
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        // Compress as JPEG with 0.7 quality to stay well under Firestore's 1MB limit
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
        resolve(compressedBase64);
      };
      img.onerror = () => {
        resolve(event.target?.result as string); // Fallback to raw if loading image elements fails
      };
    };
    reader.onerror = (err) => reject(err);
  });
};

export function ChatInput({ chatId, onChatCreated, onThinkingChange, interfaceMode = 'ask', adminPin = '', phoneConsentMode, selectedModel }: ChatInputProps) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<UniversalFileAttachment | null>(null);
  const [attachmentStatus, setAttachmentStatus] = useState<AttachmentPipelineStatus>('ready');
  const [attachmentStatusMessage, setAttachmentStatusMessage] = useState('');
  const [attachmentFileCount, setAttachmentFileCount] = useState<number | null>(null);
  const [creatorCodeInput, setCreatorCodeInput] = useState('');
  const [isVerifyingCreator, setIsVerifyingCreator] = useState(false);
  const { user } = useUser();
  const storage = useStorage();
  const db = useFirestore();
  const { toast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // React's DOM typings do not expose webkitdirectory, so set the browser
    // attribute directly while retaining normal React input typing.
    folderInputRef.current?.setAttribute('webkitdirectory', '');
    folderInputRef.current?.setAttribute('directory', '');
  }, []);

  const profileQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);
  const { data: profile } = useDoc(profileQuery);
  const effectiveCreator = getEffectiveCreatorStatus(profile);

  useEffect(() => {
    if (effectiveCreator) {
      setStoredCreatorVerification(true);
    }
  }, [effectiveCreator]);

  // Monitor active mode of current chat
  const chatQuery = useMemoFirebase(() => {
    if (!db || !user || !chatId) return null;
    return doc(db, 'users', user.uid, 'chats', chatId);
  }, [db, user, chatId]);
  const { data: chatData } = useDoc(chatQuery);
  const activeMode = chatData?.activeMode || 'normal';

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;
        recognitionRef.current.lang = 'en-US';

        recognitionRef.current.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
        };

        recognitionRef.current.onerror = () => {
          setIsListening(false);
          toast({ variant: 'destructive', title: 'Voice Link Failed' });
        };

        recognitionRef.current.onend = () => {
          setIsListening(false);
        };
      }
    }
  }, [toast]);

  const toggleListening = () => {
    if (profile?.isBanned) return;
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      if (!recognitionRef.current) {
        toast({ title: 'Speech Protocol Unavailable' });
        return;
      }
      setIsListening(true);
      recognitionRef.current.start();
    }
  };

  const maxImagesPerMessage = effectiveCreator ? Number.MAX_SAFE_INTEGER : 15;

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File is too large', description: 'Files up to 50 MB are supported.' });
      return;
    }

    // Show the local selection immediately. The old flow waited for server
    // inspection/storage before rendering anything, making a failed inspection
    // look like the picker had done nothing.
    setSelectedFile({
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      kind: 'binary',
      content: '',
      extracted: false,
      sourceFormat: file.name.split('.').pop()?.toLowerCase() || '',
      extractionNote: 'Selected locally. Inspecting…',
    });
    setAttachmentStatus('inspecting');
    setAttachmentStatusMessage(`Preparing ${file.name}`);
    setAttachmentFileCount(1);

    try {
      toast({ title: 'Inspecting file…', description: `${file.name} is being prepared for Jimskay AI.` });
      const form = new FormData();
      form.append('file', file);
      const response = await fetch('/api/files/inspect', { method: 'POST', body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'File inspection failed.');

      let downloadUrl: string | undefined;
      let storagePath: string | undefined;
      if (storage && user) {
        const storageRef = ref(storage, `users/${user.uid}/files/originals/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, '_')}`);
        const uploaded = await uploadBytes(storageRef, file, { contentType: file.type || 'application/octet-stream' });
        downloadUrl = await getDownloadURL(uploaded.ref);
        storagePath = uploaded.ref.fullPath;
      }

      setSelectedFile((previous) => ({
        ...(previous || {}),
        ...result,
        storagePath,
        downloadUrl,
        content: result.content || '',
      } as UniversalFileAttachment));
      setAttachmentStatus('ready');
      setAttachmentStatusMessage(result.extractionNote || 'Ready to send');
      toast({
        title: 'File attached',
        description: result.extractionNote || file.name,
      });
    } catch (error) {
      console.error('Failed to inspect attached file:', error);
      setAttachmentStatus('error');
      setAttachmentStatusMessage(error instanceof Error ? error.message : 'Inspection failed; the original selection is still attached.');
      toast({
        variant: 'destructive',
        title: 'File inspection failed',
        description: 'The file remains attached. You can still remove it or send it for processing.',
      });
    }
  };

  const handleFolderSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;

    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > 50 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'Folder is too large', description: 'Folders up to 50 MB are supported.' });
      return;
    }

    const selectedFolderName = folderNameFromFiles(files);
    setSelectedFile({
      name: `${selectedFolderName}.zip`,
      mimeType: 'application/zip',
      size: totalSize,
      kind: 'archive',
      content: files.map((file) => `FILE ${((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name)}`).join('\n'),
      extracted: false,
      sourceFormat: 'zip',
      extractionNote: `Folder selected locally (${files.length} files). Packaging…`,
    });
    setAttachmentStatus('packaging');
    setAttachmentStatusMessage(`Packaging ${selectedFolderName}`);
    setAttachmentFileCount(files.length);

    try {
      toast({ title: 'Packaging folder…', description: `${files.length} files are being bundled into a ZIP.` });
      const form = new FormData();
      for (const file of files) form.append('files', file, (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name);
      const response = await fetch('/api/files/package-folder', { method: 'POST', body: form });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Folder packaging failed.');
      }
      const blob = await response.blob();
      const name = files[0]?.webkitRelativePath?.split('/')[0] || 'folder';
      const zipFile = new File([blob], `${name}.zip`, { type: 'application/zip' });
      const inspectForm = new FormData();
      inspectForm.append('file', zipFile);
      const inspectResponse = await fetch('/api/files/inspect', { method: 'POST', body: inspectForm });
      const result = await inspectResponse.json();
      if (!inspectResponse.ok) throw new Error(result.error || 'Packaged folder inspection failed.');

      let downloadUrl: string | undefined;
      let storagePath: string | undefined;
      if (storage && user) {
        const storageRef = ref(storage, `users/${user.uid}/files/originals/${crypto.randomUUID()}-${zipFile.name}`);
        const uploaded = await uploadBytes(storageRef, zipFile, { contentType: 'application/zip' });
        downloadUrl = await getDownloadURL(uploaded.ref);
        storagePath = uploaded.ref.fullPath;
      }

      setSelectedFile((previous) => ({
        ...(previous || {}),
        ...result,
        storagePath,
        downloadUrl,
        content: result.content || previous?.content || '',
        name: zipFile.name,
      } as UniversalFileAttachment));
      setAttachmentStatus('ready');
      setAttachmentStatusMessage(`${files.length} files packaged and ready`);
      toast({ title: 'Folder attached', description: `${files.length} files packaged as ${zipFile.name}` });
    } catch (error) {
      console.error('Failed to package folder:', error);
      setAttachmentStatus('error');
      setAttachmentStatusMessage(error instanceof Error ? error.message : 'Folder packaging failed; the local selection is still visible.');
      toast({
        variant: 'destructive',
        title: 'Folder packaging failed',
        description: 'The selected folder remains visible so you can retry or remove it.',
      });
    }
  };

  const handleVerifyCreator = async () => {
    if (!user || !db) return;

    if (!verifyCreatorCode(creatorCodeInput)) {
      toast({ variant: 'destructive', title: 'Creator verification failed', description: `Use the code: ${CREATOR_VERIFICATION_CODE}` });
      return;
    }

    setIsVerifyingCreator(true);
    try {
      await setDoc(doc(db, 'users', user.uid), {
        isVerifiedCreator: true,
        creatorVerifiedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });

      setStoredCreatorVerification(true);
      setCreatorCodeInput('');
      toast({ title: 'Creator verified', description: 'Creator access is now active for this account.' });
    } catch (error) {
      console.error('Creator verification failed:', error);
      toast({ variant: 'destructive', title: 'Verification failed', description: 'The profile could not be updated. Try again.' });
    } finally {
      setIsVerifyingCreator(false);
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const allowedFiles = files.slice(0, Math.max(0, maxImagesPerMessage - selectedImages.length));
    if (allowedFiles.length < files.length) {
      toast({
        variant: 'destructive',
        title: 'Image upload limit reached',
        description: effectiveCreator
          ? 'Creators can upload unlimited images.'
          : `You can upload up to ${maxImagesPerMessage} images at once.`,
      });
    }

    if (!allowedFiles.length) return;

    try {
      const compressedImages = await Promise.all(allowedFiles.map((file) => compressImage(file)));
      setSelectedImages((prev) => [...prev, ...compressedImages].slice(0, maxImagesPerMessage));
      toast({ title: 'Optical fragments ready' });
    } catch (error) {
      console.error('Compression failed:', error);
      toast({ variant: 'destructive', title: 'Optical Read Error', description: 'Could not process one or more images.' });
    } finally {
      e.target.value = '';
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!input.trim() && !selectedImages.length && !selectedFile) || isLoading || profile?.isBanned) return;

    const rawContent = input.trim();
    const fileToUpload = selectedFile;
    const hasImages = selectedImages.length > 0;
    const messageContent = rawContent || (fileToUpload
      ? `Please review the attached file: ${fileToUpload.name}. Read it and be ready to edit or transform it when requested.`
      : hasImages ? 'Analyze these images' : '');
    const imageUrlsToUpload = [...selectedImages];
    const cleanLowerCommand = messageContent.toLowerCase().trim();

    if (chatId) clearAiTodos(chatId);
    setInput('');
    setSelectedImages([]);
    setSelectedFile(null);
    setAttachmentStatus('ready');
    setAttachmentStatusMessage('');
    setAttachmentFileCount(null);
    setIsLoading(true);
    if (onThinkingChange) onThinkingChange(true);

    let activeChatId = chatId;

    try {
      if (!activeChatId) {
        const chatRef = await addDoc(collection(db!, 'users', user!.uid, 'chats'), {
          userId: user!.uid,
          lastMessage: messageContent,
          activeMode: 'normal',
          updatedAt: serverTimestamp(),
        });
        activeChatId = chatRef.id;
        onChatCreated(activeChatId);
      }

      // ADMIN MODE: route to the local agent (terminal + file control on this machine)
      if (interfaceMode === 'admin') {
        const userMsgRef = collection(db!, 'users', user!.uid, 'chats', activeChatId, 'messages');
        addDocumentNonBlocking(userMsgRef, {
          role: 'user',
          content: messageContent,
          timestamp: serverTimestamp(),
        });

        const chatDocRef = doc(db!, 'users', user!.uid, 'chats', activeChatId);
        updateDocumentNonBlocking(chatDocRef, {
          lastMessage: messageContent,
          updatedAt: serverTimestamp(),
        });

        const messagesQuery = query(
          collection(db!, 'users', user!.uid, 'chats', activeChatId, 'messages'),
          orderBy('timestamp', 'desc'),
          limit(30)
        );
        const snapshot = await getDocs(messagesQuery);
        const compactAdminMessage = (s: string) => (s.length > 6000 ? s.slice(0, 6000) + '...' : s);
        const history = snapshot.docs
          .map((doc) => ({
            role: (doc.data().role === 'user' ? 'user' : 'model') as 'user' | 'model',
            content: compactAdminMessage(doc.data().content || ''),
          }))
          .filter((m) => m.content !== messageContent)
          .reverse();

        const idToken = await user!.getIdToken();
        const response = await adminChat({
          idToken,
          adminPin,
          userMessage: messageContent,
          history,
          selectedModel,
          creatorVerified: effectiveCreator,
          phoneConsentMode,
        });

        await addDoc(userMsgRef, {
          role: 'model',
          type: 'admin-run',
          content: response.text || '',
          adminSteps: response.steps,
          timestamp: serverTimestamp(),
        });

        setIsLoading(false);
        if (onThinkingChange) onThinkingChange(false);
        return;
      }

      // 🛑 OPTION A: Intercept "jimskay operation list mode"
      if (cleanLowerCommand === 'jimskay operation list mode') {
        const userMsgRef = collection(db!, 'users', user!.uid, 'chats', activeChatId, 'messages');
        await addDoc(userMsgRef, {
          role: 'user',
          content: messageContent,
          timestamp: serverTimestamp(),
        });

        await addDoc(userMsgRef, {
          role: 'model',
          content: 'Initiating Operation Mode matrix. Select an operating layer below to redirect my system nodes:',
          type: 'mode-selector',
          timestamp: serverTimestamp(),
        });

        setIsLoading(false);
        if (onThinkingChange) onThinkingChange(false);
        return;
      }

      // 🛑 OPTION B: Intercept "jimskay operation change to [name] mode"
      if (cleanLowerCommand.startsWith('jimskay operation change to ') && cleanLowerCommand.endsWith(' mode')) {
        const targetMode = cleanLowerCommand
          .replace('jimskay operation change to ', '')
          .replace(' mode', '')
          .trim();

        const validModes = ['normal', 'hacking', 'creator', 'programming', 'religious'];

        if (validModes.includes(targetMode)) {
          const userMsgRef = collection(db!, 'users', user!.uid, 'chats', activeChatId, 'messages');
          await addDoc(userMsgRef, {
            role: 'user',
            content: messageContent,
            timestamp: serverTimestamp(),
          });

          // Sync database
          const chatDocRef = doc(db!, 'users', user!.uid, 'chats', activeChatId);
          await updateDoc(chatDocRef, {
            activeMode: targetMode,
            lastMessage: `Mode shifted: ${targetMode.toUpperCase()}`,
            updatedAt: serverTimestamp(),
          });

          // Generate confirming response with target mode active
          const response = await jimskayChat({
            userId: user!.uid,
            activeMode: targetMode,
            history: [{ role: 'user', content: `Confirming system migration to ${targetMode} mode.` }],
            currentUser: { username: profile?.username, isVerifiedCreator: effectiveCreator },
          });

          await addDoc(userMsgRef, {
            role: 'model',
            content: response.text || `System migrated. Mode configured to ${targetMode.toUpperCase()}. Ready to execute tasks.`,
            timestamp: serverTimestamp(),
          });

          setIsLoading(false);
          if (onThinkingChange) onThinkingChange(false);
          return;
        }
      }

      // Standard user message routing
      const userMsgRef = collection(db!, 'users', user!.uid, 'chats', activeChatId, 'messages');
      const userMessagePayload: Record<string, unknown> = {
        role: 'user',
        content: messageContent,
        timestamp: serverTimestamp(),
      };
      if (imageUrlsToUpload.length) {
        userMessagePayload.imageUrls = imageUrlsToUpload;
        userMessagePayload.imageUrl = imageUrlsToUpload[0];
      }
      if (fileToUpload) userMessagePayload.fileAttachment = fileToUpload;
      addDocumentNonBlocking(userMsgRef, userMessagePayload);

      const chatDocRef = doc(db!, 'users', user!.uid, 'chats', activeChatId);
      updateDocumentNonBlocking(chatDocRef, {
        lastMessage: imageUrlsToUpload.length ? 'Optical Analysis Protocol' : messageContent,
        updatedAt: serverTimestamp(),
      });

      const messagesQuery = query(
        collection(db!, 'users', user!.uid, 'chats', activeChatId, 'messages'),
        orderBy('timestamp', 'desc'),
        limit(20)
      );
      const snapshot = await getDocs(messagesQuery);
      const latestFileMessageId = snapshot.docs.find((messageDoc) =>
        messageDoc.data().fileAttachment || messageDoc.data().updatedFile
      )?.id;

      let history = snapshot.docs
        .map((doc) => {
          const existingImageUrls = Array.isArray(doc.data().imageUrls)
            ? doc.data().imageUrls.filter(Boolean)
            : doc.data().imageUrl
              ? [doc.data().imageUrl]
              : [];

          const entry: {
            role: 'user' | 'model';
            content: string;
            imageUrls?: string[];
            imageUrl?: string;
            fileAttachment?: UniversalFileAttachment;
            updatedFile?: UniversalFileAttachment;
          } = {
            role: (doc.data().role === 'user' ? 'user' : 'model') as 'user' | 'model',
            content: doc.data().content || '',
          };

          if (existingImageUrls.length) {
            entry.imageUrls = existingImageUrls;
          }
          if (doc.data().imageUrl) {
            entry.imageUrl = doc.data().imageUrl;
          }
          if (doc.id === latestFileMessageId && doc.data().fileAttachment) {
            entry.fileAttachment = doc.data().fileAttachment as UniversalFileAttachment;
          }
          if (doc.id === latestFileMessageId && doc.data().updatedFile) {
            entry.updatedFile = doc.data().updatedFile as UniversalFileAttachment;
          }

          return entry;
        })
        .filter((m) => m.content !== messageContent)
        .reverse();

      const newUserHistoryEntry: {
        role: 'user';
        content: string;
        imageUrls?: string[];
        imageUrl?: string;
        fileAttachment?: UniversalFileAttachment;
      } = {
        role: 'user',
        content: messageContent,
      };
      if (imageUrlsToUpload.length) {
        newUserHistoryEntry.imageUrls = imageUrlsToUpload;
        newUserHistoryEntry.imageUrl = imageUrlsToUpload[0];
      }
      if (fileToUpload) newUserHistoryEntry.fileAttachment = fileToUpload;
      history.push(newUserHistoryEntry);

      const response = await jimskayChat({
        userId: user!.uid,
        selectedModel,
        imageUrl: imageUrlsToUpload[0] || undefined,
        imageUrls: imageUrlsToUpload.length ? imageUrlsToUpload : undefined,
          fileAttachment: fileToUpload || undefined,
        activeMode,
        phoneConsentMode,
        history,
        currentUser: {
          username: profile?.username,
          status: profile?.status,
          syncRate: profile?.syncRate,
          isVerifiedCreator: effectiveCreator,
          isBanned: profile?.isBanned || false,
        },
      });

      if (response) {
        let pdfPayload: PdfPayload | null = response.pdfPayload || null;

        // Turn the model's edited representation back into a real downloadable file.
        // Text files can be written directly; DOCX/XLSX/PDF/ZIP are rebuilt server-side.
        let stagedUpdatedFile: UniversalFileAttachment | null = null;
        if (response.updatedFile) {
          try {
            const updated = response.updatedFile as UniversalFileAttachment & {
              files?: Array<{ path: string; content: string }>;
            };
            const rebuildResponse = await fetch('/api/files/rebuild', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: updated.name,
                mimeType: updated.mimeType,
                content: updated.content,
                kind: updated.kind,
                files: updated.files,
              }),
            });

            if (!rebuildResponse.ok) {
              const rebuildError = await rebuildResponse.json().catch(() => ({}));
              throw new Error(rebuildError.error || 'The edited file could not be rebuilt.');
            }

            const rebuiltBlob = await rebuildResponse.blob();
            const rebuiltFile = new File([rebuiltBlob], updated.name, {
              type: rebuiltBlob.type || updated.mimeType || 'application/octet-stream',
            });

            let downloadUrl: string | undefined;
            let storagePath: string | undefined;
            if (storage && user) {
              const storageRef = ref(
                storage,
                `users/${user.uid}/files/updated/${crypto.randomUUID()}-${updated.name.replace(/[^\w.\-]+/g, '_')}`
              );
              const uploaded = await uploadBytes(storageRef, rebuiltFile, {
                contentType: rebuiltFile.type,
              });
              downloadUrl = await getDownloadURL(uploaded.ref);
              storagePath = uploaded.ref.fullPath;
            }

            stagedUpdatedFile = {
              name: updated.name,
              mimeType: rebuiltFile.type || updated.mimeType,
              size: rebuiltFile.size,
              kind: updated.kind || 'binary',
              sourceFormat: updated.sourceFormat,
              content: updated.content,
              downloadUrl,
              storagePath,
              extracted: true,
              extractionNote: 'Updated file rebuilt by the Jimskay file workspace.',
            };
          } catch (fileError) {
            console.error('Updated file rebuild failed:', fileError);
            toast({
              variant: 'destructive',
              title: 'File update failed',
              description: fileError instanceof Error ? fileError.message : 'The AI response could not be converted into a downloadable file.',
            });
          }
        }
        const stagedPdfPayload = pdfPayload?.downloadUrl
          ? { filename: pdfPayload.filename, downloadUrl: pdfPayload.downloadUrl }
          : null;
        const responseText = response.text?.trim()
          || (response.visualLesson ? 'Your AI-generated video lesson is ready.' : null)
          || (response.artifact ? 'Interactive visual generated.' : null)
          || (response.pdfPayload ? 'Your PDF is ready. Preparing the download button...' : 'Response generated.');
        const modelMessageRef = await addDoc(collection(db!, 'users', user!.uid, 'chats', activeChatId, 'messages'), {
          role: 'model',
          content: [
            responseText,
            response.videoError ? `Video generation notice: ${response.videoError}` : '',
          ].filter(Boolean).join('\n\n'),
          pdfPayload: stagedPdfPayload,
          artifact: response.artifact || null,
          visualLesson: response.visualLesson || null,
          videoClips: response.videoClips || [],
          updatedFile: stagedUpdatedFile || null,
          timestamp: serverTimestamp(),
        });

        if (response.videoClips?.length && storage && user) {
          void (async () => {
            const durableClips = await Promise.all(response.videoClips.map(async (clip) => {
              try {
                const videoResponse = await fetch(clip.downloadUrl);
                if (!videoResponse.ok) throw new Error(`Video upload source failed (${videoResponse.status}).`);
                const videoBlob = await videoResponse.blob();
                const storageRef = ref(
                  storage,
                  `users/${user.uid}/videos/${crypto.randomUUID()}-${clip.filename.replace(/[^\w.\-]+/g, '_')}`
                );
                const uploaded = await uploadBytes(storageRef, videoBlob, { contentType: 'video/mp4' });
                return { ...clip, downloadUrl: await getDownloadURL(uploaded.ref) };
              } catch (uploadError) {
                console.error('Generated video storage upload failed:', uploadError);
                return clip;
              }
            }));
            await updateDoc(modelMessageRef, { videoClips: durableClips });
          })().catch((uploadError) => {
            console.error('Generated video links could not be saved:', uploadError);
          });
        }

        if (pdfPayload?.base64Data && user) {
          const base64Data = pdfPayload.base64Data;
          const filename = pdfPayload.filename || 'document.pdf';
          void (async () => {
            try {
              const binary = window.atob(base64Data);
              const bytes = new Uint8Array(binary.length);
              for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
              const storageRef = ref(storage, `users/${user.uid}/pdfs/${crypto.randomUUID()}-${filename}`);
              const snapshot = await uploadBytes(storageRef, bytes, { contentType: 'application/pdf' });
              await updateDoc(modelMessageRef, {
                pdfPayload: { filename, downloadUrl: await getDownloadURL(snapshot.ref) },
              });
            } catch (uploadError) {
              console.error('PDF upload failed:', uploadError);
              await updateDoc(modelMessageRef, {
                content: `${response.text?.trim() || 'Your PDF was generated.'}\n\n[PDF DOWNLOAD ERROR] The document was generated, but cloud storage could not finish uploading it.`,
              }).catch(() => undefined);
            }
          })();
        }
      }
    } catch (error: any) {
      console.error('Link Failure:', error);
      toast({ variant: 'destructive', title: 'Operation Error', description: 'System synchronization failure.' });
      // Never fail silently: surface the request failure as a visible chat message so a
      // ladder/PDF/tool error can't look like the AI "stuck" with no output at all.
      if (user && activeChatId) {
        const detail = String(error?.message || error).trim().slice(0, 300);
        addDocumentNonBlocking(collection(db!, 'users', user.uid, 'chats', activeChatId, 'messages'), {
          role: 'model',
          content: `[SYSTEM ERROR] The request failed before the model could reply — ${detail}`,
          timestamp: serverTimestamp(),
        });
      }
      setInput(rawContent);
      setSelectedImages(imageUrlsToUpload);
      setSelectedFile(fileToUpload);
    } finally {
      setIsLoading(false);
      if (onThinkingChange) onThinkingChange(false);
      if (activeChatId) clearAiTodos(activeChatId);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.max(48, Math.min(textareaRef.current.scrollHeight, 240))}px`;
    }
  }, [input]);

  if (profile?.isBanned) {
    return (
      <footer className="px-4 py-6 bg-destructive/10 border-t border-destructive/20 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-destructive animate-pulse">
          TERMINAL LOCKOUT: YOU HAVE BEEN BANNED FROM THE GRID.
        </p>
      </footer>
    );
  }

  return (
    <footer className="px-4 md:px-8 lg:px-12 py-4 pb-5 bg-gradient-to-t from-[#0a0a0f] via-[#0a0a0f]/95 to-transparent relative z-10 w-full shrink-0">
      <div className="w-full max-w-[1400px] space-y-3">
        {!effectiveCreator && (
          <div className="flex flex-col sm:flex-row gap-2 items-center justify-between rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-3 py-2">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-emerald-300/80">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Creator access
            </div>
            <div className="flex flex-1 w-full sm:max-w-md items-center gap-2">
              <input
                type="password"
                value={creatorCodeInput}
                onChange={(e) => setCreatorCodeInput(e.target.value)}
                placeholder={CREATOR_VERIFICATION_CODE}
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[12px] text-white placeholder:text-white/30 outline-none focus:border-emerald-400/60"
              />
              <button
                type="button"
                onClick={handleVerifyCreator}
                disabled={isVerifyingCreator}
                className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300 transition hover:bg-emerald-500/15 disabled:opacity-60"
              >
                {isVerifyingCreator ? 'Verifying...' : 'Verify'}
              </button>
            </div>
          </div>
        )}

        {selectedFile && (
          <div className="flex max-w-full items-center gap-3 rounded-2xl border border-primary/20 bg-primary/[0.06] px-3 py-2.5 shadow-lg shadow-black/10">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] border border-white/10">
              {selectedFile.kind === 'archive' ? <FolderOpen className="h-5 w-5 text-primary" /> : <FileText className="h-5 w-5 text-primary" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="truncate text-xs font-semibold text-white/85">{selectedFile.name}</span>
                <span className="shrink-0 rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[8px] font-black tracking-widest text-white/45">{extensionLabel(selectedFile.name)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] text-white/40">
                <span>{formatFileSize(selectedFile.size)}</span>
                {attachmentFileCount && attachmentFileCount > 1 && <span>• {attachmentFileCount} files</span>}
                <span>• {attachmentStatusMessage || (attachmentStatus === 'ready' ? 'Ready' : 'Preparing…')}</span>
              </div>
            </div>
            {attachmentStatus === 'inspecting' || attachmentStatus === 'uploading' || attachmentStatus === 'packaging' ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
            ) : (
              <span className={`h-2 w-2 shrink-0 rounded-full ${attachmentStatus === 'error' ? 'bg-red-400' : 'bg-emerald-400'}`} />
            )}
            <button type="button" onClick={() => { setSelectedFile(null); setAttachmentStatus('ready'); setAttachmentStatusMessage(''); setAttachmentFileCount(null); }} aria-label="Remove attached file" title="Remove file" className="rounded-lg p-1.5 text-white/45 hover:bg-white/10 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {selectedImages.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 p-2 bg-white/5 rounded-xl border border-white/10 w-fit animate-in zoom-in-95 duration-300 max-w-full">
            {selectedImages.map((image, index) => (
              <div key={`${image}-${index}`} className="relative w-12 h-12 rounded-lg overflow-hidden border border-accent/20">
                <img src={image} alt={`Injection Preview ${index + 1}`} className="object-cover w-full h-full" />
                <button
                  type="button"
                  onClick={() => setSelectedImages((prev) => prev.filter((_, i) => i !== index))}
                  className="absolute top-0.5 right-0.5 p-0.5 bg-black/60 rounded-full text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <div className="flex flex-col ml-1">
              <span className="text-[8px] font-black text-accent uppercase tracking-widest">
                {effectiveCreator ? 'Unlimited optical nodes' : `${selectedImages.length}/${maxImagesPerMessage} ready`}
              </span>
            </div>
          </div>
        )}

        <div className="flex items-end gap-2.5">
          <div
            className={`input-pill flex-1 min-h-[56px] ${isListening || selectedImages.length || selectedFile ? 'ring-1 ring-primary/30' : ''}`}
          >
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/*"
              multiple
              onChange={handleImageSelect}
            />
            <input
              type="file"
              ref={documentInputRef}
              className="hidden"
              onChange={handleFileSelect}
            />
            <input
              type="file"
              ref={folderInputRef}
              className="hidden"
              multiple
              onChange={handleFolderSelect}
            />

            <button
              type="button"
              onClick={() => {
                if (fileInputRef.current) fileInputRef.current.value = '';
                fileInputRef.current?.click();
              }}
              className="h-10 w-10 mb-1 shrink-0 rounded-full flex items-center justify-center text-white/30 hover:text-primary hover:bg-white/[0.05] transition-all"
              title="Attach image"
            >
              <Camera className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => documentInputRef.current?.click()}
              disabled={interfaceMode === 'admin'}
              className="h-10 w-10 mb-1 shrink-0 rounded-full flex items-center justify-center text-white/30 hover:text-primary hover:bg-white/[0.05] transition-all disabled:opacity-30"
              title="Attach any file"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => folderInputRef.current?.click()}
              disabled={interfaceMode === 'admin'}
              className="h-10 w-10 mb-1 shrink-0 rounded-full flex items-center justify-center text-white/30 hover:text-primary hover:bg-white/[0.05] transition-all disabled:opacity-30"
              title="Attach a folder"
            >
              <FolderOpen className="w-5 h-5" />
            </button>

            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isListening
                  ? 'Listening...'
                  : interfaceMode === 'admin'
                    ? 'Admin command...'
                    : `Message Jimskay AI (${activeMode.toUpperCase()} mode)`
              }
              className="flex-1 min-h-[48px] max-h-[240px] resize-none bg-transparent border-0 focus-visible:ring-0 text-[16px] md:!text-[16px] font-medium py-3.5 text-white scrollbar-none leading-relaxed placeholder:text-white/25"
              rows={1}
            />

            <button
              type="button"
              onClick={toggleListening}
              className={`h-10 w-10 mb-1 shrink-0 rounded-full flex items-center justify-center transition-all ${
                isListening ? 'text-primary animate-pulse bg-primary/10' : 'text-white/30 hover:text-primary hover:bg-white/[0.05]'
              }`}
              title="Voice input"
            >
              <Mic className="w-5 h-5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => handleSend()}
            disabled={(!input.trim() && !selectedImages.length && !selectedFile) || isLoading}
            className="h-[56px] w-[56px] shrink-0 rounded-2xl gradient-primary text-white flex items-center justify-center shadow-[0_0_24px_rgba(168,85,247,0.4)] transition-all hover:shadow-[0_0_32px_rgba(168,85,247,0.6)] active:scale-95 disabled:opacity-40 disabled:shadow-none"
            title="Send"
          >
            {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6 ml-0.5" />}
          </button>
        </div>

        <p className="text-center text-[10px] text-white/20 font-medium tracking-wide">
          Jimskay AI can make mistakes. Persistent background tasks survive sleep &amp; restarts.
        </p>
      </div>
    </footer>
  );
}