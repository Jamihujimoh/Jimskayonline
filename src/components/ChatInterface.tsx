"use client"
import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { ChatHeader } from '@/components/ChatHeader';
import { MessageList } from '@/components/MessageList';
import { ChatInput } from '@/components/ChatInput';
import { ChatSettingsDrawer } from '@/components/ChatSettingsDrawer';
import { PcControlPanel } from '@/components/PcControlPanel';
import { PhoneControlPanel, type PhoneConsentMode } from '@/components/PhoneControlPanel';
import type { InterfaceMode } from '@/components/AdminModeToggle';
import { useUser } from '@/firebase';
import { useRouter, useSearchParams } from 'next/navigation';
import { useBackgroundTasks } from '@/hooks/use-background-tasks';
import { useChatPreferences } from '@/hooks/use-chat-preferences';
import { useChatBackgroundEvents } from '@/hooks/use-chat-background-events';
import { useChatSearch } from '@/hooks/use-chat-search';
import { cn } from '@/lib/utils';
import { DEFAULT_CHAT_MODEL, isChatModelId, type ChatModelId } from '@/lib/chat-models';

export function ChatInterface({ onBackToLanding }: { onBackToLanding: () => void }) {
  const { user } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [currentChatId, setCurrentChatId] = useState<string | null>(searchParams.get('id'));
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isChatThinking, setIsChatThinking] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pcPanelOpen, setPcPanelOpen] = useState(false);
  const [phonePanelOpen, setPhonePanelOpen] = useState(false);
  const [phoneConsentMode, setPhoneConsentMode] = useState<PhoneConsentMode>('ask');
  const [selectedModel, setSelectedModel] = useState<ChatModelId>(DEFAULT_CHAT_MODEL);
  const { interfaceMode, adminUnlocked, adminPin, changeMode, changeAdminUnlocked } = useChatPreferences();

  useEffect(() => {
    if (!user?.uid) {
      setPhoneConsentMode('ask');
      return;
    }
    const savedModel = window.localStorage.getItem('jimskay-chat-model');
    if (isChatModelId(savedModel || undefined)) setSelectedModel(savedModel as ChatModelId);
    const savedPhoneConsent = window.localStorage.getItem(`jimskay-phone-consent:${user.uid}`);
    if (savedPhoneConsent === 'ask' || savedPhoneConsent === 'allowAll') setPhoneConsentMode(savedPhoneConsent);
    else setPhoneConsentMode('ask');
  }, [user?.uid]);

  const handlePhoneConsentChange = (mode: PhoneConsentMode) => {
    setPhoneConsentMode(mode);
    if (user?.uid) window.localStorage.setItem(`jimskay-phone-consent:${user.uid}`, mode);
  };

  const handleModelChange = (model: ChatModelId) => {
    setSelectedModel(model);
    window.localStorage.setItem('jimskay-chat-model', model);
  };

  const {
    tasks: backgroundTasks,
    registerTask,
    removeTask,
    clearFinished,
    activeCount: activeTaskCount,
  } = useBackgroundTasks(user?.uid);

  // Sync state with URL parameters
  useEffect(() => {
    const idFromUrl = searchParams.get('id');
    if (idFromUrl !== currentChatId) {
      setCurrentChatId(idFromUrl);
    }
  }, [searchParams, currentChatId]);

  useChatBackgroundEvents(registerTask);
  const { searchQuery, setSearchQuery, isSearching, isAiThinking: isSearchThinking, handleWebSearch } = useChatSearch(user, currentChatId);
  const isAiThinking = isChatThinking || isSearchThinking;

  const handleSelectChat = (id: string | null) => {
    if (id) {
      router.push(`/chat?id=${id}`);
    } else {
      setCurrentChatId(null);
      router.push('/chat');
    }
    setIsSidebarOpen(false);
  };

  return (
    <div className="flex h-[100dvh] w-full bg-background overflow-hidden fixed inset-0">
      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 z-[60] bg-black/70 transition-opacity duration-300 md:hidden ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsSidebarOpen(false)}
      />

      {/* Sidebar: permanent on desktop (collapsible), off-canvas on mobile */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-[70] h-full w-[340px] bg-[#0e0f22] border-r border-white/[0.06] transition-all duration-300 transform md:relative md:translate-x-0 shrink-0',
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          isSidebarCollapsed ? 'md:w-0 md:overflow-hidden md:border-0' : 'md:w-[340px]'
        )}
      >
        <Sidebar
          currentChatId={currentChatId}
          onSelectChat={handleSelectChat}
          onClose={() => setIsSidebarOpen(false)}
        />
      </aside>

      {/* Full canvas workspace */}
      <div className="flex-1 flex flex-col min-w-0 bg-background relative h-[100dvh] overflow-hidden">
        <ChatHeader
          onToggleSidebar={() => setIsSidebarOpen(true)}
          onToggleSidebarDesktop={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          onBack={onBackToLanding}
          onOpenSettings={() => setSettingsOpen(true)}
          interfaceMode={interfaceMode}
          adminUnlocked={adminUnlocked}
          backgroundTasks={backgroundTasks}
          activeTaskCount={activeTaskCount}
          onRemoveTask={removeTask}
          onClearFinishedTasks={clearFinished}
          selectedModel={selectedModel}
          onModelChange={handleModelChange}
        />

        <div className="flex-1 min-h-0 relative overflow-hidden">
          <MessageList chatId={currentChatId} isAiThinking={isAiThinking} />
        </div>

        <div className="shrink-0 bg-background">
          <ChatInput
            chatId={currentChatId}
            onChatCreated={(id) => router.push(`/chat?id=${id}`)}
            onThinkingChange={setIsChatThinking}
            interfaceMode={interfaceMode}
            adminPin={adminPin}
            phoneConsentMode={phoneConsentMode}
            selectedModel={selectedModel}
          />
        </div>
      </div>

      {/* Control Center — all admin / search / environment settings live here */}
      <ChatSettingsDrawer
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        interfaceMode={interfaceMode}
        adminUnlocked={adminUnlocked}
        onModeChange={changeMode}
        onUnlockedChange={changeAdminUnlocked}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onWebSearch={handleWebSearch}
        isSearching={isSearching}
        backgroundTasks={backgroundTasks}
        activeTaskCount={activeTaskCount}
        onRemoveTask={removeTask}
        onClearFinishedTasks={clearFinished}
        currentChatId={currentChatId}
      />

      {/* PC Control — full window automation panel (admin only) */}
      {adminUnlocked && (
        <>
          <PcControlPanel pin={adminPin} open={pcPanelOpen} onOpenChange={setPcPanelOpen} />
          <PhoneControlPanel
            pin={adminPin}
            userId={user?.uid ?? ''}
            open={phonePanelOpen}
            onOpenChange={setPhonePanelOpen}
            consentMode={phoneConsentMode}
            onConsentModeChange={handlePhoneConsentChange}
          />
        </>
      )}
    </div>
  );
}