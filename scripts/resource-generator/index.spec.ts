import {
  parseFields,
  mapType,
  generateEntityContent,
  generateInterfaceContent,
  generateAllEnumsContent,
  generateCreateDtoContent,
  toKebabCase,
  Model,
  Models,
} from './index';

describe('Resource Generator', () => {
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
    it('should map Prisma types to TS types', () => {
      expect(mapType('String')).toBe('string');
      expect(mapType('Int')).toBe('number');
      expect(mapType('Float')).toBe('number');
      expect(mapType('Decimal')).toBe('number');
      expect(mapType('Boolean')).toBe('boolean');
      expect(mapType('DateTime')).toBe('Date');
      expect(mapType('CustomModel')).toBe('CustomModel');
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

      const content = generateInterfaceContent(model, allModels, { ProductStatus: ['ACTIVE'] });

      expect(content).toContain('export interface Product {');
      expect(content).toContain('category: Category;');
      expect(content).toContain("import { Category } from './category.interface';");
      expect(content).toContain("import { ProductStatus } from './constants';");
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
      const content = generateInterfaceContent(model, {}, {});
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
      const content = generateInterfaceContent(model, {}, {});
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
});
