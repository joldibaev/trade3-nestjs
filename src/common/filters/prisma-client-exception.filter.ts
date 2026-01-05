import { ArgumentsHost, Catch, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '../../generated/prisma/client';
import { Response } from 'express';

/**
 * Global exception filter for Prisma Client errors.
 * Catches common database errors (e.g., unique constraints, record not found)
 * and transforms them into appropriate HTTP exceptions.
 */
@Catch(
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientUnknownRequestError,
  Prisma.PrismaClientValidationError,
)
export class PrismaClientExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.handleKnownRequestError(exception, response);
    }

    // Fallback to default NestJS exception handling
    super.catch(exception, host);
  }

  /**
   * Handles Prisma-specific error codes.
   */
  private handleKnownRequestError(
    exception: Prisma.PrismaClientKnownRequestError,
    response: Response,
  ) {
    switch (exception.code) {
      case 'P2002':
        return this.handleP2002(exception, response);
      case 'P2025':
      case 'P2023':
        return this.handleP2025AndP2023(response);
      default:
        // Default error for unhandled Prisma codes
        return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'An unexpected database error occurred',
        });
    }
  }

  /**
   * Handles unique constraint violations (P2002).
   */
  private handleP2002(exception: Prisma.PrismaClientKnownRequestError, response: Response) {
    const status = HttpStatus.CONFLICT;
    const target = exception.meta?.target;

    let message = 'Unique constraint failed';

    if (Array.isArray(target) && target.length > 0) {
      message = `Unique constraint failed on the fields: (${target.join(', ')})`;
    } else if (typeof target === 'string') {
      message = `Unique constraint failed on the field: ${target}`;
    }

    return response.status(status).json({
      statusCode: status,
      message,
      error: 'Conflict',
    });
  }

  /**
   * Handles "record not found" (P2025) and "invalid ID format" (P2023) errors.
   */
  private handleP2025AndP2023(response: Response) {
    const status = HttpStatus.NOT_FOUND;

    return response.status(status).json({
      statusCode: status,
      message: 'Record not found or invalid ID format',
      error: 'Not Found',
    });
  }
}
