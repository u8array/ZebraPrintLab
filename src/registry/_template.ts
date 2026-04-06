// Template for new object types.
// 1. Copy and rename this file (e.g. ean13.ts)
// 2. Define the Props interface
// 3. Implement ObjectTypeDefinition
// 4. Add an entry in registry/index.ts

import type { ObjectTypeDefinition } from '../types/ObjectType';

interface TemplateProps {
  content: string;
}

export const _template: ObjectTypeDefinition<TemplateProps> = {
  label: 'Template',
  icon: '?',
  defaultProps: {
    content: '',
  },
  defaultSize: { width: 200, height: 50 },
  toZPL: (): string => {
    return '';
  },
  PropertiesPanel: () => null,
};
