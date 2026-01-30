import * as fs from 'fs';
import * as path from 'path';
import { Field, Model } from './types';

export function parsePrismaSchema(schema: string): Model[] {
  const models: Model[] = [];
  const modelRegex = /model\s+(\w+)\s+{([\s\S]*?)}/g;
  let match;

  while ((match = modelRegex.exec(schema)) !== null) {
    const modelName = match[1];
    const modelBody = match[2];
    const fields: Field[] = [];

    const fieldLines = modelBody.split('\n');
    fieldLines.forEach((line) => {
      const fieldMatch = line.trim().match(/^(\w+)\s+(\w+)(\[\])?(\?)?(\s+.*)?$/);
      if (fieldMatch) {
        const [_, name, type, isArray, isOptional, rest] = fieldMatch;
        const isEnum = new RegExp(`\\benum\\s+${type}\\b`).test(schema);
        const isRelation =
          rest?.includes('@relation') ||
          (!['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json', 'Decimal'].includes(type) &&
            !isEnum);
        const isSystem = ['id', 'createdAt', 'updatedAt'].includes(name);
        const hasDefault = rest?.includes('@default');

        fields.push({
          name,
          type,
          isOptional: !!isOptional,
          isArray: !!isArray,
          isEnum,
          isRelation,
          isSystem,
          hasDefault,
        });
      }
    });

    models.push({
      name: modelName,
      singular: modelName.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase(),
      plural: `${modelName.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}s`,
      fields,
    });
  }

  return models;
}

export function generateFile(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content.trim() + '\n');
}
