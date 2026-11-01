import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/** Exige `Authorization: Bearer <jwt>` y deja `request.user = { id, username }`. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(JwtService) private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string = req.headers?.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Falta el token de sesión.');
    }
    try {
      const payload = await this.jwt.verifyAsync(token);
      req.user = { id: payload.sub, username: payload.username };
      return true;
    } catch {
      throw new UnauthorizedException('Sesión inválida o vencida.');
    }
  }
}

