import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '../../../tests/helpers/render';
import { resetAllStores } from '../../../tests/helpers/store';
import { SOURCE_CODE_URL } from '../../legal/sourceOffer';
import SourceCodeLink from './SourceCodeLink';

beforeEach(() => {
  resetAllStores();
});

describe('SourceCodeLink', () => {
  it('exposes the AGPL corresponding-source URL without requiring authentication', () => {
    render(<SourceCodeLink />);
    const link = screen.getByTestId('source-code-link');
    expect(link).toHaveAttribute('href', SOURCE_CODE_URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveTextContent(/source code \(agpl-3\.0\)/i);
  });
});
