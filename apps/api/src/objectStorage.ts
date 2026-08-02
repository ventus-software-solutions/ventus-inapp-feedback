import {
  DeleteObjectCommand,
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface ObjectStorage {
  ready(): Promise<boolean>;
  put(key: string, data: Uint8Array, mediaType: string): Promise<void>;
  delete(key: string): Promise<void>;
  createDownloadUrl(
    key: string,
    fileName: string,
    expiresInSeconds?: number,
  ): Promise<string>;
}

export class S3ObjectStorage implements ObjectStorage {
  readonly #client: S3Client;
  readonly #presignClient: S3Client;

  constructor(
    readonly bucket: string,
    options: {
      endpoint?: string;
      publicEndpoint?: string;
      region: string;
      accessKeyId?: string;
      secretAccessKey?: string;
      forcePathStyle?: boolean;
      serverSideEncryption?: boolean;
    },
  ) {
    const shared = {
      region: options.region,
      ...(options.accessKeyId && options.secretAccessKey
        ? {
            credentials: {
              accessKeyId: options.accessKeyId,
              secretAccessKey: options.secretAccessKey,
            },
          }
        : {}),
      forcePathStyle: options.forcePathStyle ?? false,
    };
    const publicEndpoint = options.publicEndpoint ?? options.endpoint;
    this.#client = new S3Client({
      ...shared,
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
    });
    this.#presignClient = new S3Client({
      ...shared,
      ...(publicEndpoint ? { endpoint: publicEndpoint } : {}),
    });
    this.serverSideEncryption = options.serverSideEncryption ?? false;
  }

  readonly serverSideEncryption: boolean;

  async ready(): Promise<boolean> {
    try {
      await this.#client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch {
      return false;
    }
  }

  async ensureBucket(): Promise<void> {
    if (await this.ready()) return;
    await this.#client.send(new CreateBucketCommand({ Bucket: this.bucket }));
  }

  async put(key: string, data: Uint8Array, mediaType: string): Promise<void> {
    await this.#client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: mediaType,
        ...(this.serverSideEncryption
          ? { ServerSideEncryption: "AES256" as const }
          : {}),
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.#client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async createDownloadUrl(
    key: string,
    fileName: string,
    expiresInSeconds = 300,
  ): Promise<string> {
    return getSignedUrl(
      this.#presignClient,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${fileName.replaceAll('"', "")}"`,
      }),
      { expiresIn: Math.min(900, Math.max(30, expiresInSeconds)) },
    );
  }
}

export class MemoryObjectStorage implements ObjectStorage {
  readonly objects = new Map<string, { data: Uint8Array; mediaType: string }>();

  async ready(): Promise<boolean> {
    return true;
  }
  async put(key: string, data: Uint8Array, mediaType: string): Promise<void> {
    this.objects.set(key, { data: new Uint8Array(data), mediaType });
  }
  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
  async createDownloadUrl(key: string): Promise<string> {
    if (!this.objects.has(key)) throw new Error("Object not found.");
    return `memory://attachment/${encodeURIComponent(key)}`;
  }
}
