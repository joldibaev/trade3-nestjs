import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { createApiResponse } from '../utils/response.util';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, unknown> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ url: string }>();
    const path = request.url;

    // Only transform responses for API routes
    if (!path.startsWith('/api')) {
      return next.handle();
    }

    return next.handle().pipe(map((data: T) => createApiResponse(true, data)));
  }
}
