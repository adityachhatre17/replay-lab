import React from 'react';
import { Moon, Sun } from 'lucide-react';

export default function ThemeToggle({ dark, onToggle }) {
  return <button type="button" className="theme-toggle" aria-label="Dark theme" aria-pressed={dark} onClick={onToggle}>
    {dark ? <Moon size={16} /> : <Sun size={16} />}
    <span>{dark ? 'Dark' : 'Light'} theme</span>
    <span className="theme-switch" aria-hidden="true" />
  </button>;
}
