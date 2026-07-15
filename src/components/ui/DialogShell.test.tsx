// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { DialogShell } from './DialogShell';

afterEach(cleanup);

function setup() {
  const onClose = vi.fn();
  const utils = render(
    <DialogShell onClose={onClose} labelledBy="t" boxClassName="box">
      <span id="t">Title</span>
      <input aria-label="field" />
    </DialogShell>,
  );
  const backdrop = utils.getByRole('dialog');
  const input = utils.getByLabelText('field');
  return { onClose, backdrop, input };
}

describe('DialogShell close mechanics', () => {
  it('backdrop interactions never dismiss (stray click or selection drag)', () => {
    // Historic bug: any backdrop click closed, which a selection drag released
    // past the dialog edge also fired (click targets the common ancestor).
    const { onClose, backdrop, input } = setup();
    fireEvent.pointerDown(backdrop);
    fireEvent.pointerUp(backdrop);
    fireEvent.click(backdrop);
    fireEvent.pointerDown(input);
    fireEvent.pointerUp(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Escape closes', () => {
    const { onClose, backdrop } = setup();
    fireEvent.keyDown(backdrop, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
