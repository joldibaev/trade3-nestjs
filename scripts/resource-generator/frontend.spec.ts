import { describe, it, expect } from 'vitest';
import {
  generateFrontendInterfaceContent,
  stripDecorators,
  generateFrontendConstants,
} from './frontend';
import { Model } from './types';

describe('Frontend Generator', () => {
  const mockModel: Model = {
    name: 'User',
    singular: 'user',
    plural: 'users',
    fields: [
      {
        name: 'email',
        type: 'String',
        isOptional: false,
        isArray: false,
        isEnum: false,
        isRelation: false,
        isSystem: false,
        hasDefault: false,
      },
      {
        name: 'balance',
        type: 'Decimal',
        isOptional: true,
        isArray: false,
        isEnum: false,
        isRelation: false,
        isSystem: false,
        hasDefault: false,
      },
    ],
  };

  it('should generate clean frontend interface', () => {
    const content = generateFrontendInterfaceContent(mockModel);
    expect(content).toContain('interface User');
    expect(content).toContain('email: string');
    expect(content).toContain('balance?: number'); // Decimal -> number conversion
  });

  it('should generate clean frontend interface with relations', () => {
    const modelWithRelations: Model = {
      ...mockModel,
      fields: [
        ...mockModel.fields,
        {
          name: 'posts',
          type: 'Post',
          isOptional: true,
          isArray: true,
          isEnum: false,
          isRelation: true,
          isSystem: false,
          hasDefault: false,
        },
        {
          name: 'profile',
          type: 'Profile',
          isOptional: true,
          isArray: false,
          isEnum: false,
          isRelation: true,
          isSystem: false,
          hasDefault: false,
        },
      ],
    };
    const content = generateFrontendInterfaceContent(modelWithRelations);
    expect(content).toContain('interface User');
    expect(content).toContain("import { Post } from './post.interface';");
    expect(content).toContain("import { Profile } from './profile.interface';");
    expect(content).toContain('posts?: Post[];');
    expect(content).toContain('profile?: Profile;');
  });

  it('should generate frontend constants from enums', () => {
    const schema = 'enum Role { ADMIN USER }';
    const content = generateFrontendConstants(schema);
    expect(content).toContain('export const Role = {');
    expect(content).toContain("ADMIN: 'ADMIN'");
    expect(content).toContain('export type Role = (typeof Role)[keyof typeof Role]');
  });

  describe('stripDecorators', () => {
    it('should strip NestJS and Zod decorators/imports and extract fields', () => {
      const input = `
        import { createZodDto } from 'nestjs-zod';
        import { z } from 'zod';
        
        export const CreateUserSchema = z.object({
          email: z.string().email(),
          age: z.number().optional(),
          role: z.enum(UserRole),
        });

        @ApiProperty()
        export class CreateUserDto extends createZodDto(CreateUserSchema) {}
      `;
      const output = stripDecorators(input, 'User');
      expect(output).not.toContain('@ApiProperty');
      expect(output).not.toContain('import { z }');
      expect(output).toContain('// This file is auto-generated. Do not edit.');
      expect(output).toContain('export interface CreateUserDto');
      expect(output).toContain('email: string;');
      expect(output).toContain('age?: number;');
      expect(output).toContain('role: UserRole;');
    });

    it('should handle coerce and special types', () => {
      const input = `
        export const SpecialSchema = z.object({
          count: z.coerce.number(),
          isActive: z.coerce.boolean(),
          date: z.coerce.date(),
          eventDate: z.string().datetime(),
          tags: z.array(z.string()),
        });
        export class SpecialDto extends createZodDto(SpecialSchema) {}
      `;
      const output = stripDecorators(input, 'Special');
      expect(output).toContain('count: number;');
      expect(output).toContain('isActive: boolean;');
      expect(output).toContain('date: string;');
      expect(output).toContain('eventDate: string;');
      expect(output).toContain('tags: string[];');
    });

    it('should handle DTO arrays', () => {
      const input = `
        export const BulkSchema = z.object({
          items: z.array(ItemSchema),
        });
        export class BulkDto extends createZodDto(BulkSchema) {}
      `;
      const output = stripDecorators(input, 'Bulk');
      expect(output).toContain('items: ItemDto[];');
    });

    it('should convert Update DTOs to Partial types', () => {
      const input = `
        export const CreateUserSchema = z.object({ email: z.string() });
        export const UpdateUserSchema = CreateUserSchema.partial();
        export class CreateUserDto extends createZodDto(CreateUserSchema) {}
        export class UpdateUserDto extends createZodDto(UpdateUserSchema) {}
      `;
      const output = stripDecorators(input, 'User');
      expect(output).toContain('export type UpdateUserDto = Partial<CreateUserDto>;');
    });

    it('should convert Update DTOs with inline partials (single line) to Partial types', () => {
      const input = `
        import { CreateBarcodeSchema } from './create-barcode.dto';
        export class UpdateBarcodeDto extends createZodDto(CreateBarcodeSchema.partial()) {}
      `;
      const output = stripDecorators(input, 'Barcode');
      expect(output).toContain('export type UpdateBarcodeDto = Partial<CreateBarcodeDto>;');
    });

    it('should convert Update DTOs with inline partials (multi-line) to Partial types', () => {
      const input = `
        import { CreateDocumentPurchaseSchema } from './create-document-purchase.dto';
        export class UpdateDocumentPurchaseDto extends createZodDto(
          CreateDocumentPurchaseSchema.partial(),
        ) {}
      `;
      const output = stripDecorators(input, 'DocumentPurchase');
      expect(output).toContain(
        'export type UpdateDocumentPurchaseDto = Partial<CreateDocumentPurchaseDto>;',
      );
    });

    it('should normalize whitespace correctly', () => {
      const input = `
        import { z } from 'zod';
        export const EmptySchema = z.object({
        
          field: z.string(),
           
        });
        export class EmptyDto extends createZodDto(EmptySchema) {}
      `;
      const output = stripDecorators(input, 'Empty');
      // Check for exactly one newline between imports and export
      expect(output).toMatch(/\/\/ This file.*?\n\nexport interface EmptyDto/s);
      // Check that field has proper indentation and no empty lines around it
      expect(output).toContain('{\n  field: string;\n}');
    });
  });
});
