import { render, screen } from '../../../tests/helpers/render'
import userEvent from '@testing-library/user-event'
import type { Collection } from '@trek/shared'
import { useTranslation } from '../../i18n/TranslationContext'
import { ToastContainer } from '../shared/Toast'
import ListEditorModal from './ListEditorModal'
import type { ListEditorAdapter } from './ListEditorModal'

function Harness(props: Omit<React.ComponentProps<typeof ListEditorModal>, 't'>) {
  const { t } = useTranslation()
  return (
    <>
      <ToastContainer />
      <ListEditorModal {...props} t={t} />
    </>
  )
}

const list: Collection = {
  id: 'list-1' as unknown as number,
  owner_id: 'p1' as unknown as number,
  name: 'Eats',
  color: '#6366f1',
  place_count: 0,
  is_owner: true,
}

function renderEditor(overrides: Partial<React.ComponentProps<typeof ListEditorModal>> = {}) {
  const adapter: ListEditorAdapter = {
    createCollection: vi.fn().mockResolvedValue({ id: 'new-1' }),
    updateCollection: vi.fn().mockResolvedValue(undefined),
    uploadCover: vi.fn().mockResolvedValue(undefined),
  }
  const props = {
    target: 'new' as const,
    onClose: vi.fn(),
    onCreated: vi.fn(),
    onRequestDelete: vi.fn(),
    familyChrome: true,
    adapter,
    ...overrides,
  }
  render(<Harness {...props} />)
  return props
}

describe('ListEditorModal Family cover', () => {
  it('does not toast coverLater and uploads a picked file on create', async () => {
    const user = userEvent.setup()
    const { adapter, onCreated } = renderEditor()
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'cover.jpg', { type: 'image/jpeg' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, file)
    await user.type(screen.getByPlaceholderText('e.g. Tokyo 2025'), 'Tokyo')
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(adapter.createCollection).toHaveBeenCalled()
    expect(adapter.uploadCover).toHaveBeenCalledWith('new-1', expect.any(File))
    expect(onCreated).toHaveBeenCalledWith('new-1')
    expect(screen.queryByText(/arrive later/i)).not.toBeInTheDocument()
  })

  it('clears an existing cover on save', async () => {
    const user = userEvent.setup()
    const { adapter } = renderEditor({
      target: { ...list, cover_image: 'https://signed.example/old.jpg' },
    })
    await user.click(screen.getByRole('button', { name: 'Remove cover' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(adapter.updateCollection).toHaveBeenCalledWith(
      list.id,
      expect.objectContaining({ clearCover: true }),
    )
    expect(adapter.uploadCover).not.toHaveBeenCalled()
  })
})
