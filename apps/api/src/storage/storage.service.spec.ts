import { ServiceUnavailableException } from '@nestjs/common';
import {
  DOWNLOAD_URL_TTL_SECONDS,
  R2StorageService,
  UPLOAD_URL_TTL_SECONDS,
} from './storage.service.js';

const ENV_KEYS = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_ENDPOINT'];

describe('R2StorageService – URLs pre-firmadas (sin red, credenciales de prueba)', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    process.env.R2_ACCOUNT_ID = 'acct123';
    process.env.R2_ACCESS_KEY_ID = 'AKIAFAKE';
    process.env.R2_SECRET_ACCESS_KEY = 'secretfake';
    process.env.R2_BUCKET = 'ibetu-evidence';
    delete process.env.R2_ENDPOINT;
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('firma una subida (PUT) al bucket de R2 con vencimiento de 15 minutos', async () => {
    const s = new R2StorageService();
    const res = await s.createUploadUrl('challenges/c1/u1/a.mp4', 'video/mp4', 1_234_567);
    const url = new URL(res.uploadUrl);

    expect(url.host).toBe('ibetu-evidence.acct123.r2.cloudflarestorage.com');
    expect(url.pathname).toBe('/challenges/c1/u1/a.mp4');
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(url.searchParams.get('X-Amz-Credential')).toContain('AKIAFAKE/');
    expect(url.searchParams.get('X-Amz-Expires')).toBe(String(UPLOAD_URL_TTL_SECONDS));
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(url.searchParams.get('x-id')).toBe('PutObject');
    expect(res.expiresInSeconds).toBe(900);
  });

  it('firma el tipo y el tamaño exactos: solo vale el archivo declarado', async () => {
    const s = new R2StorageService();
    const res = await s.createUploadUrl('challenges/c1/u1/a.mp4', 'video/mp4', 1_234_567);
    const signed = new URL(res.uploadUrl).searchParams.get('X-Amz-SignedHeaders')!.split(';');
    expect(signed).toEqual(expect.arrayContaining(['content-length', 'content-type', 'host']));
    expect(res.headers).toEqual({ 'Content-Type': 'video/mp4', 'Content-Length': '1234567' });
  });

  it('no incluye checksum del cuerpo (invalidaría la subida real)', async () => {
    const s = new R2StorageService();
    const url = new URL((await s.createUploadUrl('k.mp4', 'video/mp4', 10)).uploadUrl);
    expect([...url.searchParams.keys()].some((k) => k.toLowerCase().includes('checksum') && k !== 'X-Amz-Content-Sha256')).toBe(false);
  });

  it('un tamaño distinto produce otra firma', async () => {
    const s = new R2StorageService();
    const a = new URL((await s.createUploadUrl('k.mp4', 'video/mp4', 100)).uploadUrl);
    const b = new URL((await s.createUploadUrl('k.mp4', 'video/mp4', 101)).uploadUrl);
    expect(a.searchParams.get('X-Amz-Signature')).not.toBe(b.searchParams.get('X-Amz-Signature'));
  });

  it('firma la lectura (GET) con vencimiento de 1 hora', async () => {
    const s = new R2StorageService();
    const url = new URL(await s.createDownloadUrl('challenges/c1/u1/a.mp4'));
    expect(url.pathname).toBe('/challenges/c1/u1/a.mp4');
    expect(url.searchParams.get('X-Amz-Expires')).toBe(String(DOWNLOAD_URL_TTL_SECONDS));
    expect(url.searchParams.get('x-id')).toBe('GetObject');
  });

  it('respeta un endpoint personalizado (R2_ENDPOINT)', async () => {
    process.env.R2_ENDPOINT = 'https://storage.example.test';
    const s = new R2StorageService();
    const url = new URL(await s.createDownloadUrl('k.png'));
    expect(url.host).toContain('storage.example.test');
  });

  it('sin configuración informa que no está configurado y rechaza firmar (503)', async () => {
    delete process.env.R2_SECRET_ACCESS_KEY;
    const s = new R2StorageService();
    expect(s.isConfigured()).toBe(false);
    await expect(s.createUploadUrl('k.mp4', 'video/mp4', 10)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(s.createDownloadUrl('k.mp4')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('está configurado con cuenta + credenciales + bucket', () => {
    expect(new R2StorageService().isConfigured()).toBe(true);
  });
});

