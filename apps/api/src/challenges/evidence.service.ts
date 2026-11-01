import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Challenge, ChallengeStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { OBJECT_STORAGE } from '../storage/storage.service.js';
import type { ObjectStorage } from '../storage/storage.service.js';

export const MAX_EVIDENCE_BYTES = 15 * 1024 * 1024; // 15 MB
export const EVIDENCE_EVENT = 'EVIDENCE_ADDED';

/** Tipos de archivo permitidos como evidencia (video o foto). */
export const EVIDENCE_TYPES: Record<string, { ext: string; kind: 'VIDEO' | 'IMAGE' }> = {
  'video/mp4': { ext: 'mp4', kind: 'VIDEO' },
  'video/quicktime': { ext: 'mov', kind: 'VIDEO' },
  'video/webm': { ext: 'webm', kind: 'VIDEO' },
  'image/jpeg': { ext: 'jpg', kind: 'IMAGE' },
  'image/png': { ext: 'png', kind: 'IMAGE' },
  'image/webp': { ext: 'webp', kind: 'IMAGE' },
};

/** Estados en los que se puede subir evidencia. */
const OPEN_STATES: ChallengeStatus[] = ['ACTIVE', 'RESULT', 'DISPUTE'];

export interface EvidenceItem {
  key: string;
  kind: 'VIDEO' | 'IMAGE';
  contentType: string;
  sizeBytes: number;
  uploadedById: string | null;
  uploadedAt: Date;
  url?: string;
}

@Injectable()
export class EvidenceService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  /** Paso 1: el jugador pide una URL para subir el archivo directo a R2. */
  async requestUploadUrl(
    challengeId: string,
    actorId: string,
    input: { contentType: string; sizeBytes: number },
  ) {
    const challenge = await this.loadForUpload(challengeId, actorId);
    this.validateFile(input.contentType, input.sizeBytes);

    const { ext } = EVIDENCE_TYPES[input.contentType];
    const key = `challenges/${challenge.id}/${actorId}/${randomUUID()}.${ext}`;
    const upload = await this.storage.createUploadUrl(key, input.contentType, input.sizeBytes);
    return { key, ...upload, maxBytes: MAX_EVIDENCE_BYTES };
  }

  /**
   * Paso 2: una vez subido el archivo, se adjunta al reto. Se verifica en R2 que el
   * objeto exista y coincida, y se deja asentado en la bitácora. Idempotente por clave.
   */
  async attach(
    challengeId: string,
    actorId: string,
    input: { key: string; contentType: string; sizeBytes?: number },
  ): Promise<{ attached: boolean; evidence: EvidenceItem }> {
    const challenge = await this.loadForUpload(challengeId, actorId);

    const prefix = `challenges/${challenge.id}/${actorId}/`;
    if (typeof input.key !== 'string' || !input.key.startsWith(prefix) || input.key.includes('..')) {
      throw new BadRequestException('La clave del archivo no corresponde a este reto y jugador.');
    }
    const type = EVIDENCE_TYPES[input.contentType];
    if (!type) throw new BadRequestException('Tipo de archivo no permitido.');

    let stored;
    try {
      stored = await this.storage.headObject(input.key);
    } catch (err) {
      if (err instanceof HttpException) throw err;
      // R2 no respondió: es un problema transitorio del servicio, no del pedido del usuario.
      throw new ServiceUnavailableException(
        'No pudimos verificar el archivo en este momento. Probá de nuevo en unos minutos.',
      );
    }
    if (!stored) {
      throw new BadRequestException({
        code: 'UPLOAD_NOT_FOUND',
        message: 'El archivo todavía no se subió o no existe.',
      });
    }
    this.validateFile(input.contentType, stored.size);
    if (stored.contentType && stored.contentType !== input.contentType) {
      throw new BadRequestException('El tipo del archivo subido no coincide con el declarado.');
    }

    return this.prisma.$transaction(async (tx) => {
      // Serializa adjuntos concurrentes del mismo reto para que la misma clave no se duplique.
      await tx.$queryRaw`SELECT id FROM "Challenge" WHERE id = ${challenge.id} FOR UPDATE`;
      const existing = await tx.challengeEvent.findFirst({
        where: {
          challengeId: challenge.id,
          eventType: EVIDENCE_EVENT,
          payload: { path: ['key'], equals: input.key },
        },
      });
      if (existing) {
        return { attached: false, evidence: this.toItem(existing) };
      }
      const event = await tx.challengeEvent.create({
        data: {
          challengeId: challenge.id,
          actorId,
          eventType: EVIDENCE_EVENT,
          payload: {
            key: input.key,
            kind: type.kind,
            contentType: input.contentType,
            sizeBytes: stored.size,
          },
        },
      });
      return { attached: true, evidence: this.toItem(event) };
    });
  }

  /** Evidencia del reto con URLs de lectura firmadas. Visible para jugadores y Juez. */
  async list(challengeId: string, actorId: string): Promise<EvidenceItem[]> {
    const challenge = await this.prisma.challenge.findUnique({ where: { id: challengeId } });
    if (!challenge) throw new NotFoundException('El reto no existe.');
    // El Juez solo ve la evidencia una vez que ambos jugadores lo aprobaron (no como candidato).
    const judgeAssigned = challenge.judgeAssignedAt ? challenge.judgeId : null;
    const allowed = [challenge.creatorId, challenge.opponentId, judgeAssigned];
    if (!allowed.includes(actorId)) {
      throw new ForbiddenException('Solo los jugadores y el Juez pueden ver la evidencia.');
    }
    const events = await this.prisma.challengeEvent.findMany({
      where: { challengeId, eventType: EVIDENCE_EVENT },
      orderBy: { createdAt: 'asc' },
    });
    const items: EvidenceItem[] = [];
    for (const e of events) {
      const item = this.toItem(e);
      item.url = this.storage.isConfigured() ? await this.storage.createDownloadUrl(item.key) : undefined;
      items.push(item);
    }
    return items;
  }

  // ---- helpers ----

  private async loadForUpload(challengeId: string, actorId: string): Promise<Challenge> {
    const challenge = await this.prisma.challenge.findUnique({ where: { id: challengeId } });
    if (!challenge) throw new NotFoundException('El reto no existe.');
    if (actorId !== challenge.creatorId && actorId !== challenge.opponentId) {
      throw new ForbiddenException('Solo los jugadores del reto pueden subir evidencia.');
    }
    if (!OPEN_STATES.includes(challenge.status)) {
      throw new ConflictException({
        code: 'EVIDENCE_NOT_ALLOWED',
        message: 'En este estado el reto no admite evidencia.',
        status: challenge.status,
      });
    }
    return challenge;
  }

  private validateFile(contentType: string, sizeBytes: number) {
    if (!EVIDENCE_TYPES[contentType]) {
      throw new BadRequestException('Tipo de archivo no permitido. Usá video MP4/MOV/WebM o foto JPG/PNG/WebP.');
    }
    if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
      throw new BadRequestException('El tamaño del archivo es inválido.');
    }
    if (sizeBytes > MAX_EVIDENCE_BYTES) {
      throw new BadRequestException(`El archivo supera el máximo de ${MAX_EVIDENCE_BYTES / (1024 * 1024)} MB.`);
    }
  }

  private toItem(e: { payload: unknown; actorId: string | null; createdAt: Date }): EvidenceItem {
    const p = (e.payload ?? {}) as Record<string, any>;
    return {
      key: p.key,
      kind: p.kind,
      contentType: p.contentType,
      sizeBytes: p.sizeBytes,
      uploadedById: e.actorId,
      uploadedAt: e.createdAt,
    };
  }
}
