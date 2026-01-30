import * as fs from 'fs';
import * as path from 'path';
import { parsePrismaSchema, generateFile } from './utils';
import * as backend from './backend';
import * as frontend from './frontend';

const GENERATED_ROOT = path.join(process.cwd(), 'src', 'generated', 'types');
const BACKEND_ROOT = path.join(GENERATED_ROOT, 'backend');
const FRONTEND_ROOT = path.join(GENERATED_ROOT, 'frontend');

const DIRS = {
  entities: path.join(BACKEND_ROOT, 'entities'),
  dto: path.join(BACKEND_ROOT, 'dto'),
  relations: path.join(BACKEND_ROOT, 'relations'),
  frontendEntities: path.join(FRONTEND_ROOT, 'entities'),
  frontendDtos: path.join(FRONTEND_ROOT, 'dtos'),
  constants: FRONTEND_ROOT,
};

function run(): void {
  const args = process.argv.slice(2);
  const forceDto = args.includes('--force');

  const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma');
  if (!fs.existsSync(schemaPath)) return;
  const schema = fs.readFileSync(schemaPath, 'utf8');
  const models = parsePrismaSchema(schema);

  // 1. Frontend Centralized files
  generateFile(
    path.join(DIRS.constants, 'constants.ts'),
    frontend.generateFrontendConstants(schema),
  );

  const sharedRenames = new Map<string, string>();
  const relationFiles: string[] = [];
  const processedDtoDirs = new Set<string>();

  models.forEach((model) => {
    // ---- Backend Generation ----
    generateFile(
      path.join(DIRS.entities, `${model.singular}.entity.ts`),
      backend.generateEntityContent(model),
    );

    // Relations Logic
    const relationContent = backend.generateRelationEnumContent(model);
    if (relationContent) {
      const fileName = `${model.singular}-relations.enum.ts`;
      generateFile(path.join(DIRS.relations, fileName), relationContent);
      relationFiles.push(fileName.replace('.ts', ''));
    }

    // DTO Logic
    let singularDir = path.join(process.cwd(), 'src', model.singular);
    if (!fs.existsSync(singularDir) && model.singular.endsWith('-item')) {
      const parentName = model.singular.replace('-item', '');
      const parentDir = path.join(process.cwd(), 'src', parentName);
      if (fs.existsSync(parentDir)) singularDir = parentDir;
    }

    const customDtoPath = path.join(singularDir, 'dto', `create-${model.singular}.dto.ts`);
    const baseSingular = model.singular.endsWith('-item')
      ? model.singular.replace('-item', '')
      : model.singular;
    const modelBackendDtoDir = path.join(DIRS.dto, baseSingular);

    if (!fs.existsSync(customDtoPath) || forceDto) {
      if (forceDto && fs.existsSync(customDtoPath)) {
        console.log(`⚠️ Forcing Backend DTOs for ${model.name}`);
      }
      generateFile(
        path.join(modelBackendDtoDir, `create-${model.singular}.dto.ts`),
        backend.generateCreateDtoContent(model),
      );
      generateFile(
        path.join(modelBackendDtoDir, `update-${model.singular}.dto.ts`),
        backend.generateUpdateDtoContent(model),
      );
    }

    // ---- Frontend Generation ----
    generateFile(
      path.join(DIRS.frontendEntities, `${model.singular}.interface.ts`),
      frontend.generateFrontendInterfaceContent(model),
    );

    const modelFrontendDtoDir = path.join(DIRS.frontendDtos, baseSingular);
    const sourceDtoDir = path.join(singularDir, 'dto');

    if (fs.existsSync(sourceDtoDir)) {
      if (!processedDtoDirs.has(sourceDtoDir)) {
        processedDtoDirs.add(sourceDtoDir);

        // Copy and strip custom DTOs
        const dtoFiles = fs.readdirSync(sourceDtoDir).filter((f) => f.endsWith('.dto.ts'));

        dtoFiles.forEach((file) => {
          const content = fs.readFileSync(path.join(sourceDtoDir, file), 'utf8');
          const stripped = frontend.stripDecorators(content, model.name, sharedRenames);
          generateFile(
            path.join(modelFrontendDtoDir, file.replace('.dto.ts', '.interface.ts')),
            stripped,
          );
        });
      }
    } else {
      // Create and strip standard generated DTOs
      const createContent = backend.generateCreateDtoContent(model);
      const updateContent = backend.generateUpdateDtoContent(model);
      generateFile(
        path.join(modelFrontendDtoDir, `create-${model.singular}.interface.ts`),
        frontend.stripDecorators(createContent, model.name, sharedRenames),
      );
      generateFile(
        path.join(modelFrontendDtoDir, `update-${model.singular}.interface.ts`),
        frontend.stripDecorators(updateContent, model.name, sharedRenames),
      );
    }
  });

  // Finalize Relations Index
  const relationIndex = relationFiles
    .sort()
    .map((file) => `export * from './${file}';`)
    .join('\n');
  generateFile(path.join(DIRS.relations, 'index.ts'), relationIndex);

  console.log('✨ Generation complete!');
}

run();
