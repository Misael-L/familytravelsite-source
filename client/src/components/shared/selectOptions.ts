import type { ReactNode } from 'react';

export interface SelectOption {
  value: string | number;
  label: string;
  icon?: ReactNode;
  isHeader?: boolean;
  searchLabel?: string;
  groupLabel?: string;
  badge?: string;
}

export function filterSelectOptions(options: SelectOption[], query: string): SelectOption[] {
  if (!query) return options;
  const search = query.toLowerCase();
  const matches: SelectOption[] = [];
  let heading: SelectOption | null = null;
  let headingIncluded = false;
  for (const option of options) {
    if (option.isHeader) {
      heading = option;
      headingIncluded = false;
      continue;
    }
    const searchText = [option.label, option.searchLabel, option.groupLabel].filter(Boolean).join(' ').toLowerCase();
    if (!searchText.includes(search)) continue;
    if (heading && !headingIncluded) {
      matches.push(heading);
      headingIncluded = true;
    }
    matches.push(option);
  }
  return matches;
}
