import { describe, it, expect } from 'vitest';
import {
  generateEntityContent,
  generateCreateDtoContent,
  generateRelationEnumContent,
} from './backend';
import { Model } from './types';

describe('Backend Generator', () => {
  const mockModel: Model = {
    name: 'User',
    singular: 'user',
    plural: 'users',
    fields: [
      {
        name: 'id',
        type: 'String',
        isOptional: false,
        isArray: false,
        isEnum: false,
        isRelation: false,
        isSystem: true,
        hasDefault: true,
      },
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
        name: 'role',
        type: 'Role',
        isOptional: true,
        isArray: false,
        isEnum: true,
        isRelation: false,
        isSystem: false,
        hasDefault: false,
      },
    ],
  };

  it('should generate correct entity content', () => {
    const content = generateEntityContent(mockModel);
    expect(content).toContain('class User');
    expect(content).toContain('@ApiProperty');
    expect(content).toContain('email: string');
  });

  it('should generate correct Zod DTO content (v4)', () => {
    const content = generateCreateDtoContent(mockModel);
    expect(content).toContain("import { z } from 'zod'");
    expect(content).toContain('z.enum(Role)');
    expect(content).toContain('CreateUserSchema = z.object');
  });

  it('should use z.uuid() for Id fields', () => {
    const modelWithId: Model = {
      ...mockModel,
      fields: [
        {
          name: 'categoryId',
          type: 'String',
          isOptional: false,
          isArray: false,
          isEnum: false,
          isRelation: false,
          isSystem: false,
          hasDefault: false,
        },
      ],
    };
    const content = generateCreateDtoContent(modelWithId);
    expect(content).toContain('categoryId: z.uuid()');
  });

  it('should generate relation enums', () => {
    const modelWithRelation: Model = {
      ...mockModel,
      fields: [
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
      ],
    };
    const content = generateRelationEnumContent(modelWithRelation);
    expect(content).toContain('enum UserRelations');
    expect(content).toContain("POSTS = 'posts'");
  });
});
