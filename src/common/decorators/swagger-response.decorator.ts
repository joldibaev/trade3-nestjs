import { Type, applyDecorators } from '@nestjs/common';
import {
  ApiOkResponse,
  getSchemaPath,
  ApiExtraModels,
  ApiQuery,
} from '@nestjs/swagger';

/**
 * Standard structure for all successful API responses.
 */
export class StandardResponseDto<T> {
  success: boolean;
  data: T;
  timestamp: string;
}

/**
 * Swagger decorator to document a single object response wrapped in StandardResponseDto.
 *
 * @param model - The entity class to be documented inside 'data'
 */
export const ApiStandardResponse = <TModel extends Type<unknown>>(
  model: TModel,
) => {
  return applyDecorators(
    ApiExtraModels(StandardResponseDto, model),
    ApiOkResponse({
      schema: {
        allOf: [
          { $ref: getSchemaPath(StandardResponseDto) },
          {
            properties: {
              data: {
                $ref: getSchemaPath(model),
              },
            },
          },
        ],
      },
    }),
  );
};

/**
 * Swagger decorator to document an array response wrapped in StandardResponseDto.
 *
 * @param model - The entity class to be documented inside 'data' array
 */
export const ApiStandardResponseArray = <TModel extends Type<unknown>>(
  model: TModel,
) => {
  return applyDecorators(
    ApiExtraModels(StandardResponseDto, model),
    ApiOkResponse({
      schema: {
        allOf: [
          { $ref: getSchemaPath(StandardResponseDto) },
          {
            properties: {
              data: {
                type: 'array',
                items: { $ref: getSchemaPath(model) },
              },
            },
          },
        ],
      },
    }),
  );
};
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
