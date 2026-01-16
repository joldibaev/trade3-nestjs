import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Prisma } from '../../generated/prisma/client';
import { createApiResponse } from '../utils/response.util';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let title = 'Внутренняя ошибка сервера';
    let message: string | object = 'Произошла непредвиденная ошибка';

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const prismaError = this.handlePrismaError(exception);
      if (prismaError) {
        statusCode = prismaError.statusCode;
        title = prismaError.error;
        message = prismaError.message;
      } else {
        this.logger.error(exception);
      }
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const response = exception.getResponse();

      if (typeof response === 'object' && response !== null) {
        const resObj = response as Record<string, unknown>;
        title = (resObj.error as string) || 'Error';
        const msg = resObj.message;
        if (Array.isArray(msg)) {
          message = msg.join(', ');
        } else {
          message = (msg as string | object) || resObj;
        }
      } else {
        message = response;
        title = 'Error';
      }
    } else {
      // Log unexpected errors
      this.logger.error(exception);
    }

    const responseBody = createApiResponse(false, undefined, { title, message });
    httpAdapter.reply(ctx.getResponse(), responseBody, statusCode);
  }

  private handlePrismaError(exception: Prisma.PrismaClientKnownRequestError): {
    statusCode: number;
    message: string;
    error: string;
  } | null {
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

  private handleP2002(exception: Prisma.PrismaClientKnownRequestError) {
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

  private handleP2025AndP2023() {
    const status = HttpStatus.NOT_FOUND;
    return {
      statusCode: status,
      message: 'Запись не найдена или неверный формат ID',
      error: 'Не найдено',
    };
  }
}
