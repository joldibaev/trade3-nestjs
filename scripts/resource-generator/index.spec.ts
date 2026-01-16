import {
  parseFields,
  mapType,
  generateEntityContent,
  generateInterfaceContent,
  generateAllEnumsContent,
  generateCreateDtoContent,
  generateFrontendCreateDtoContent,
  stripDecorators,
  toKebabCase,
  Model,
  Models,
} from './index';

describe('Resource Generator', () => {
  describe('Regex Pattern', () => {
    it('should capture @nodto triple-slash comments', () => {
      const schema = `
        /// @nodto
        model StockMovement {
          id String @id
        }
      `;
      const modelRegex = /(?:\s*\/\/\/.*?\n)*\s*model\s+(\w+)\s+{([\s\S]*?)}/g;
      const match = modelRegex.exec(schema);
      expect(match).not.toBeNull();
      expect(match![0]).toContain('/// @nodto');
      expect(match![1]).toBe('StockMovement');
    });
  });

  describe('toKebabCase', () => {
    it('should convert PascalCase to kebab-case', () => {
      expect(toKebabCase('DocumentAdjustment')).toBe('document-adjustment');
      expect(toKebabCase('Product')).toBe('product');
    });

    it('should convert camelCase to kebab-case', () => {
      expect(toKebabCase('documentAdjustment')).toBe('document-adjustment');
    });
  });

  describe('parseFields', () => {
    it('should parse simple fields correctly', () => {
      const body = `
        id    String  @id @default(uuid())
        name  String
        age   Int?
        bio   String? // A comment
      `;
      const fields = parseFields(body);
      expect(fields).toContainEqual({
        name: 'id',
        type: 'String',
        isOptional: true,
        isArray: false,
        isRelation: false,
        isSystem: true,
        isEnum: false,
      });
      expect(fields.find((f) => f.name === 'name')).toMatchObject({
        type: 'String',
        isOptional: false,
      });
    });

    it('should detect relations and system fields', () => {
      const body = `
        createdAt DateTime @default(now())
        store     Store    @relation(fields: [storeId], references: [id])
      `;
      const fields = parseFields(body);
      expect(fields.find((f) => f.name === 'createdAt')?.isSystem).toBe(true);
      expect(fields.find((f) => f.name === 'store')?.isRelation).toBe(true);
    });

    it('should NOT treat Decimal as a relation', () => {
      const body = 'price Decimal';
      const fields = parseFields(body);
      expect(fields[0].isRelation).toBe(false);
      expect(fields[0].type).toBe('Decimal');
    });

    it('should treat @default fields as optional', () => {
      const body = 'status String @default("ACTIVE")';
      const fields = parseFields(body);
      expect(fields[0].isOptional).toBe(true);
    });
  });

  describe('mapType', () => {
    it('should map Prisma types to TS types (backend)', () => {
      expect(mapType('String')).toBe('string');
      expect(mapType('Int')).toBe('number');
      expect(mapType('Float')).toBe('number');
      expect(mapType('Decimal')).toBe('number');
      expect(mapType('Boolean')).toBe('boolean');
      expect(mapType('DateTime')).toBe('Date');
      expect(mapType('CustomModel')).toBe('CustomModel');
    });

    it('should map DateTime to string for frontend', () => {
      expect(mapType('DateTime', 'frontend')).toBe('string');
      expect(mapType('String', 'frontend')).toBe('string');
    });
  });

  describe('generateEntityContent', () => {
    const allModels: Models = {
      Category: { name: 'Category', singular: 'category', fields: [] },
      Price: { name: 'Price', singular: 'price', fields: [] },
      DocumentAdjustment: {
        name: 'DocumentAdjustment',
        singular: 'document-adjustment',
        fields: [],
      },
    };

    it('should generate correct entity with kebab-case relations', () => {
      const model: Model = {
        name: 'Test',
        singular: 'test',
        fields: [
          {
            name: 'adjustment',
            type: 'DocumentAdjustment',
            isOptional: false,
            isArray: false,
            isRelation: true,
            isSystem: false,
            isEnum: false,
          },
        ],
      };

      const content = generateEntityContent(model, allModels);
      expect(content).toContain(
        "import { DocumentAdjustment } from './document-adjustment.entity';",
      );
    });

    it('should generate correct entity with relations', () => {
      const model: Model = {
        name: 'Product',
        singular: 'product',
        fields: [
          {
            name: 'name',
            type: 'String',
            isOptional: false,
            isArray: false,
            isRelation: false,
            isSystem: false,
            isEnum: false,
          },
          {
            name: 'category',
            type: 'Category',
            isOptional: false,
            isArray: false,
            isRelation: true,
            isSystem: false,
            isEnum: false,
          },
        ],
      };

      const content = generateEntityContent(model, allModels);

      expect(content).toContain('export class Product {');
      expect(content).toContain('category: Category;');
      expect(content).toContain("import { Category } from './category.entity';");
      expect(content).toContain('@ApiProperty');
    });

    it('should map Decimal to number in ApiProperty', () => {
      const model: Model = {
        name: 'Price',
        singular: 'price',
        fields: [
          {
            name: 'value',
            type: 'Decimal',
            isOptional: false,
            isArray: false,
            isRelation: false,
            isSystem: false,
            isEnum: false,
          },
        ],
      };

      const content = generateEntityContent(model, {});
      expect(content).toContain("@ApiProperty({ type: 'number', required: true })");
      expect(content).toContain('value: Decimal;');
      expect(content).toContain("import { Decimal } from '../prisma/internal/prismaNamespace';");
    });

    it('should use enum property in ApiProperty for enums', () => {
      const model: Model = {
        name: 'Document',
        singular: 'document',
        fields: [
          {
            name: 'status',
            type: 'DocumentStatus',
            isOptional: false,
            isArray: false,
            isRelation: false,
            isSystem: false,
            isEnum: true,
          },
        ],
      };

      const content = generateEntityContent(model, {});
      expect(content).toContain(
        '@ApiProperty({ enum: DocumentStatus, isArray: false, required: true })',
      );
      expect(content).toContain("import { DocumentStatus } from '../prisma/enums';");
    });
  });

  describe('generateInterfaceContent', () => {
    const allModels: Models = {
      Category: { name: 'Category', singular: 'category', fields: [] },
    };

    it('should generate interface without decorators and import enums from common file', () => {
      const model: Model = {
        name: 'Product',
        singular: 'product',
        fields: [
          {
            name: 'name',
            type: 'String',
            isOptional: false,
            isArray: false,
            isRelation: false,
            isSystem: false,
            isEnum: false,
          },
          {
            name: 'category',
            type: 'Category',
            isOptional: false,
            isArray: false,
            isRelation: true,
            isSystem: false,
            isEnum: false,
          },
          {
            name: 'status',
            type: 'ProductStatus',
            isOptional: false,
            isArray: false,
            isRelation: false,
            isSystem: false,
            isEnum: true,
          },
        ],
      };

      const content = generateInterfaceContent(model, allModels);

      expect(content).toContain('export interface Product {');
      expect(content).toContain('category: Category;');
      expect(content).toContain("import { Category } from './category.interface';");
      expect(content).toContain("import { ProductStatus } from '../constants';");
      expect(content).not.toContain('@ApiProperty');
      expect(content).not.toContain('export const ProductStatus = {');
    });

    it('should make id mandatory even if optional in prisma', () => {
      const model: Model = {
        name: 'User',
        singular: 'user',
        fields: [
          {
            name: 'id',
            type: 'String',
            isOptional: true,
            isArray: false,
            isRelation: false,
            isSystem: true,
            isEnum: false,
          },
        ],
      };
      const content = generateInterfaceContent(model, {});
      expect(content).toContain('id: string;');
      expect(content).not.toContain('id?: string;');
    });

    it('should map Decimal to number', () => {
      const model: Model = {
        name: 'Price',
        singular: 'price',
        fields: [
          {
            name: 'value',
            type: 'Decimal',
            isOptional: false,
            isArray: false,
            isRelation: false,
            isSystem: false,
            isEnum: false,
          },
        ],
      };
      const content = generateInterfaceContent(model, {});
      expect(content).toContain('value: number;');
    });
  });

  describe('generateAllEnumsContent', () => {
    it('should generate centralized enums content', () => {
      const enums = {
        Status: ['ACTIVE', 'INACTIVE'],
        Type: ['A', 'B'],
      };
      const content = generateAllEnumsContent(enums);
      expect(content).toContain('export const Status = {');
      expect(content).toContain("ACTIVE: 'ACTIVE',");
      expect(content).toContain('export type Status = (typeof Status)[keyof typeof Status];');
      expect(content).toContain('export const Type = {');
    });
  });

  describe('generateCreateDtoContent', () => {
    it('should generate DTO with validation decorators and Decimal import', () => {
      const model: Model = {
        name: 'Stock',
        singular: 'stock',
        fields: [
          {
            name: 'quantity',
            type: 'Decimal',
            isOptional: false,
            isArray: false,
            isRelation: false,
            isSystem: false,
            isEnum: false,
          },
          {
            name: 'productId',
            type: 'String',
            isOptional: false,
            isArray: false,
            isRelation: false,
            isSystem: false,
            isEnum: false,
          },
        ],
      };

      const content = generateCreateDtoContent(model);
      expect(content).toContain('@IsNumber()');
      expect(content).toContain('@IsUUID(7)');
      expect(content).toContain("import { Decimal } from '../../prisma/internal/prismaNamespace';");
      expect(content).toContain('export class CreateStockDto {');
    });
  });

  describe('generateFrontendCreateDtoContent', () => {
    it('should generate clean DTO for frontend without decorators and with number instead of Decimal', () => {
      const model: Model = {
        name: 'Product',
        singular: 'product',
        fields: [
          {
            name: 'name',
            type: 'String',
            isOptional: false,
            isArray: false,
            isRelation: false,
            isSystem: false,
            isEnum: false,
          },
          {
            name: 'price',
            type: 'Decimal',
            isOptional: true,
            isArray: false,
            isRelation: false,
            isSystem: false,
            isEnum: false,
          },
          {
            name: 'status',
            type: 'ProductStatus',
            isOptional: false,
            isArray: false,
            isRelation: false,
            isSystem: false,
            isEnum: true,
          },
        ],
      };

      const content = generateFrontendCreateDtoContent(model);

      expect(content).toContain('export interface CreateProductDto {');
      expect(content).toContain('name: string;');
      expect(content).toContain('price?: number;');
      expect(content).toContain("import { ProductStatus } from '../../constants';");
      expect(content).not.toContain('@ApiProperty');
      expect(content).not.toContain('@IsString');
      expect(content).not.toContain('Decimal');
    });
  });

  describe('stripDecorators', () => {
    it('should strip all decorators and nested object literals', () => {
      const input = `
        import { ApiProperty } from '@nestjs/swagger';
        import { IsString, IsNotEmpty } from 'class-validator';

        export class CreateTestDto {
          @ApiProperty({
            description: 'Test field',
            required: true,
          })
          @IsNotEmpty()
          @IsString()
          name: string;
        }
      `;
      const output = stripDecorators(input);
      expect(output).not.toContain('@ApiProperty');
      expect(output).not.toContain('@IsNotEmpty');
      expect(output).not.toContain('@IsString');
      expect(output).not.toContain('import { ApiProperty }');
      expect(output).toContain('name: string;');
    });

    it('should replace Decimal with number and remove Decimal import', () => {
      const input = `
        import { Decimal } from '../../prisma/internal/prismaNamespace';
        export class CreateTestDto {
          price: Decimal;
          total?: Decimal;
        }
      `;
      const output = stripDecorators(input);
      expect(output).not.toContain('import { Decimal }');
      expect(output).not.toContain(': Decimal');
      expect(output).toContain('price: number;');
      expect(output).toContain('total?: number;');
    });

    it('should redirect enum imports to frontend constants', () => {
      const input = `
        import { DocumentStatus } from '../../generated/prisma/enums';
        export class CreateTestDto {
          status: DocumentStatus;
        }
      `;
      const output = stripDecorators(input);
      expect(output).toContain("import { DocumentStatus } from '../../constants';");
      expect(output).toContain('export interface CreateTestDto {');
      expect(output).not.toContain('prisma/enums');
    });

    it('should redirect local DTO imports to interface files', () => {
      const input = "import { CreateTestDto } from './create-test.dto';";
      const output = stripDecorators(input);
      expect(output).toContain("import { CreateTestDto } from './create-test.interface';");
    });

    it('should convert internal classes to exported interfaces', () => {
      const input = 'class InternalDto { field: string; }';
      const output = stripDecorators(input);
      expect(output).toContain('export interface InternalDto {');
    });

    it('should cleanup extra newlines but preserve structure', () => {
      const input = `
        export class Test {


          field: string;


          another: number;

        }
      `;
      const output = stripDecorators(input);
      // Multiple newlines should be collapsed to max 2 (one blank line)
      expect(output).not.toMatch(/\n\s*\n\s*\n/);
      expect(output).toBe(
        'export interface Test {\n          field: string;\n          another: number;\n        }',
      );
    });
    it('should support class inheritance', () => {
      const input = `
        import { CreateTestDto } from './create-test.dto';
        export class UpdateTestDto extends CreateTestDto {
          id: string;
        }
      `;
      const output = stripDecorators(input);
      expect(output).toContain('export interface UpdateTestDto extends CreateTestDto {');
    });

    it('should rename nested helper DTOs to Input when mainModelName is provided', () => {
      const input = `
        import { ApiProperty } from '@nestjs/swagger';

        export class CreateNestedItemDto {
          @ApiProperty()
          name: string;
        }

        export class CreateMainDto {
          @ApiProperty({ type: [CreateNestedItemDto] })
          items: CreateNestedItemDto[];
        }
      `;
      const output = stripDecorators(input, 'Main');

      // Main DTO should stay as DTO (interface)
      expect(output).toContain('export interface CreateMainDto {');

      // Nested DTO definition should be renamed to Input
      expect(output).toContain('export interface CreateNestedItemInput {');
      expect(output).not.toContain('export interface CreateNestedItemDto {');

      // Usage inside Main DTO should be renamed
      expect(output).toContain('items: CreateNestedItemInput[];');
    });

    it('should apply sharedRenames to subsequent calls', () => {
      const sharedRenames = new Map<string, string>();

      // 1. Process Create DTO - populates sharedRenames
      const createInput = `
        export class NestedDto {}
        export class CreateMainDto {
          nested: NestedDto;
        }
      `;
      stripDecorators(createInput, 'Main', sharedRenames);
      expect(sharedRenames.get('NestedDto')).toBe('NestedInput');

      // 2. Process Update DTO - uses sharedRenames
      const updateInput = `
        import { NestedDto } from './create-main.dto';
        export class UpdateMainDto {
          nested: NestedDto;
        }
      `;
      const output = stripDecorators(updateInput, 'Main', sharedRenames);

      // Should rename usage of NestedDto to NestedInput based on map
      expect(output).toContain('nested: NestedInput;');
      expect(output).not.toContain('nested: NestedDto;');
    });
  });
});
