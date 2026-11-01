import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ObjectStorage, StoredObject } from '../storage/storage.service.js';
import { EVIDENCE_EVENT, EvidenceService, MAX_EVIDENCE_BYTES } from './evidence.service.js';

/** Almacenamiento en memoria que simula R2: el "cliente" sube con `put`. */
class FakeStorage implements ObjectStorage {
  objects = new Map<string, StoredObject>();
  uploadRequests: Array<{ key: string; contentType: string; sizeBytes: number }> = [];
  configured = true;
  failHead = false;

  isConfigured() {
    return this.configured;
  }
  async createUploadUrl(key: string, contentType: string, sizeBytes: number) {
    this.uploadRequests.push({ key, contentType, sizeBytes });
    return {
      uploadUrl: `https://fake-r2.test/${key}?sig=abc`,
      headers: { 'Content-Type': contentType, 'Content-Length': String(sizeBytes) },
      expiresInSeconds: 900,
    };
  }
  async createDownloadUrl(key: string) {
    return `https://fake-r2.test/${key}?get=1`;
  }
  async headObject(key: string) {
    if (this.failHead) throw new Error('getaddrinfo ENOTFOUND r2');
    return this.objects.get(key) ?? null;
  }
  put(key: string, size: number, contentType: string | null) {
    this.objects.set(key, { size, contentType });
  }
}

// Requiere `npm run db:up` (PostgreSQL local).
describe('EvidenceService – foto/video opcional (integración con PostgreSQL)', () => {
  const prisma = new PrismaService();
  const storage = new FakeStorage();
  const service = new EvidenceService(prisma, storage);
  const userIds: string[] = [];
  const challengeIds: string[] = [];
  const MB = 1024 * 1024;

  async function newUser() {
    const u = await prisma.user.create({
      data: { displayName: 'E', username: `e_${randomUUID().slice(0, 8)}`, coinsAvailable: 50 },
    });
    userIds.push(u.id);
    return u;
  }
  async function activeChallenge(status: any = 'ACTIVE', withJudge = false) {
    const a = await newUser();
    const b = await newUser();
    const judge = withJudge ? await newUser() : null;
    const c = await prisma.challenge.create({
      data: {
        inviteCode: randomUUID().slice(0, 10),
        title: 'Emboque de papel',
        creatorId: a.id,
        opponentId: b.id,
        judgeId: judge?.id ?? null,
        judgeAssignedAt: judge ? new Date() : null,
        stakeAmount: 10,
        status,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    challengeIds.push(c.id);
    return { c, a, b, judge };
  }
  const evidenceEvents = (id: string) =>
    prisma.challengeEvent.findMany({
      where: { challengeId: id, eventType: EVIDENCE_EVENT },
      orderBy: { createdAt: 'asc' },
    });

  /** Flujo completo de dos pasos: pide URL, "sube" y adjunta. */
  async function uploadAndAttach(challengeId: string, actorId: string, type = 'video/mp4', size = 3 * MB) {
    const up = await service.requestUploadUrl(challengeId, actorId, { contentType: type, sizeBytes: size });
    storage.put(up.key, size, type);
    return service.attach(challengeId, actorId, { key: up.key, contentType: type });
  }

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.challengeEvent.deleteMany({ where: { challengeId: { in: challengeIds } } });
    await prisma.challenge.deleteMany({ where: { id: { in: challengeIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  describe('paso 1: URL de subida', () => {
    it('entrega una URL firmada y una clave que pertenece al reto y al jugador', async () => {
      const { c, a } = await activeChallenge();
      const res = await service.requestUploadUrl(c.id, a.id, { contentType: 'video/mp4', sizeBytes: 5 * MB });

      expect(res.key).toMatch(new RegExp(`^challenges/${c.id}/${a.id}/[0-9a-f-]{36}\\.mp4$`));
      expect(res.uploadUrl).toContain(res.key);
      expect(res.headers).toEqual({ 'Content-Type': 'video/mp4', 'Content-Length': String(5 * MB) });
      expect(res.maxBytes).toBe(MAX_EVIDENCE_BYTES);
      expect(storage.uploadRequests.at(-1)).toMatchObject({ contentType: 'video/mp4', sizeBytes: 5 * MB });
    });

    it('acepta todos los tipos permitidos con su extensión', async () => {
      const { c, a } = await activeChallenge();
      const cases: Array<[string, string]> = [
        ['video/mp4', 'mp4'], ['video/quicktime', 'mov'], ['video/webm', 'webm'],
        ['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp'],
      ];
      for (const [type, ext] of cases) {
        const r = await service.requestUploadUrl(c.id, a.id, { contentType: type, sizeBytes: 1000 });
        expect(r.key.endsWith(`.${ext}`)).toBe(true);
      }
    });

    it('rechaza tipos no permitidos y tamaños inválidos o excesivos', async () => {
      const { c, a } = await activeChallenge();
      const req = (contentType: string, sizeBytes: number) =>
        service.requestUploadUrl(c.id, a.id, { contentType, sizeBytes });

      await expect(req('application/pdf', 1000)).rejects.toBeInstanceOf(BadRequestException);
      await expect(req('video/x-msvideo', 1000)).rejects.toBeInstanceOf(BadRequestException);
      await expect(req('video/mp4', 0)).rejects.toBeInstanceOf(BadRequestException);
      await expect(req('video/mp4', -5)).rejects.toBeInstanceOf(BadRequestException);
      await expect(req('video/mp4', 1.5)).rejects.toBeInstanceOf(BadRequestException);
      await expect(req('video/mp4', MAX_EVIDENCE_BYTES + 1)).rejects.toBeInstanceOf(BadRequestException);
      await expect(req('video/mp4', MAX_EVIDENCE_BYTES)).resolves.toBeDefined(); // el borde exacto sí
    });

    it('solo los jugadores del reto, y solo con el reto abierto a evidencia', async () => {
      const { c, a } = await activeChallenge();
      const stranger = await newUser();
      await expect(
        service.requestUploadUrl(c.id, stranger.id, { contentType: 'video/mp4', sizeBytes: 1000 }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      for (const status of ['PENDING', 'CLOSED', 'CANCELLED']) {
        const x = await activeChallenge(status);
        const err: any = await service
          .requestUploadUrl(x.c.id, x.a.id, { contentType: 'video/mp4', sizeBytes: 1000 })
          .catch((e) => e);
        expect(err).toBeInstanceOf(ConflictException);
        expect(err.getResponse()).toMatchObject({ code: 'EVIDENCE_NOT_ALLOWED', status });
      }
      for (const status of ['ACTIVE', 'RESULT', 'DISPUTE']) {
        const x = await activeChallenge(status);
        await expect(
          service.requestUploadUrl(x.c.id, x.a.id, { contentType: 'video/mp4', sizeBytes: 1000 }),
        ).resolves.toBeDefined();
      }
      void a;
    });

    it('un reto inexistente responde 404', async () => {
      const u = await newUser();
      await expect(
        service.requestUploadUrl(randomUUID(), u.id, { contentType: 'video/mp4', sizeBytes: 1000 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('paso 2: adjuntar al reto y dejar asiento en la bitácora', () => {
    it('adjunta el archivo subido y lo registra en la bitácora con quién y cuándo', async () => {
      const { c, a } = await activeChallenge();
      const res = await uploadAndAttach(c.id, a.id, 'video/mp4', 3 * MB);

      expect(res.attached).toBe(true);
      expect(res.evidence).toMatchObject({ kind: 'VIDEO', contentType: 'video/mp4', sizeBytes: 3 * MB, uploadedById: a.id });

      const events = await evidenceEvents(c.id);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ actorId: a.id, eventType: 'EVIDENCE_ADDED' });
      expect(events[0].payload).toMatchObject({ key: res.evidence.key, kind: 'VIDEO', sizeBytes: 3 * MB });
      expect(events[0].createdAt).toBeInstanceOf(Date);
    });

    it('distingue foto de video', async () => {
      const { c, b } = await activeChallenge();
      const res = await uploadAndAttach(c.id, b.id, 'image/jpeg', 200_000);
      expect(res.evidence.kind).toBe('IMAGE');
    });

    it('ambos jugadores pueden subir evidencia y quedan en orden cronológico', async () => {
      const { c, a, b } = await activeChallenge();
      await uploadAndAttach(c.id, a.id);
      await uploadAndAttach(c.id, b.id, 'image/png', 1000);
      const events = await evidenceEvents(c.id);
      expect(events.map((e) => e.actorId)).toEqual([a.id, b.id]);
    });

    it('es idempotente: adjuntar la misma clave dos veces no duplica el asiento (ni en paralelo)', async () => {
      const { c, a } = await activeChallenge();
      const up = await service.requestUploadUrl(c.id, a.id, { contentType: 'video/mp4', sizeBytes: 1000 });
      storage.put(up.key, 1000, 'video/mp4');

      const results = await Promise.all(
        Array.from({ length: 6 }, () => service.attach(c.id, a.id, { key: up.key, contentType: 'video/mp4' })),
      );
      expect(results.filter((r) => r.attached)).toHaveLength(1);
      expect(await evidenceEvents(c.id)).toHaveLength(1);
    });

    it('rechaza adjuntar si el archivo no se subió realmente', async () => {
      const { c, a } = await activeChallenge();
      const up = await service.requestUploadUrl(c.id, a.id, { contentType: 'video/mp4', sizeBytes: 1000 });
      const err: any = await service.attach(c.id, a.id, { key: up.key, contentType: 'video/mp4' }).catch((e) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.getResponse()).toMatchObject({ code: 'UPLOAD_NOT_FOUND' });
      expect(await evidenceEvents(c.id)).toHaveLength(0);
    });

    it('verifica contra el almacenamiento: tamaño excesivo o tipo distinto al declarado', async () => {
      const { c, a } = await activeChallenge();
      const big = await service.requestUploadUrl(c.id, a.id, { contentType: 'video/mp4', sizeBytes: 1000 });
      storage.put(big.key, MAX_EVIDENCE_BYTES + 1, 'video/mp4'); // subieron más de lo permitido
      await expect(service.attach(c.id, a.id, { key: big.key, contentType: 'video/mp4' })).rejects.toBeInstanceOf(BadRequestException);

      const mism = await service.requestUploadUrl(c.id, a.id, { contentType: 'video/mp4', sizeBytes: 1000 });
      storage.put(mism.key, 1000, 'application/octet-stream'); // tipo real distinto
      await expect(service.attach(c.id, a.id, { key: mism.key, contentType: 'video/mp4' })).rejects.toBeInstanceOf(BadRequestException);
      expect(await evidenceEvents(c.id)).toHaveLength(0);
    });

    it('no permite adjuntar claves ajenas: de otro reto, de otro jugador o con ".."', async () => {
      const x = await activeChallenge();
      const y = await activeChallenge();
      const upX = await service.requestUploadUrl(x.c.id, x.a.id, { contentType: 'video/mp4', sizeBytes: 1000 });
      storage.put(upX.key, 1000, 'video/mp4');

      // Clave del reto X presentada en el reto Y.
      await expect(service.attach(y.c.id, y.a.id, { key: upX.key, contentType: 'video/mp4' })).rejects.toBeInstanceOf(BadRequestException);
      // Clave del jugador A presentada por el jugador B del mismo reto.
      await expect(service.attach(x.c.id, x.b.id, { key: upX.key, contentType: 'video/mp4' })).rejects.toBeInstanceOf(BadRequestException);
      // Intento de salir del prefijo.
      const sneaky = `challenges/${x.c.id}/${x.a.id}/../${x.b.id}/f.mp4`;
      storage.put(sneaky, 1000, 'video/mp4');
      await expect(service.attach(x.c.id, x.a.id, { key: sneaky, contentType: 'video/mp4' })).rejects.toBeInstanceOf(BadRequestException);
      // Clave inválida / tipo inválido.
      await expect(service.attach(x.c.id, x.a.id, { key: undefined as any, contentType: 'video/mp4' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.attach(x.c.id, x.a.id, { key: upX.key, contentType: 'text/html' })).rejects.toBeInstanceOf(BadRequestException);
      expect(await evidenceEvents(x.c.id)).toHaveLength(0);
      expect(await evidenceEvents(y.c.id)).toHaveLength(0);
    });

    it('si R2 no responde al verificar, devuelve 503 (no un error interno) y no deja asiento', async () => {
      const { c, a } = await activeChallenge();
      const up = await service.requestUploadUrl(c.id, a.id, { contentType: 'video/mp4', sizeBytes: 1000 });
      storage.put(up.key, 1000, 'video/mp4');
      storage.failHead = true;
      try {
        await expect(
          service.attach(c.id, a.id, { key: up.key, contentType: 'video/mp4' }),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);
      } finally {
        storage.failHead = false;
      }
      expect(await evidenceEvents(c.id)).toHaveLength(0);
      // Al volver el servicio, el mismo adjunto funciona.
      await expect(service.attach(c.id, a.id, { key: up.key, contentType: 'video/mp4' })).resolves.toMatchObject({ attached: true });
    });

    it('rechaza a terceros y estados cerrados al adjuntar', async () => {
      const { c, a } = await activeChallenge();
      const stranger = await newUser();
      const up = await service.requestUploadUrl(c.id, a.id, { contentType: 'video/mp4', sizeBytes: 1000 });
      storage.put(up.key, 1000, 'video/mp4');
      await expect(service.attach(c.id, stranger.id, { key: up.key, contentType: 'video/mp4' })).rejects.toBeInstanceOf(ForbiddenException);

      await prisma.challenge.update({ where: { id: c.id }, data: { status: 'CLOSED' } });
      await expect(service.attach(c.id, a.id, { key: up.key, contentType: 'video/mp4' })).rejects.toBeInstanceOf(ConflictException);
      expect(await evidenceEvents(c.id)).toHaveLength(0);
    });
  });

  describe('ver la evidencia en el detalle', () => {
    it('lista la evidencia con URLs de lectura firmadas para jugadores y Juez', async () => {
      const { c, a, b, judge } = await activeChallenge('DISPUTE', true);
      const one = await uploadAndAttach(c.id, a.id);
      await uploadAndAttach(c.id, b.id, 'image/webp', 5000);

      for (const viewer of [a.id, b.id, judge!.id]) {
        const items = await service.list(c.id, viewer);
        expect(items).toHaveLength(2);
        expect(items[0]).toMatchObject({ key: one.evidence.key, kind: 'VIDEO', uploadedById: a.id });
        expect(items[0].url).toBe(`https://fake-r2.test/${one.evidence.key}?get=1`);
      }
    });

    it('un Juez solo propuesto (sin aprobación de ambos) todavía no ve la evidencia', async () => {
      const { c, a, judge } = await activeChallenge('DISPUTE', true);
      await uploadAndAttach(c.id, a.id);
      await prisma.challenge.update({ where: { id: c.id }, data: { judgeAssignedAt: null } }); // propuesto, no asignado
      await expect(service.list(c.id, judge!.id)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('un tercero no ve la evidencia y un reto sin evidencia devuelve lista vacía', async () => {
      const { c, a } = await activeChallenge();
      const stranger = await newUser();
      await expect(service.list(c.id, stranger.id)).rejects.toBeInstanceOf(ForbiddenException);
      expect(await service.list(c.id, a.id)).toEqual([]);
      await expect(service.list(randomUUID(), a.id)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('sin almacenamiento configurado lista la evidencia sin URL de lectura', async () => {
      const { c, a } = await activeChallenge();
      await uploadAndAttach(c.id, a.id);
      storage.configured = false;
      try {
        const items = await service.list(c.id, a.id);
        expect(items).toHaveLength(1);
        expect(items[0].url).toBeUndefined();
      } finally {
        storage.configured = true;
      }
    });
  });
});
