import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";

export class UnsubscribesRepository {
  constructor(
    private readonly tableName: string,
    private readonly client: DynamoDBClient = new DynamoDBClient({})
  ) {}

  async isUnsubscribed(email: string): Promise<boolean> {
    const normalized = email.trim().toLowerCase();
    const resp = await this.client.send(
      new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({ email: normalized }),
      })
    );
    return !!resp.Item;
  }

  async unsubscribe(email: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    await this.client.send(
      new PutItemCommand({
        TableName: this.tableName,
        Item: marshall({
          email: normalized,
          unsubscribedAt: new Date().toISOString(),
        }),
      })
    );
  }
}

export class EmailsSentRepository {
  constructor(
    private readonly tableName: string,
    private readonly client: DynamoDBClient = new DynamoDBClient({})
  ) {}

  async record(params: {
    id: string;
    to: string;
    template?: string;
    header: string;
    sentAt: string;
  }): Promise<void> {
    await this.client.send(
      new PutItemCommand({
        TableName: this.tableName,
        Item: marshall({
          id: params.id,
          to: params.to.toLowerCase(),
          template: params.template ?? null,
          header: params.header,
          sentAt: params.sentAt,
        }),
      })
    );
  }
}
