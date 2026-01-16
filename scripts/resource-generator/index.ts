import * as fs from 'fs';
import * as path from 'path';

export interface Field {
  name: string;
  type: string;
  isOptional: boolean;
  isArray: boolean;
  isRelation: boolean;
  isSystem: boolean;
  isEnum: boolean;
}

export interface Model {
  name: string;
  singular: string;
  fields: Field[];
}

export type Models = Record<string, Model>;
export type Enums = Record<string, string[]>;

/**
 * Converts PascalCase or camelCase to kebab-case
 */
export function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

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
      const isOptional = type.endsWith('?') || trimmed.includes('@default');
      const cleanType = type.replace('?', '');
      const isArray = cleanType.endsWith('[]');
      const baseType = cleanType.replace('[]', '');
      const isRelation = ![
        'String',
        'Int',
        'Float',
        'Decimal',
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
        isEnum: false, // Will be updated later
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
    case 'Decimal':
      return 'number';
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
  const relevantFields = model.fields.filter((f) => f.isRelation || f.isEnum);
  const importLines = new Set<string>();

  relevantFields.forEach((f) => {
    if (f.isEnum) {
      importLines.add(`import { ${f.type} } from '../constants';`);
    } else {
      const relModel = allModels[f.type];
      if (relModel && relModel.name !== model.name) {
        importLines.add(`import { ${relModel.name} } from './${relModel.singular}.interface';`);
      }
    }
  });

  let content = '';
  const imports = Array.from(importLines).sort().join('\n');
  if (imports) content += imports + '\n\n';

  content += `export interface ${model.name} {\n`;

  model.fields.forEach((f) => {
    // For interfaces, id is always mandatory for frontend easy use
    const isId = f.name === 'id';
    const tsType = mapType(f.type);
    const suffix = f.isOptional && !isId ? '?' : '';
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
  const relevantFields = model.fields.filter((f) => f.isRelation || f.isEnum);
  const importLines = new Set<string>();
  importLines.add("import { ApiProperty } from '@nestjs/swagger';");

  relevantFields.forEach((f) => {
    const relModel = allModels[f.type];
    if (relModel && relModel.name !== model.name) {
      importLines.add(`import { ${relModel.name} } from './${relModel.singular}.entity';`);
    } else if (f.isEnum) {
      importLines.add(`import { ${f.type} } from '../prisma/enums';`);
    }
  });

  const hasDecimal = model.fields.some((f) => f.type === 'Decimal');
  if (hasDecimal) {
    importLines.add("import { Decimal } from '../prisma/internal/prismaNamespace';");
  }

  let content = Array.from(importLines).sort().join('\n');
  if (content) content += '\n\n';
  content += `export class ${model.name} {\n`;

  model.fields.forEach((f, index) => {
    const isDecimal = f.type === 'Decimal';
    const tsType = isDecimal ? 'Decimal' : mapType(f.type);
    const suffix = f.isOptional ? '?' : '';
    const arraySuffix = f.isArray ? '[]' : '';

    if (f.isRelation && !f.isEnum) {
      content += `  @ApiProperty({ type: () => ${tsType}, isArray: ${f.isArray}, required: ${!f.isOptional} })\n`;
    } else if (f.isEnum) {
      content += `  @ApiProperty({ enum: ${tsType}, isArray: ${f.isArray}, required: ${!f.isOptional} })\n`;
    } else if (tsType === 'Date') {
      content += `  @ApiProperty({ type: 'string', format: 'date-time', required: ${!f.isOptional} })\n`;
    } else if (isDecimal) {
      content += `  @ApiProperty({ type: 'number', required: ${!f.isOptional} })\n`;
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
  const customImports = new Set<string>();
  let fieldsContent = '';
  const filteredFields = model.fields.filter((f) => !f.isSystem && !f.isRelation && !f.isArray);

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
    } else if (f.type === 'Decimal') {
      fieldsContent += '  @IsNumber()\n';
      validatorImports.add('IsNumber');
    }

    if (f.isEnum) {
      customImports.add(`import { ${f.type} } from '../../prisma/enums';`);
      fieldsContent += `  @IsEnum(${f.type})\n`;
      validatorImports.add('IsEnum');
    }

    const tsType = f.type === 'Decimal' ? 'Decimal' : mapType(f.type);
    fieldsContent += `  ${f.name}${f.isOptional ? '?' : ''}: ${tsType};\n`;
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
  if (
    model.fields.some((f) => f.type === 'Decimal' && !f.isArray && !f.isSystem && !f.isRelation)
  ) {
    createContent += "import { Decimal } from '../../prisma/internal/prismaNamespace';\n";
  }
  if (customImports.size > 0) {
    createContent += Array.from(customImports).sort().join('\n') + '\n';
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
 * Generates content for all enums in a single file
 */
export function generateAllEnumsContent(enums: Enums): string {
  let content = '';
  Object.entries(enums).forEach(([name, values], index) => {
    content += `export const ${name} = {\n`;
    values.forEach((v) => {
      content += `  ${v}: '${v}',\n`;
    });
    content += `} as const;\n\n`;
    content += `export type ${name} = (typeof ${name})[keyof typeof ${name}];\n`;

    if (index < Object.keys(enums).length - 1) {
      content += '\n';
    }
  });
  return content;
}

/**
 * Strips all decorators and specific imports (swagger, validator, transformer)
 * AND renames nested DTO classes to prevent conflicts.
 * sharedRenames: A map to store/retrieve renames across files (e.g. from Create to Update DTO)
 */
export function stripDecorators(
  content: string,
  mainModelName?: string,
  sharedRenames?: Map<string, string>,
): string {
  // Remove imports
  content = content.replace(/import {[^}]*} from '@nestjs\/swagger';\n?/g, '');
  content = content.replace(/import {[^}]*} from '@nestjs\/mapped-types';\n?/g, '');
  content = content.replace(/import {[^}]*} from 'class-validator';\n?/g, '');
  content = content.replace(/import {[^}]*} from 'class-transformer';\n?/g, '');
  content = content.replace(/import .* from '@nestjs\/swagger';\n?/g, '');
  content = content.replace(
    /import { Decimal } from '..\/..\/prisma\/internal\/prismaNamespace';\n?/g,
    '',
  );

  // Redirect enum imports to frontend constants
  content = content.replace(/import {([^}]*)} from '.*\/prisma\/enums';\n?/g, (_, p1) => {
    const cleanedEnums = p1
      .split(',')
      .map((e: string) => e.trim())
      .filter(Boolean)
      .join(', ');
    return `import { ${cleanedEnums} } from '../constants';\n`;
  });

  // Remove decorators with balanced parentheses (supports nesting for @ApiProperty({ ... }))
  content = content.replace(/@\w+\s*\((?:[^()]*|\((?:[^()]*|\([^()]*\))*\))*\)\s*\n?/g, '');

  // Remove single-line decorators without parentheses
  content = content.replace(/^\s*@\w+\s*\n?/gm, '');

  // Redirect local DTO imports to interface files
  content = content.replace(/from '(\.\.?\/[^']+)\.dto';/g, "from '$1.interface';");

  // Replace Decimal with number for frontend compatibility
  content = content.replace(/:\s*Decimal/g, ': number');

  // Replace any class (exported or not) with export interface for frontend purity
  // Supports inheritance: export class A extends B { -> export interface A extends B {
  content = content.replace(
    /(?:export\s+)?class (\w+)(?:\s+extends\s+([\w<>]+))?\s*{/g,
    (_, name, parent) => {
      return `export interface ${name}${parent ? ` extends ${parent}` : ''} {`;
    },
  );

  // Replace PartialType(X) with Partial<X> and convert class to type alias
  // Matches: export class UpdateUserDto extends PartialType(CreateUserDto) {}
  content = content.replace(
    /export class (\w+) extends PartialType\((\w+)\)\s*{?\s*}?/g,
    'export type $1 = Partial<$2>;',
  );

  // Replace any remaining PartialType(X) within the file
  content = content.replace(/PartialType\((\w+)\)/g, 'Partial<$1>');

  // Cleanup:
  // 1. Collapse multiple empty lines (including lines with whitespace) to a single newline
  // This preserves the indentation of the following line because the match must end with a newline.
  content = content.replace(/(\r?\n[ \t]*)+\r?\n/g, '\n');

  // 2. Add blank line before top-level exports to separate them from imports or other blocks
  content = content.replace(/\nexport (interface|type|const|enum|class)/g, '\n\nexport $1');

  // RENAME NESTED DTOs logic
  // If mainModelName is provided, we assume any exported class/interface that ends with 'Dto'
  // AND is NOT the main DTO (Create<Main>Dto or Update<Main>Dto) should be renamed.
  if (mainModelName) {
    const mainCreateDto = `Create${mainModelName}Dto`;
    // We don't strictly know the update dto name if it's custom, but usually it matches pattern
    // However, usually we process one file at a time.
    // Let's protect the "Expected Main DTO" for this file context.
    // Actually, usually we are processing either Create or Update file.

    // Find all exported interfaces that look like DTOs
    const interfaceRegex = /export interface (\w+Dto)/g;
    let match;
    const interfacesToRename = new Set<string>();

    while ((match = interfaceRegex.exec(content)) !== null) {
      const interfaceName = match[1];
      // If it's NOT the main one we expect for this file context...
      // But we call stripDecorators for both Create and Update files.
      // Heuristic: If it matches Create{mainModelName}Dto or Update{mainModelName}Dto, keep it.
      // Everything else -> Rename to ...Input
      if (
        interfaceName !== `Create${mainModelName}Dto` &&
        interfaceName !== `Update${mainModelName}Dto`
      ) {
        interfacesToRename.add(interfaceName);
      }
    }

    interfacesToRename.forEach((oldName) => {
      const newName = oldName.replace(/Dto$/, 'Input');

      // Store in shared map
      if (sharedRenames) {
        sharedRenames.set(oldName, newName);
      }

      // 1. Rename definition
      const defRegex = new RegExp(`export interface ${oldName}\\b`, 'g');
      content = content.replace(defRegex, `export interface ${newName}`);

      // 2. Rename usages (as type, array, or generic)
      // Use boundary to avoid replacing substrings
      const usageRegex = new RegExp(`\\b${oldName}\\b`, 'g');
      content = content.replace(usageRegex, newName);
    });
  }

  // Apply PREVIOUSLY known renames (e.g. from Create DTO when processing Update DTO)
  if (sharedRenames && sharedRenames.size > 0) {
    sharedRenames.forEach((newName, oldName) => {
      // Avoid re-renaming if already handled by the logic above (for definitions in current file)
      // But for Imports and Usages of types defined in OTHER files (like Create DTO), we must replace.

      // We don't want to break "export interface NewName" if it was just renamed above.
      // But the map contains Old->New.
      // Safe strategy: Replace whole word matches of OldName with NewName everywhere
      // EXCEPT if we just renamed it (which handled it).

      // Simpler: Just run replacement. Any usages of OldName should be NewName.
      // Note: This might overlap with the loop above if the same file re-exports it?
      // But typically sharedRenames comes from the PREVIOUS file.

      // Check if this OldName is still present
      if (content.includes(oldName)) {
        const usageRegex = new RegExp(`\\b${oldName}\\b`, 'g');
        content = content.replace(usageRegex, newName);
      }
    });
  }

  return content.trim();
}

/**
 * Generates Create DTO content for frontend (clean, no decorators)
 */
export function generateFrontendCreateDtoContent(model: Model): string {
  const customImports = new Set<string>();
  let fieldsContent = '';
  const filteredFields = model.fields.filter((f) => !f.isSystem && !f.isRelation && !f.isArray);

  filteredFields.forEach((f) => {
    // Clean fields without decorators

    if (f.isEnum) {
      customImports.add(`import { ${f.type} } from '../constants';`);
    }

    const tsType = mapType(f.type); // mapType already maps Decimal to number
    const suffix = f.isOptional ? '?' : '';
    fieldsContent += `  ${f.name}${suffix}: ${tsType};\n`;
  });

  let createContent = '';
  // Removed Decimal import for frontend
  if (customImports.size > 0) {
    createContent += Array.from(customImports).sort().join('\n') + '\n';
  }
  if (createContent) createContent += '\n';

  createContent += `export interface Create${model.name}Dto {\n`;
  createContent += fieldsContent;
  createContent += `}\n`;
  return createContent;
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
      singular: toKebabCase(modelName),
      fields: parseFields(match[2]),
    };
  }

  const enums: Enums = {};
  const enumRegex = /enum\s+(\w+)\s+{([\s\S]*?)}/g;
  while ((match = enumRegex.exec(schema)) !== null) {
    const name = match[1];
    const body = match[2];

    enums[name] = body
      .split('\n')
      .map((v) => v.trim())
      .filter((v) => v && !v.startsWith('//') && !v.startsWith('@@'));
  }

  // Update isEnum and isRelation based on found enums
  for (const modelName in models) {
    models[modelName].fields.forEach((f) => {
      if (enums[f.type]) {
        f.isEnum = true;
        f.isRelation = false;
      }
    });
  }

  const generatedDir = path.join(process.cwd(), 'src', 'generated');

  // Clear old files (Specific directories only to preserve prisma client)
  const dirsToClean = [
    path.join(generatedDir, 'entities'),
    path.join(generatedDir, 'frontend'),
    path.join(generatedDir, 'dto'),
    path.join(generatedDir, 'relations'),
  ];

  dirsToClean.forEach((dir) => {
    if (fs.existsSync(dir)) {
      console.log(`🧹 Clearing ${dir}...`);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  const dirs = {
    entities: path.join(generatedDir, 'entities'),
    frontend: path.join(generatedDir, 'frontend'),
    frontendEntities: path.join(generatedDir, 'frontend', 'entities'),
    frontendDtos: path.join(generatedDir, 'frontend', 'dtos'),
    dto: path.join(generatedDir, 'dto'),
    relations: path.join(generatedDir, 'relations'),
  };

  // Create directories
  Object.values(dirs).forEach((dir) => {
    fs.mkdirSync(dir, { recursive: true });
  });

  // Generate common constants for interfaces (Now at frontend root)
  fs.writeFileSync(path.join(dirs.frontend, 'constants.ts'), generateAllEnumsContent(enums));

  console.log('🚀 Starting centralized resource generation...');

  for (const modelName in models) {
    const model = models[modelName];

    // Entities
    const customEntityPaths = [
      path.join(process.cwd(), 'src', model.singular, `${model.singular}.entity.ts`),
      path.join(process.cwd(), 'src', model.singular, 'entities', `${model.singular}.entity.ts`),
    ];
    const hasCustomEntity = customEntityPaths.some((p) => fs.existsSync(p));

    if (!hasCustomEntity) {
      fs.writeFileSync(
        path.join(dirs.entities, `${model.singular}.entity.ts`),
        generateEntityContent(model, models),
      );
    } else {
      console.log(`ℹ️ Skipping Entity for ${model.name} (Custom found)`);
    }

    // Interfaces (Frontend Entities)
    fs.writeFileSync(
      path.join(dirs.frontendEntities, `${model.singular}.interface.ts`),
      generateInterfaceContent(model, models),
    );

    // DTOs
    const customDtoPath = path.join(
      process.cwd(),
      'src',
      model.singular,
      'dto',
      `create-${model.singular}.dto.ts`,
    );

    const frontendDtoDir = dirs.frontendDtos;
    const createDtoContent = generateCreateDtoContent(model); // Backend version (with Swagger)
    const updateDtoContent =
      "import { PartialType } from '@nestjs/swagger';\n" +
      `import { Create${model.name}Dto } from './create-${model.singular}.dto';\n\n` +
      `export class Update${model.name}Dto extends PartialType(Create${model.name}Dto) {}\n`;

    if (!fs.existsSync(customDtoPath)) {
      // Logic A: Standard Generation

      // 1. Backend Generated DTOs
      const modelDtoDir = path.join(dirs.dto, model.singular);
      if (!fs.existsSync(modelDtoDir)) fs.mkdirSync(modelDtoDir, { recursive: true });

      fs.writeFileSync(path.join(modelDtoDir, `create-${model.singular}.dto.ts`), createDtoContent);
      fs.writeFileSync(path.join(modelDtoDir, `update-${model.singular}.dto.ts`), updateDtoContent);

      // 2. Frontend DTOs (Clean version) - Interfaces
      const frontendCreateContent = generateFrontendCreateDtoContent(model);

      // Use TypeScript Pattern for Frontend Update DTO (No Dependencies)
      const frontendUpdateContent =
        `import { Create${model.name}Dto } from './create-${model.singular}.interface';\n\n` +
        `export type Update${model.name}Dto = Partial<Create${model.name}Dto>;\n`;

      fs.writeFileSync(
        path.join(frontendDtoDir, `create-${model.singular}.interface.ts`),
        frontendCreateContent,
      );
      fs.writeFileSync(
        path.join(frontendDtoDir, `update-${model.singular}.interface.ts`),
        frontendUpdateContent,
      );
    } else {
      // Logic B: Custom Exists -> Copy to Frontend AND Strip Swagger/Validators
      console.log(`ℹ️ Skipping Backend DTOs for ${model.name} (Custom found)`);
      console.log(`📋 Copying Custom DTOs for ${model.name} to Frontend (Stripping Decorators)`);

      const sharedRenames = new Map<string, string>();

      // Copy & Strip Create DTO
      const customCreateContent = fs.readFileSync(customDtoPath, 'utf8');
      fs.writeFileSync(
        path.join(frontendDtoDir, `create-${model.singular}.interface.ts`),
        stripDecorators(customCreateContent, model.name, sharedRenames),
      );

      // Try Copy & Strip Update DTO
      const customUpdateDtoPath = path.join(
        process.cwd(),
        'src',
        model.singular,
        'dto',
        `update-${model.singular}.dto.ts`,
      );

      if (fs.existsSync(customUpdateDtoPath)) {
        const customUpdateContent = fs.readFileSync(customUpdateDtoPath, 'utf8');
        fs.writeFileSync(
          path.join(frontendDtoDir, `update-${model.singular}.interface.ts`),
          stripDecorators(customUpdateContent, model.name, sharedRenames),
        );
      }
    }

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

if (require.main === module) {
  run();
}
