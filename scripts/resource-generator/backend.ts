import { Model } from './types';

export function generateEntityContent(model: Model): string {
  const filteredFields = model.fields.filter((f) => !f.isRelation);
  const enumFields = model.fields.filter((f) => f.isEnum && !f.isRelation);

  let imports =
    "// This file is auto-generated. Do not edit.\n\nimport { ApiProperty } from '@nestjs/swagger';\n";
  if (enumFields.length > 0) {
    const enums = [...new Set(enumFields.map((f) => f.type))].sort();
    imports += `import { ${enums.join(', ')} } from '../../../prisma/enums';\n`;
  }

  let fields = '';
  filteredFields.forEach((f) => {
    let type = f.type;
    if (type === 'String') type = 'string';
    if (type === 'Int' || type === 'Float' || type === 'Decimal') type = 'number';
    if (type === 'Boolean') type = 'boolean';
    if (type === 'DateTime') type = 'Date';
    if (type === 'Json') type = 'Record<string, unknown>';

    fields += `  @ApiProperty({ required: ${!f.isOptional} })\n`;
    fields += `  ${f.name}${f.isOptional ? '?' : ''}: ${type};\n\n`;
  });

  return `${imports}
export class ${model.name} {
${fields}}
`;
}

export function generateCreateDtoContent(model: Model): string {
  const filteredFields = model.fields.filter((f) => !f.isSystem && !f.isRelation && !f.isArray);
  const enumFields = model.fields.filter((f) => f.isEnum && !f.isSystem && !f.isRelation);

  let schemaFields = '';
  filteredFields.forEach((f) => {
    let zodType = '';
    if (f.isEnum) {
      zodType = `z.enum(${f.type})`;
    } else if (f.name.endsWith('Id')) {
      zodType = 'z.uuid()';
    } else {
      switch (f.type) {
        case 'String':
          zodType = 'z.string()';
          break;
        case 'Int':
          zodType = 'z.number().int()';
          break;
        case 'Float':
        case 'Decimal':
          zodType = 'z.number()';
          break;
        case 'Boolean':
          zodType = 'z.boolean()';
          break;
        case 'DateTime':
          zodType = 'z.iso.datetime()';
          break;
        case 'Json':
          zodType = 'z.any()'; // We map this to Record<string, unknown> in frontend.ts
          break;
        default:
          zodType = 'z.unknown()';
      }
    }

    if (f.isOptional) zodType += '.nullable()';
    if (f.isOptional || f.hasDefault) zodType += '.optional()';
    schemaFields += `  ${f.name}: ${zodType},\n`;
  });

  let imports =
    "// This file is auto-generated. Do not edit.\n\nimport { createZodDto } from 'nestjs-zod';\nimport { z } from 'zod';\n";
  if (enumFields.length > 0) {
    const enums = [...new Set(enumFields.map((f) => f.type))].sort();
    imports += `import { ${enums.join(', ')} } from '../../../../prisma/enums';\n`;
  }

  return `${imports}
export const Create${model.name}Schema = z.object({
${schemaFields}});

export class Create${model.name}Dto extends createZodDto(Create${model.name}Schema) {}
`;
}

export function generateUpdateDtoContent(model: Model): string {
  return `// This file is auto-generated. Do not edit.

import { createZodDto } from 'nestjs-zod';
import { Create${model.name}Schema } from './create-${model.singular}.dto';

export const Update${model.name}Schema = Create${model.name}Schema.partial();

export class Update${model.name}Dto extends createZodDto(Update${model.name}Schema) {}
`;
}

export function generateRelationEnumContent(model: Model): string {
  const relationFields = model.fields.filter((f) => f.isRelation);
  if (relationFields.length === 0) return '';

  let content = '// This file is auto-generated. Do not edit.\n\n';
  content += `export enum ${model.name}Relations {\n`;
  relationFields.forEach((f) => {
    content += `  ${f.name.toUpperCase()} = '${f.name}',\n`;
  });
  content += `}\n`;
  return content;
}
