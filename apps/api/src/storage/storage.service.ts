import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export const UPLOAD_URL_TTL_SECONDS = 15 * 60;
export const DOWNLOAD_URL_TTL_SECONDS = 60 * 60;

export interface UploadUrl {
  uploadUrl: string;
  /** Cabeceras que el cliente debe enviar tal cual en el PUT (están firmadas). */
  headers: Record<string, string>;
  expiresInSeconds: number;
}

export interface StoredObject {
  size: number;
  contentType: string | null;
}

/** Contrato mínimo de almacenamiento de objetos (Cloudflare R2 / S3). */
export interface ObjectStorage {
  isConfigured(): boolean;
  createUploadUrl(key: string, contentType: string, sizeBytes: number): Promise<UploadUrl>;
  createDownloadUrl(key: string): Promise<string>;
  /** null si el objeto no existe. */
  headObject(key: string): Promise<StoredObject | null>;
}

@Injectable()
export class R2StorageService implements ObjectStorage {
  private client: S3Client | null = null;

  private get bucket(): string {
    return process.env.R2_BUCKET ?? '';
  }

  isConfigured(): boolean {
    return Boolean(
      process.env.R2_ACCESS_KEY_ID &&
        process.env.R2_SECRET_ACCESS_KEY &&
        process.env.R2_BUCKET &&
        (process.env.R2_ENDPOINT || process.env.R2_ACCOUNT_ID),
    );
  }

  private getClient(): S3Client {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'El almacenamiento de evidencia no está configurado.',
      );
    }
    if (!this.client) {
      this.client = new S3Client({
        region: 'auto',
        // El SDK nuevo agrega por defecto un checksum del cuerpo; en una URL pre-firmada se
        // calcularía sobre un cuerpo vacío e invalidaría la subida real. Solo cuando es requerido.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
        endpoint:
          process.env.R2_ENDPOINT ??
          `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID!,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        },
      });
    }
    return this.client;
  }

  /**
   * URL pre-firmada de subida (PUT). Firma el tipo y el tamaño exactos: el archivo se
   * sube directo a R2 y solo vale si coincide con lo declarado.
   */
  async createUploadUrl(key: string, contentType: string, sizeBytes: number): Promise<UploadUrl> {
    const client = this.getClient();
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: sizeBytes,
    });
    const uploadUrl = await getSignedUrl(client, command, {
      expiresIn: UPLOAD_URL_TTL_SECONDS,
      signableHeaders: new Set(['content-type', 'content-length']),
    });
    return {
      uploadUrl,
      headers: { 'Content-Type': contentType, 'Content-Length': String(sizeBytes) },
      expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
    };
  }

  async createDownloadUrl(key: string): Promise<string> {
    const client = this.getClient();
    return getSignedUrl(client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: DOWNLOAD_URL_TTL_SECONDS,
    });
  }

  async headObject(key: string): Promise<StoredObject | null> {
    const client = this.getClient();
    try {
      const res = await client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: res.ContentLength ?? 0, contentType: res.ContentType ?? null };
    } catch (err: any) {
      if (err?.name === 'NotFound' || err?.$metadata?.httpStatusCode === 404) return null;
      throw err;
    }
  }
}
