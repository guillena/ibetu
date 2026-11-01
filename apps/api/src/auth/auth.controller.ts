import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import type { InstantRegisterInput } from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('instant-register')
  instantRegister(@Body() body: InstantRegisterInput) {
    return this.auth.instantRegister(body);
  }

  @Post('magic-login')
  @HttpCode(200)
  magicLogin(@Body() body: { token: string }) {
    return this.auth.magicLogin(body?.token);
  }
}

