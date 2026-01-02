import * as fs from 'fs';
import * as path from 'path';

export interface Field {
  name: string;
  type: string;
  isOptional: boolean;
  isArray: boolean;
  isRelation: boolean;
  isSystem: boolean;
}

export interface Model {
  name: string;
  singular: string;
  fields: Field[];
}

export type Models = Record<string, Model>;

/**
 * Parses fields from a Prisma model body
 */
export function parseFields(body: string): Field[] {
  const lines = body.split('\n');
  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) {
        return null;
      }

      const parts = trimmed.split(/\s+/);
      if (parts.length < 2) return null;

      const name = parts[0];
      const type = parts[1];

      const isSystem =
        trimmed.includes('@id') ||
        trimmed.includes('@default(now())') ||
        trimmed.includes('@updatedAt');
      const isOptional = type.endsWith('?');
      const cleanType = type.replace('?', '');
      const isArray = cleanType.endsWith('[]');
      const baseType = cleanType.replace('[]', '');
      const isRelation = ![
        'String',
        'Int',
        'Float',
        'Boolean',
        'DateTime',
        'Json',
      ].includes(baseType);

      return {
        name,
        type: baseType,
        isOptional,
        isArray,
        isRelation,
        isSystem,
      };
    })
    .filter((f): f is Field => f !== null);
}

/**
 * Maps Prisma types to TypeScript types
 */
export function mapType(prismaType: string): string {
  switch (prismaType) {
    case 'String':
      return 'string';
    case 'Int':
    case 'Float':
      return 'number';
    case 'Boolean':
      return 'boolean';
    case 'DateTime':
      return 'Date';
    default:
      return prismaType;
  }
}

/**
 * Generates an interface file content (no swagger decorators)
 */
export function generateInterfaceContent(model: Model, allModels: Models): string {
  const relationFields = model.fields.filter((f) => f.isRelation);

  let imports = '';
  relationFields.forEach((f) => {
    const relModel = allModels[f.type];
    if (relModel && relModel.name !== model.name) {
      imports += `import { ${relModel.name} } from './${relModel.singular}.interface';\n`;
    }
  });

  let content = imports;
  if (imports) content += '\n';
  content += `export interface ${model.name} {\n`;

  model.fields.forEach((f) => {
    const tsType = mapType(f.type);
    const suffix = f.isOptional ? '?' : '';
    const arraySuffix = f.isArray ? '[]' : '';

    content += `  ${f.name}${suffix}: ${tsType}${arraySuffix};\n`;
  });
  content += `}\n`;
  return content;
}

/**
 * Generates an entity file content (with swagger decorators)
 */
export function generateEntityContent(model: Model, allModels: Models): string {
  const relationFields = model.fields.filter((f) => f.isRelation);

  let imports = "import { ApiProperty } from '@nestjs/swagger';\n";
  relationFields.forEach((f) => {
    const relModel = allModels[f.type];
    if (relModel && relModel.name !== model.name) {
      imports += `import { ${relModel.name} } from './${relModel.singular}.entity';\n`;
    }
  });

  let content = imports;
  if (imports) content += '\n';
  content += `export class ${model.name} {\n`;

  model.fields.forEach((f, index) => {
    const tsType = mapType(f.type);
    const suffix = f.isOptional ? '?' : '';
    const arraySuffix = f.isArray ? '[]' : '';

    if (f.isRelation) {
      content += `  @ApiProperty({ type: () => ${tsType}, isArray: ${f.isArray}, required: ${!f.isOptional} })\n`;
    } else if (tsType === 'Date') {
      content += `  @ApiProperty({ type: 'string', format: 'date-time', required: ${!f.isOptional} })\n`;
    } else {
      content += `  @ApiProperty({ type: '${tsType}', required: ${!f.isOptional}${f.name === 'id' ? ", format: 'uuid'" : ''} })\n`;
    }

    content += `  ${f.name}${suffix}: ${tsType}${arraySuffix};\n`;
    if (index < model.fields.length - 1) {
      content += '\n';
    }
  });
  content += `}\n`;
  return content;
}

/**
 * Generates Create DTO content
 */
export function generateCreateDtoContent(model: Model): string {
  const validatorImports = new Set<string>();
  let fieldsContent = '';
  const filteredFields = model.fields.filter(
    (f) => !f.isSystem && !f.isRelation && !f.isArray,
  );

  filteredFields.forEach((f, index) => {
    fieldsContent += `  @ApiProperty({ required: ${!f.isOptional} })\n`;

    if (f.isOptional) {
      fieldsContent += '  @IsOptional()\n';
      validatorImports.add('IsOptional');
    } else {
      fieldsContent += '  @IsNotEmpty()\n';
      validatorImports.add('IsNotEmpty');
    }

    if (f.name.endsWith('Id')) {
      fieldsContent += '  @IsUUID(7)\n';
      validatorImports.add('IsUUID');
    } else if (mapType(f.type) === 'string') {
      fieldsContent += '  @IsString()\n';
      validatorImports.add('IsString');
    }

    fieldsContent += `  ${f.name}${f.isOptional ? '?' : ''}: ${mapType(f.type)};\n`;
    if (index < filteredFields.length - 1) {
      fieldsContent += '\n';
    }
  });

  let createContent = '';
  if (filteredFields.length > 0) {
    createContent += "import { ApiProperty } from '@nestjs/swagger';\n";
  }
  if (validatorImports.size > 0) {
    createContent += `import { ${Array.from(validatorImports).sort().join(', ')} } from 'class-validator';\n`;
  }
  if (createContent) createContent += '\n';

  createContent += `export class Create${model.name}Dto {\n`;
  createContent += fieldsContent;
  createContent += `}\n`;
  return createContent;
}

/**
 * Generates Relation Enums content
 */
export function generateRelationEnumsContent(model: Model): string {
  const relationFields = model.fields.filter((f) => f.isRelation);
  if (relationFields.length === 0) return '';

  let content = `export enum ${model.name}Relations {\n`;
  relationFields.forEach((f) => {
    content += `  ${f.name.toUpperCase()} = '${f.name}',\n`;
  });
  content += '}\n';
  return content;
}

/**
 * Main execution logic
 */
function run(): void {
  const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma');
  if (!fs.existsSync(schemaPath)) return;
  const schema = fs.readFileSync(schemaPath, 'utf8');

  const modelRegex = /model\s+(\w+)\s+{([\s\S]*?)}/g;
  let match: RegExpExecArray | null;
  const models: Models = {};

  while ((match = modelRegex.exec(schema)) !== null) {
    const modelName = match[1];
    models[modelName] = {
      name: modelName,
      singular: modelName.toLowerCase(),
      fields: parseFields(match[2]),
    };
  }

  const generatedDir = path.join(process.cwd(), 'src', 'generated');
  const dirs = {
    entities: path.join(generatedDir, 'entities'),
    interfaces: path.join(generatedDir, 'interfaces'),
    dto: path.join(generatedDir, 'dto'),
    relations: path.join(generatedDir, 'relations'),
  };

  // Create directories
  Object.values(dirs).forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });

  console.log('🚀 Starting centralized resource generation...');

  for (const modelName in models) {
    const model = models[modelName];

    // Entities
    fs.writeFileSync(
      path.join(dirs.entities, `${model.singular}.entity.ts`),
      generateEntityContent(model, models),
    );

    // Interfaces
    fs.writeFileSync(
      path.join(dirs.interfaces, `${model.singular}.interface.ts`),
      generateInterfaceContent(model, models),
    );

    // DTOs
    const modelDtoDir = path.join(dirs.dto, model.singular);
    if (!fs.existsSync(modelDtoDir)) fs.mkdirSync(modelDtoDir, { recursive: true });

    fs.writeFileSync(
      path.join(modelDtoDir, `create-${model.singular}.dto.ts`),
      generateCreateDtoContent(model),
    );
    fs.writeFileSync(
      path.join(modelDtoDir, `update-${model.singular}.dto.ts`),
      "import { PartialType } from '@nestjs/swagger';\n" +
      `import { Create${model.name}Dto } from './create-${model.singular}.dto';\n\n` +
      `export class Update${model.name}Dto extends PartialType(Create${model.name}Dto) {}\n`
    );

    // Enums
    const relationEnums = generateRelationEnumsContent(model);
    if (relationEnums) {
      fs.writeFileSync(
        path.join(dirs.relations, `${model.singular}-relations.enum.ts`),
        relationEnums,
      );
    }

    console.log(`✅ Generated centralized files for ${modelName}`);
  }

  console.log('✨ Generation complete!');
}

if (require.main === module) { run(); }
