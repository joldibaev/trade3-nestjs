import {
  parseFields,
  mapType,
  generateEntityContent,
  generateInterfaceContent,
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
        isOptional: false,
        isArray: false,
        isRelation: false,
        isSystem: true,
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
  });

  describe('mapType', () => {
    it('should map Prisma types to TS types', () => {
      expect(mapType('String')).toBe('string');
      expect(mapType('Int')).toBe('number');
      expect(mapType('Float')).toBe('number');
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
          },
          {
            name: 'category',
            type: 'Category',
            isOptional: false,
            isArray: false,
            isRelation: true,
            isSystem: false,
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
          },
          {
            name: 'category',
            type: 'Category',
            isOptional: false,
            isArray: false,
            isRelation: true,
            isSystem: false,
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
          },
        ],
      };
      const content = generateRelationEnumsContent(model);

      expect(content).toContain('export enum StoreRelations {');
      expect(content).toContain("CASHBOXES = 'cashboxes',");
    });
  });
});
