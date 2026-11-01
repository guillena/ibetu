import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { WhatsappService } from './whatsapp.service.js';

@Controller()
export class WhatsappController {
  constructor(@Inject(WhatsappService) private readonly wsp: WhatsappService) {}

  @Post('auth/whatsapp/link-token')
  @UseGuards(JwtAuthGuard)
  linkToken(@Req() req: { user: { id: string } }) {
    return this.wsp.createLinkToken(req.user.id);
  }

  /** Verificación del webhook exigida por Meta (WhatsApp Cloud API). */
  @Get('webhooks/whatsapp')
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const expected = process.env.WHATSAPP_VERIFY_TOKEN;
    if (mode === 'subscribe' && expected && token === expected) return challenge;
    throw new ForbiddenException();
  }

  /** Recibe mensajes entrantes (payload de WhatsApp Cloud API). */
  @Post('webhooks/whatsapp')
  @HttpCode(200)
  async incoming(@Body() body: any) {
    const messages: Array<{ from: string; text?: { body?: string } }> = [];
    for (const entry of body?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        messages.push(...(change?.value?.messages ?? []));
      }
    }
    const results = [];
    for (const m of messages) {
      results.push(await this.wsp.handleIncomingMessage(m.from, m.text?.body ?? ''));
    }
    return { received: messages.length, results };
  }
}

