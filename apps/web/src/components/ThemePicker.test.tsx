import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { setThemePreference } from '../lib/theme';
import { ThemePicker } from './ThemePicker';

describe('ThemePicker', () => {
  afterEach(() => setThemePreference('system'));

  it('menerapkan dan mengingat pilihan tema', async () => {
    render(<ThemePicker />);
    expect(screen.getByRole('radio', { name: 'Sistem' })).toBeChecked();

    await userEvent.click(screen.getByRole('radio', { name: 'Gelap' }));
    expect(screen.getByRole('radio', { name: 'Gelap' })).toBeChecked();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('catatku_theme')).toBe('dark');

    await userEvent.click(screen.getByRole('radio', { name: 'Terang' }));
    expect(document.documentElement.dataset.theme).toBe('light');

    await userEvent.click(screen.getByRole('radio', { name: 'Sistem' }));
    expect(localStorage.getItem('catatku_theme')).toBeNull();
  });
});
