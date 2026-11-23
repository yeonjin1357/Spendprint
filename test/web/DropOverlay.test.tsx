import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { DropOverlay } from '../../src/web/features/import/DropOverlay';

it('appears while a file is dragged and hands over the dropped files', () => {
  const onFiles = vi.fn();
  render(<DropOverlay onFiles={onFiles} />);
  expect(screen.queryByText('여기에 놓으면 가져올게요')).toBeNull();
  fireEvent.dragEnter(window, { dataTransfer: { types: ['Files'] } });
  expect(screen.getByText('여기에 놓으면 가져올게요')).toBeTruthy();
  const file = new File([new Uint8Array([1])], 'a.xlsx');
  fireEvent.drop(window, { dataTransfer: { types: ['Files'], files: [file] } });
  expect(onFiles).toHaveBeenCalledWith([file]);
  expect(screen.queryByText('여기에 놓으면 가져올게요')).toBeNull();
});

it('ignores drags that are not files', () => {
  render(<DropOverlay onFiles={vi.fn()} />);
  fireEvent.dragEnter(window, { dataTransfer: { types: ['text/plain'] } });
  expect(screen.queryByText('여기에 놓으면 가져올게요')).toBeNull();
});
