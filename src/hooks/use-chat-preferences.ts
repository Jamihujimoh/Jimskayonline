import { useEffect, useState } from 'react';
import type { InterfaceMode } from '@/components/AdminModeToggle';

const MODE_KEY = 'jimskay-interface-mode';
const ADMIN_KEY = 'jimskay-admin-unlocked';
const ADMIN_PIN_KEY = 'jimskay-admin-pin';

export function useChatPreferences() {
  const [interfaceMode, setInterfaceMode] = useState<InterfaceMode>('ask');
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminPin, setAdminPin] = useState('');

  useEffect(() => {
    const savedMode = window.localStorage.getItem(MODE_KEY);
    const savedPin = window.sessionStorage.getItem(ADMIN_PIN_KEY) || '';
    const unlocked = window.sessionStorage.getItem(ADMIN_KEY) === '1' && savedPin.length > 0;
    setAdminUnlocked(unlocked);
    setAdminPin(unlocked ? savedPin : '');

    if (!unlocked) window.sessionStorage.removeItem(ADMIN_KEY);

    if (savedMode === 'ask') {
      setInterfaceMode('ask');
      return;
    }

    if (savedMode === 'admin') {
      setInterfaceMode(unlocked ? 'admin' : 'ask');
      return;
    }

    if (unlocked) setInterfaceMode('admin');
  }, []);

  const changeMode = (mode: InterfaceMode) => {
    setInterfaceMode(mode);
    window.localStorage.setItem(MODE_KEY, mode);
  };

  const changeAdminUnlocked = (unlocked: boolean, pin = '') => {
    const normalizedPin = pin.trim();
    setAdminUnlocked(unlocked);
    setAdminPin(unlocked ? normalizedPin : '');
    window.sessionStorage.setItem(ADMIN_KEY, unlocked ? '1' : '0');
    if (unlocked && normalizedPin) window.sessionStorage.setItem(ADMIN_PIN_KEY, normalizedPin);
    else window.sessionStorage.removeItem(ADMIN_PIN_KEY);
    if (!unlocked) {
      setInterfaceMode('ask');
      window.localStorage.setItem(MODE_KEY, 'ask');
    }
  };

  return { interfaceMode, adminUnlocked, adminPin, changeMode, changeAdminUnlocked };
}
