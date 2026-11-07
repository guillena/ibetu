import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import type {
  CompleteOAuthProfileInput,
  InstantRegisterInput,
  OAuthVerifyInput,
} from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('oauth/verify')
  @HttpCode(200)
  verifyOAuth(@Body() body: OAuthVerifyInput) {
    return this.auth.verifyOAuthToken(body);
  }

  @Post('oauth/complete-profile')
  completeOAuthProfile(@Body() body: CompleteOAuthProfileInput) {
    return this.auth.completeOAuthProfile(body);
  }

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
