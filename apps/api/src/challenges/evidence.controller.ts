import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { EvidenceService } from './evidence.service.js';

type AuthedReq = { user: { id: string } };

@Controller('challenges/:id/evidence')
@UseGuards(JwtAuthGuard)
export class EvidenceController {
  constructor(@Inject(EvidenceService) private readonly evidence: EvidenceService) {}

  @Post('upload-url')
  @HttpCode(200)
  uploadUrl(
    @Req() req: AuthedReq,
    @Param('id') id: string,
    @Body() body: { contentType: string; sizeBytes: number },
  ) {
    return this.evidence.requestUploadUrl(id, req.user.id, body);
  }

  @Post()
  @HttpCode(200)
  attach(
    @Req() req: AuthedReq,
    @Param('id') id: string,
    @Body() body: { key: string; contentType: string; sizeBytes?: number },
  ) {
    return this.evidence.attach(id, req.user.id, body);
  }

  @Get()
  list(@Req() req: AuthedReq, @Param('id') id: string) {
    return this.evidence.list(id, req.user.id);
  }
}

