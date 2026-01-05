import {
  parseFields,
  mapType,
  generateEntityContent,
  generateInterfaceContent,
  generateCreateDtoContent,
  generateRelationEnumsContent,
  Model,
  Models,
} from './index';

describe('Resource Generator', () => {
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
      expect(mapType('Decimal')).toBe('Decimal');
      expect(mapType('Boolean')).toBe('boolean');
      expect(mapType('DateTime')).toBe('Date');
      expect(mapType('CustomModel')).toBe('CustomModel');
    });
  });

  describe('generateEntityContent', () => {
    const allModels: Models = {
      Category: { name: 'Category', singular: 'category', fields: [] },
      Price: { name: 'Price', singular: 'price', fields: [] },
    };

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
      expect(content).toContain(
        "import { Category } from './category.entity';",
      );
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
      expect(content).toContain(
        "@ApiProperty({ type: 'number', required: true })",
      );
      expect(content).toContain('value: Decimal;');
      expect(content).toContain(
        "import { Decimal } from '../prisma/internal/prismaNamespace';",
      );
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
      expect(content).toContain(
        "import { DocumentStatus } from '../prisma/enums';",
      );
    });

    it('should avoid duplicate imports for same model relations', () => {
      const allModels: Models = {
        Store: { name: 'Store', singular: 'store', fields: [] },
      };
      const model: Model = {
        name: 'Transfer',
        singular: 'transfer',
        fields: [
          {
            name: 'from',
            type: 'Store',
            isOptional: false,
            isArray: false,
            isRelation: true,
            isSystem: false,
            isEnum: false,
          },
          {
            name: 'to',
            type: 'Store',
            isOptional: false,
            isArray: false,
            isRelation: true,
            isSystem: false,
            isEnum: false,
          },
        ],
      };

      const content = generateEntityContent(model, allModels);
      const importCount = (
        content.match(/import { Store } from '.\/store.entity';/g) || []
      ).length;
      expect(importCount).toBe(1);
    });
  });

  describe('generateInterfaceContent', () => {
    const allModels: Models = {
      Category: { name: 'Category', singular: 'category', fields: [] },
    };

    it('should generate interface without decorators', () => {
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

      const content = generateInterfaceContent(model, allModels);

      expect(content).toContain('export interface Product {');
      expect(content).toContain('category: Category;');
      expect(content).toContain(
        "import { Category } from './category.interface';",
      );
      expect(content).not.toContain('@ApiProperty');
    });

    it('should import enums from prisma/enums', () => {
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

      const content = generateInterfaceContent(model, {});
      expect(content).toContain(
        "import { DocumentStatus } from '../prisma/enums';",
      );
      expect(content).toContain('status: DocumentStatus;');
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
      expect(content).toContain(
        "import { Decimal } from '../../prisma/internal/prismaNamespace';",
      );
      expect(content).toContain('export class CreateStockDto {');
    });
  });

  describe('generateRelationEnumsContent', () => {
    it('should generate correct enums for relations', () => {
      const model: Model = {
        name: 'Store',
        singular: 'store',
        fields: [
          {
            name: 'cashboxes',
            type: 'Cashbox',
            isOptional: false,
            isArray: true,
            isRelation: true,
            isSystem: false,
            isEnum: false,
          },
        ],
      };
      const content = generateRelationEnumsContent(model);

      expect(content).toContain('export enum StoreRelations {');
      expect(content).toContain("CASHBOXES = 'cashboxes',");
    });
  });
});
