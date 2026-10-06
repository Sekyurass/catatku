import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Select, type SelectOption } from './Select';

const OPTIONS: SelectOption[] = [
  { value: '', label: 'Semua dompet' },
  { value: 'w1', label: 'Tunai', detail: 'Rp 2.394.000' },
  { value: 'w2', label: 'BCA', detail: 'Rp 6.800.000' },
  { value: 'w3', label: 'GoPay', detail: 'Rp 685.000' },
];

function Harness({ onChange }: { onChange?: (v: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <>
      <label htmlFor="s">Dompet</label>
      <Select
        id="s"
        value={value}
        options={OPTIONS}
        onChange={(v) => {
          setValue(v);
          onChange?.(v);
        }}
      />
    </>
  );
}

describe('Select', () => {
  it('terhubung ke label dan menampilkan opsi terpilih beserta detailnya', async () => {
    render(<Harness />);
    const combo = screen.getByRole('combobox', { name: 'Dompet' });
    expect(combo).toHaveTextContent('Semua dompet');
    expect(combo).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(combo);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('option', { name: /BCA/ }));
    expect(combo).toHaveTextContent('BCA');
    expect(combo).toHaveTextContent('Rp 6.800.000');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(combo).toHaveFocus();
  });

  it('bisa dipakai penuh dengan keyboard', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const combo = screen.getByRole('combobox', { name: 'Dompet' });
    combo.focus();

    await userEvent.keyboard('{ArrowDown}');
    expect(combo).toHaveAttribute('aria-expanded', 'true');
    const activeLabel = () =>
      document.getElementById(combo.getAttribute('aria-activedescendant')!)?.textContent;
    expect(activeLabel()).toContain('Semua dompet');

    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(activeLabel()).toContain('BCA');
    await userEvent.keyboard('{End}');
    expect(activeLabel()).toContain('GoPay');
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('w3');
    expect(combo).toHaveAttribute('aria-expanded', 'false');

    // Ketik huruf untuk melompat ke opsi yang diawali huruf itu.
    await userEvent.keyboard('t');
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('w1');
  });

  it('Esc menutup daftar tanpa diteruskan ke dialog induk', async () => {
    const onParentKey = vi.fn();
    render(
      <div onKeyDown={(e) => e.key === 'Escape' && onParentKey()}>
        <Harness />
      </div>,
    );
    const combo = screen.getByRole('combobox', { name: 'Dompet' });
    await userEvent.click(combo);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onParentKey).not.toHaveBeenCalled();
  });

  it('klik di luar menutup daftar', async () => {
    render(
      <>
        <Harness />
        <p>Luar</p>
      </>,
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Dompet' }));
    await userEvent.click(screen.getByText('Luar'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
