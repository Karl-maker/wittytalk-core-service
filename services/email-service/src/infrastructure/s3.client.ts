import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

export class S3TemplatesClient {
  constructor(
    private readonly bucket: string,
    private readonly client: S3Client = new S3Client({})
  ) {}

  async getObject(key: string): Promise<string> {
    const resp = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key })
    );
    const body = resp.Body;
    if (!body) throw new Error(`S3 object empty: ${key}`);
    return await body.transformToString("utf-8");
  }

  async getTemplate(key: string): Promise<string> {
    return this.getObject(key);
  }

  /** List keys with prefix (e.g. "partials/") */
  async listKeys(prefix: string): Promise<string[]> {
    const resp = await this.client.send(
      new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix })
    );
    const contents = resp.Contents ?? [];
    return contents.map((c) => c.Key!).filter(Boolean);
  }
}
