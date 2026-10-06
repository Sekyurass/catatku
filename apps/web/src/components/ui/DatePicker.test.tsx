import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { DatePicker } from './DatePicker';

function Harness({
  initial = '',
  min,
  max,
  clearable,
}: {
  initial?: string;
  min?: string;
  max?: string;
  clearable?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <label htmlFor="d">Tanggal</label>
      <DatePicker
        id="d"
        value={value}
        onChange={setValue}
        min={min}
        max={max}
        clearable={clearable}
      />
      <output>{value || 'kosong'}</output>
    </>
  );
}

const trigger = () => screen.getByRole('button', { name: 'Tanggal' });

describe('DatePicker', () => {
  it('menampilkan tanggal dalam format Indonesia dan kalender mulai hari Senin', async () => {
    render(<Harness initial="2026-10-05" />);
    expect(trigger()).toHaveTextContent('Sen, 5 Okt 2026');

    await userEvent.click(trigger());
    expect(screen.getByRole('dialog', { name: 'Pilih tanggal' })).toBeInTheDocument();
    expect(screen.getByText('Oktober 2026')).toBeInTheDocument();
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']);

    const selected = screen.getByRole('button', { name: 'Senin, 5 Oktober 2026' });
    expect(selected).toHaveAttribute('aria-pressed', 'true');
    expect(selected).toHaveFocus();
  });

  it('memilih dengan klik lalu menutup dan mengembalikan fokus', async () => {
    render(<Harness initial="2026-10-05" />);
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole('button', { name: 'Senin, 12 Oktober 2026' }));
    expect(screen.getByRole('status')).toHaveTextContent('2026-10-12');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it('navigasi keyboard: panah, PageDown, Enter', async () => {
    render(<Harness initial="2026-10-31" />);
    await userEvent.click(trigger());
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: 'Minggu, 1 November 2026' })).toHaveFocus();
    expect(screen.getByText('November 2026')).toBeInTheDocument();
    await userEvent.keyboard('{ArrowUp}{PageDown}');
    expect(screen.getByRole('button', { name: 'Rabu, 25 November 2026' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('status')).toHaveTextContent('2026-11-25');
  });

  it('tanggal di luar min/max tidak bisa dipilih', async () => {
    render(<Harness initial="2026-10-10" min="2026-10-05" max="2026-10-20" />);
    await userEvent.click(trigger());
    expect(screen.getByRole('button', { name: 'Minggu, 4 Oktober 2026' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Rabu, 21 Oktober 2026' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Bulan sebelumnya' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Bulan berikutnya' })).toBeDisabled();
  });

  it('bisa dikosongkan bila clearable, Esc menutup', async () => {
    render(<Harness initial="2026-10-10" clearable />);
    await userEvent.click(trigger());
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole('button', { name: 'Hapus' }));
    expect(screen.getByRole('status')).toHaveTextContent('kosong');
    expect(trigger()).toHaveTextContent('Pilih tanggal');
  });
});
