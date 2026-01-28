import { Model } from './types';

export function generateFrontendInterfaceContent(model: Model): string {
  const enumFields = model.fields.filter((f) => f.isEnum && !f.isRelation);
  const relationFields = model.fields.filter((f) => f.isRelation);

  let imports = '// This file is auto-generated. Do not edit.\n\n';

  // Enum imports
  if (enumFields.length > 0) {
    const enums = [...new Set(enumFields.map((f) => f.type))].sort();
    imports += `import { ${enums.join(', ')} } from '../constants';\n`;
  }

  // Relation imports
  const relations = [...new Set(relationFields.map((f) => f.type))]
    .filter((type) => type !== model.name)
    .sort();

  if (relations.length > 0) {
    relations.forEach((rel) => {
      const filename = rel.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
      imports += `import { ${rel} } from './${filename}.interface';\n`;
    });
  }

  if (enumFields.length > 0 || relations.length > 0) {
    imports += '\n';
  }

  let fields = '';
  model.fields.forEach((f) => {
    let type = f.type;
    if (!f.isRelation) {
      if (type === 'String') type = 'string';
      else if (type === 'Int' || type === 'Float' || type === 'Decimal') type = 'number';
      else if (type === 'Boolean') type = 'boolean';
      else if (type === 'DateTime') type = 'string';
      else if (type === 'Json') type = 'Record<string, unknown>';
    }

    const arraySuffix = f.isArray ? '[]' : '';
    fields += `  ${f.name}${f.isOptional ? '?' : ''}: ${type}${arraySuffix};\n`;
  });

  return `${imports}export interface ${model.name} {\n${fields}}\n`;
}

export function generateFrontendConstants(schema: string): string {
  let content = '// This file is auto-generated. Do not edit.\n\n';
  const enumRegex = /enum\s+(\w+)\s+{([\s\S]*?)}/g;
  let match;

  while ((match = enumRegex.exec(schema)) !== null) {
    const name = match[1];
    const values = match[2]
      .split('\n')
      .map((v) => v.trim())
      .filter((v) => v && !v.startsWith('//'))
      .map((v) => v.split(/\s+/)[0]);

    content += `export const ${name} = {\n`;
    values.forEach((v) => {
      content += `  ${v}: '${v}',\n`;
    });
    content += `} as const;\n\n`;
    content += `export type ${name} = (typeof ${name})[keyof typeof ${name}];\n\n`;
  }

  return content;
}

export function stripDecorators(
  content: string,
  mainModelName?: string,
  sharedRenames?: Map<string, string>,
): string {
  // Remove existing auto-gen comments
  content = content.replace(/\/\/ This file is auto-generated\. Do not edit\.\s*\n?/g, '');

  // Remove imports
  const importsToRemove = [
    '@nestjs/swagger',
    '@nestjs/mapped-types',
    'class-validator',
    'class-transformer',
    'nestjs-zod',
    'zod',
  ];
  importsToRemove.forEach((pkg) => {
    const regex = new RegExp(`import {[^}]*} from '${pkg}';\\n?`, 'g');
    content = content.replace(regex, '');
    const regexFull = new RegExp(`import .* from '${pkg}';\\n?`, 'g');
    content = content.replace(regexFull, '');
  });

  content = content.replace(
    /import { Decimal } from '..\/..\/prisma\/internal\/prismaNamespace';\n?/g,
    '',
  );

  // Redirect enum imports
  content = content.replace(/import {([^}]*)} from '.*\/prisma\/enums';\n?/g, (_, p1) => {
    const cleanedEnums = p1
      .split(',')
      .map((e: string) => e.trim())
      .filter(Boolean)
      .join(', ');
    return `import { ${cleanedEnums} } from '../../constants';\n`;
  });

  // Remove decorators
  content = content.replace(/@\w+\s*\((?:[^()]*|\((?:[^()]*|\([^()]*\))*\))*\)\s*\n?/g, '');
  content = content.replace(/^\s*@\w+\s*\n?/gm, '');

  // 1. Identify which classes extend a partial schema (BEFORE STRIPPING)
  const partialSchemas = new Set<string>();
  const partialRegex = /(?:export\s+)?const\s+(\w+Schema)\s*=\s*(\w+Schema)\.partial\(\)/g;
  let partialMatch;
  while ((partialMatch = partialRegex.exec(content)) !== null) {
    partialSchemas.add(partialMatch[1]);
  }

  // Also check for inline .partial() inside createZodDto
  // e.g. class UpdateDto extends createZodDto(CreateSchema.partial())
  // supports multi-line with optional trailing comma
  const inlinePartialRegex =
    /class (\w+) extends createZodDto\(\s*(\w+Schema)\.partial\(\),?\s*\)/g;
  const inlinePartials = new Map<string, string>(); // className -> baseSchemaName
  let inlineMatch;
  while ((inlineMatch = inlinePartialRegex.exec(content)) !== null) {
    inlinePartials.set(inlineMatch[1], inlineMatch[2]);
  }

  // 2. Map schema names to class names and extract schema bodies
  const schemaToClass = new Map<string, string>();
  const schemaBodies = new Map<string, string>();

  // Extract z.object({...}) bodies
  const objectSchemaRegex = /const (\w+Schema)\s*=\s*z\.object\s*\(\s*{([\s\S]*?)}\s*\)/g;
  let objMatch;
  while ((objMatch = objectSchemaRegex.exec(content)) !== null) {
    schemaBodies.set(objMatch[1], objMatch[2]);
  }

  const classRegex = /class (\w+) extends createZodDto\((\w+)\)/g;
  let classMatch;
  while ((classMatch = classRegex.exec(content)) !== null) {
    schemaToClass.set(classMatch[2], classMatch[1]);
  }

  // Strip Zod Schemas
  // 1. Remove z.object({...}) blocks
  content = content.replace(
    /(?:export\s+)?const\s+\w+Schema\s*=\s*z\.object\s*\(\s*{[\s\S]*?}\s*\)\s*;?/g,
    '',
  );
  // 2. Remove .partial() patterns
  content = content.replace(/(?:export\s+)?const\s+\w+Schema\s*=\s*\w+Schema\.partial\(\);?/g, '');
  // 3. Remove any other Schema definitions
  content = content.replace(/(?:export\s+)?const\s+\w+Schema\s*=\s*[\s\S]*?;/g, '');
  // 4. Remove any lines that contain Zod properties but weren't caught
  content = content
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (trimmed.includes('z.') && (trimmed.includes(':') || trimmed.startsWith('z.')))
        return false;
      if (trimmed === '});' || trimmed === '})') return false;
      return true;
    })
    .join('\n');

  // Handle Update DTO pattern (Zod partials) and transform classes
  content = content.replace(
    /export class (\w+) extends createZodDto\(\s*([\s\S]*?)\s*\)\s*{\s*}/g,
    (_, className, schemaBody) => {
      // Check for inline partial match first
      if (inlinePartials.has(className)) {
        const baseSchemaName = inlinePartials.get(className);
        const baseDtoName = baseSchemaName!.replace('Schema', 'Dto');
        return `export type ${className} = Partial<${baseDtoName}>;`;
      }

      const schemaNameMatch = schemaBody.match(/(\w+Schema)/);
      const schemaName = schemaNameMatch ? schemaNameMatch[1] : '';

      // If the schema is a partial of another schema (declared via const schema = schema.partial())
      if (partialSchemas.has(schemaName)) {
        const baseDtoName = className.replace('Update', 'Create');
        return `export type ${className} = Partial<${baseDtoName}>;`;
      }

      // If we have the body, convert it
      const body = schemaBodies.get(schemaName);
      if (body) {
        const tsFields = convertZodBodyToTs(body);
        return `export interface ${className} {\n${tsFields}\n}`;
      }

      return `export interface ${className} {}`;
    },
  );

  function convertZodBodyToTs(body: string): string {
    return body
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.trim().startsWith('//'))
      .map((line) => {
        const trimmed = line.trim();
        const match = line.match(/^(\s*)(['"]?\w+['"]?)\s*:\s*([\s\S]*?)(,|$)/);
        if (!match) return line;

        const key = match[2].replace(/['"]/g, '');
        let val = match[3].trim();

        // Check for optional
        const isOptional =
          val.includes('.optional()') ||
          val.includes('.nullable()') ||
          val.includes('.partial()') ||
          val.includes('.default(');

        let tsType = 'any';

        if (val.includes('z.array(')) {
          const aMatch = val.match(/z\.array\(\s*(\w+)\s*\)/);
          if (aMatch) {
            tsType = aMatch[1].replace('Schema', 'Dto') + '[]';
          } else if (val.includes('string()') || val.includes('uuid()') || val.includes('date()')) {
            tsType = 'string[]';
          } else if (val.includes('number()')) {
            tsType = 'number[]';
          } else {
            tsType = 'any[]';
          }
        } else if (
          val.includes('string()') ||
          val.includes('uuid()') ||
          val.includes('datetime()') ||
          val.includes('date()')
        ) {
          tsType = 'string';
        } else if (val.includes('number()')) {
          tsType = 'number';
        } else if (val.includes('boolean()')) {
          tsType = 'boolean';
        } else if (val.includes('enum(') || val.includes('Enum(')) {
          const eMatch = val.match(/[eE]num\((\w+)\)/);
          tsType = eMatch ? eMatch[1] : 'any';
        } else if (val.includes('Schema')) {
          const sMatch = val.match(/(\w+Schema)/);
          if (sMatch) tsType = sMatch[1].replace('Schema', 'Dto');
        } else if (val.includes('any()') || val.includes('unknown()')) {
          tsType = 'Record<string, unknown>';
        }

        return `  ${key}${isOptional ? '?' : ''}: ${tsType};`;
      })
      .join('\n');
  }

  // PartialType -> Partial (NestJS legacy)
  content = content.replace(
    /export (?:class|interface) (\w+) extends PartialType\((\w+)\)\s*{\s*}/g,
    'export type $1 = Partial<$2>;',
  );
  content = content.replace(/PartialType\((\w+)\)/g, 'Partial<$1>');

  // class -> interface
  content = content.replace(
    /(?:export\s+)?class (\w+)(?:\s+extends\s+([\w<>, ]+))?\s*{/g,
    (_, name, parent) => {
      const parentTrimmed = parent ? parent.trim() : '';
      return `export interface ${name}${parentTrimmed ? ` extends ${parentTrimmed}` : ''} {`;
    },
  );

  // Redirect local DTO imports and rename Schema -> Dto
  content = content.replace(/import {([^}]*)} from '([^']+)';/g, (_, imports, path) => {
    let newImports = imports.replace(/(\w+)Schema/g, '$1Dto');
    let newPath = path;
    if (path.endsWith('.dto')) newPath = path.replace('.dto', '.interface');
    return `import { ${newImports.trim()} } from '${newPath}';`;
  });

  // Type replacements
  content = content.replace(/:\s*Decimal/g, ': number');
  content = content.replace(/:\s*Date/g, ': string');

  // Remove any remaining lines with z. or zod (failsafe)
  content = content
    .split('\n')
    .filter((line) => !line.trim().startsWith('z.') && !line.includes('z.object'))
    .join('\n');

  // Normalize whitespace

  // 1. Ensure exactly one blank line before top-level exports
  content = content.replace(/(\n\s*)+export (interface|type|const|enum|class)/g, '\n\nexport $2');

  // 2. Collapse remaining multiple newlines (3+) into 2
  content = content.replace(/\n{3,}/g, '\n\n');

  return `// This file is auto-generated. Do not edit.\n\n${content.trim()}\n`;
}
