// Template für neue Objekt-Typen.
// 1. Datei kopieren und umbenennen (z.B. ean13.ts)
// 2. Props-Interface definieren
// 3. ObjectTypeDefinition implementieren
// 4. Eintrag in registry/index.ts hinzufügen

import type { ObjectTypeDefinition, LabelObject } from '../types/ObjectType';

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
  toZPL: (_obj: LabelObject): string => {
    return '';
  },
  PropertiesPanel: () => null,
};
