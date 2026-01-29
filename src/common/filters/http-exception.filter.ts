import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { ZodValidationException } from 'nestjs-zod';
import { ZodError } from 'zod';

import { Prisma } from '../../generated/prisma/client';
import { createApiResponse } from '../utils/response.util';

interface PrismaErrorResponse {
  statusCode: number;
  message: string;
  error: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<FastifyRequest>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let title = 'Внутренняя ошибка сервера';
    let message: string | object = 'Произошла непредвиденная ошибка';

    const statusTitles: Record<number, string> = {
      [HttpStatus.UNAUTHORIZED]: 'Ошибка авторизации',
      [HttpStatus.FORBIDDEN]: 'Доступ запрещен',
      [HttpStatus.NOT_FOUND]: 'Ресурс не найден',
      [HttpStatus.BAD_REQUEST]: 'Некорректный запрос',
      [HttpStatus.CONFLICT]: 'Конфликт данных',
      [HttpStatus.INTERNAL_SERVER_ERROR]: 'Внутренняя ошибка сервера',
    };

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const prismaError = this.handlePrismaError(exception);
      if (prismaError) {
        statusCode = prismaError.statusCode;
        title = prismaError.error;
        message = prismaError.message;
      } else {
        this.logger.error(exception);
      }
    } else if (exception instanceof ZodValidationException) {
      statusCode = HttpStatus.BAD_REQUEST;
      title = 'Ошибка валидации';
      const zodError = exception.getZodError() as ZodError;
      message = zodError.issues.map((err) => `${err.path.join('.')}: ${err.message}`).join('; ');
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const response = exception.getResponse();
      title = statusTitles[statusCode] || 'Ошибка';

      if (statusCode === HttpStatus.BAD_REQUEST || statusCode === HttpStatus.NOT_FOUND) {
        this.logger.debug(`Error (${statusCode}): ${JSON.stringify(response, null, 2)}`);
      }

      if (typeof response === 'object' && response !== null) {
        const resObj = response as Record<string, unknown>;
        const msg = resObj.message;
        if (Array.isArray(msg)) {
          message = msg.join(', ');
        } else {
          message = (msg as string | object) || resObj;
        }
      } else {
        message = response;
      }

      // Improve 404 message from Fastify default
      if (
        statusCode === HttpStatus.NOT_FOUND &&
        typeof message === 'string' &&
        message.startsWith('Cannot ')
      ) {
        message = `Запрашиваемый путь не найден: ${request.url}`;
      }
    } else {
      // Log unexpected errors
      this.logger.error(exception);
    }

    const responseBody = createApiResponse(false, undefined, { title, message });
    httpAdapter.reply(ctx.getResponse(), responseBody, statusCode);
  }

  private handlePrismaError(
    exception: Prisma.PrismaClientKnownRequestError,
  ): PrismaErrorResponse | null {
    switch (exception.code) {
      case 'P2002':
        return this.handleP2002(exception);
      case 'P2025':
      case 'P2023':
        return this.handleP2025AndP2023();
      default:
        return null;
    }
  }

  private handleP2002(exception: Prisma.PrismaClientKnownRequestError): PrismaErrorResponse {
    const status = HttpStatus.CONFLICT;
    const target = exception.meta?.target;
    let message = 'Нарушение уникальности';

    if (Array.isArray(target) && target.length > 0) {
      message = `Нарушение уникальности полей: (${target.join(', ')})`;
    } else if (typeof target === 'string') {
      message = `Нарушение уникальности поля: ${target}`;
    }

    return {
      statusCode: status,
      message,
      error: 'Конфликт',
    };
  }

  private handleP2025AndP2023(): PrismaErrorResponse {
    const status = HttpStatus.NOT_FOUND;
    return {
      statusCode: status,
      message: 'Запись не найдена или неверный формат ID',
      error: 'Не найдено',
    };
  }
}
