import { ApiQuery } from '@nestjs/swagger';

/**
 * Swagger decorator to document a multi-select 'include' query parameter.
 *
 * @param entityEnum - The relation enum created by the resource generator
 */
export const ApiIncludeQuery = (entityEnum: Record<string, string>) => {
  return ApiQuery({
    name: 'include',
    enum: entityEnum,
    required: false,
    isArray: true,
    description: 'Relations to include',
  });
};
