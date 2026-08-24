import { Code2 } from 'lucide-react';
import type { CSSProperties, ReactElement } from 'react';
import { useTranslation } from '../../i18n';
import { SOURCE_CODE_URL } from '../../legal/sourceOffer';

type SourceCodeLabelKey = 'login.sourceCode' | 'help.sourceCode' | 'settings.about.sourceCode';

type Props = {
  labelKey?: SourceCodeLabelKey;
  variant?: 'plain' | 'card';
  style?: CSSProperties;
};

export default function SourceCodeLink({
  labelKey = 'login.sourceCode',
  variant = 'plain',
  style,
}: Props): ReactElement {
  const { t } = useTranslation();
  const label = t(labelKey);

  if (variant === 'card') {
    return (
      <a
        href={SOURCE_CODE_URL}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="source-code-link"
        className="flex items-center gap-4 overflow-hidden rounded-xl border border-edge bg-surface-card px-5 py-4 no-underline transition-[border-color,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]"
        style={style}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#0f766e';
          e.currentTarget.style.boxShadow = '0 0 0 1px #0f766e22';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-primary)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        <div
          className="bg-[#0f766e15]"
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Code2 size={20} className="text-[#0f766e]" />
        </div>
        <div>
          <div className="text-sm font-semibold text-content">{label}</div>
          <div className="text-xs text-content-faint">{t('settings.about.sourceCodeHint')}</div>
        </div>
      </a>
    );
  }

  return (
    <a
      href={SOURCE_CODE_URL}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="source-code-link"
      style={style}
    >
      {label}
    </a>
  );
}
