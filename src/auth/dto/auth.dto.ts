import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const LoginSchema = z.object({
  email: z.email('Некорректный email'),
  password: z.string().min(1, 'Пароль обязателен'),
});

export class LoginDto extends createZodDto(LoginSchema) {}
