import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Amount } from '../../src/web/components/Amount';
import { AmountVisibilityProvider, useAmountVisibility } from '../../src/web/lib/amountVisibility';

const Toggle = () => <button onClick={useAmountVisibility().toggle}>숨기기</button>;

it('shows the amount and hides it on demand', () => {
  render(<AmountVisibilityProvider><Amount value={-12000} /><Amount value={3000} signed /><Toggle /></AmountVisibilityProvider>);
  expect(screen.getByText('-12,000원')).toBeTruthy();
  expect(screen.getByText('+3,000원')).toBeTruthy();
  fireEvent.click(screen.getByText('숨기기'));
  expect(screen.queryByText('-12,000원')).toBeNull();
  expect(screen.getAllByText('•••원')).toHaveLength(2);
});
