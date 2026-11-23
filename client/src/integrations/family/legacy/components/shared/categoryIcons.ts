import type { LucideIcon } from 'lucide-react';
import {
  COMMON_CATEGORY_ICON_MAP,
  COMMON_ICON_LABELS,
  resolveCategoryIcon,
} from '../../../../../components/shared/categoryIcons';

export const CATEGORY_ICON_MAP: Record<string, LucideIcon> = { ...COMMON_CATEGORY_ICON_MAP };
export const ICON_LABELS: Record<string, string> = { ...COMMON_ICON_LABELS };

export function getCategoryIcon(iconName: string | null | undefined): LucideIcon {
  return resolveCategoryIcon(CATEGORY_ICON_MAP, iconName);
}
