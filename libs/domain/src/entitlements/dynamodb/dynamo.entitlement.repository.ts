import {
    DynamoDBClient
  } from "@aws-sdk/client-dynamodb";
  import {
    DynamoDBDocumentClient,
    PutCommand,
    QueryCommand,
    GetCommand
  } from "@aws-sdk/lib-dynamodb";
import { EntitlementRepository } from "../app/ports/entitlement.repository";
import { Entitlement } from "../domain/entities/entitlement.entity";
import { EntitlementStatus } from "../domain/value-objects/entitlement-status.vo";
import { EntitlementUsage } from "../domain/entities/entitlement-usage.entity";
  
  
  export class DynamoEntitlementRepository implements EntitlementRepository {
    private readonly tableName: string;
    private readonly client: DynamoDBDocumentClient;
  
    constructor(tableName: string, client?: DynamoDBDocumentClient) {
      this.tableName = tableName;
  
      this.client =
        client ??
        DynamoDBDocumentClient.from(new DynamoDBClient({}), {
          marshallOptions: { removeUndefinedValues: true },
        });
    }
  
    async findByUser(userId: string): Promise<Entitlement[]> {
      const result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: "PK = :pk",
          ExpressionAttributeValues: {
            ":pk": `USER#${userId}`,
          },
        })
      );
  
      return (result.Items ?? []).map(this.toDomain);
    }

    async findByUserAndKey(userId: string, entitlementKey: string): Promise<Entitlement | null> {
      const result = await this.client.send(
        new GetCommand({
          TableName: this.tableName,
          Key: {
            PK: `USER#${userId}`,
            SK: `ENTITLEMENT#${entitlementKey}`,
          },
        })
      );
  
      if (!result.Item) {
        return null;
      }
  
      return this.toDomain(result.Item);
    }
  
    async save(entitlement: Entitlement): Promise<void> {
      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: this.toItem(entitlement),
        })
      );
    }
  
    async update(entitlement: Entitlement): Promise<void> {
      // Put is idempotent for this model
      await this.save(entitlement);
    }
  
    // ---------- Mapping ----------

    private omitUndefined(obj: Record<string, unknown>): Record<string, unknown> {
      return Object.fromEntries(
        Object.entries(obj).filter(([, v]) => v !== undefined)
      );
    }

    private toItem(entitlement: Entitlement): Record<string, any> {
      const item: Record<string, any> = {
        PK: `USER#${entitlement.userId}`,
        SK: `ENTITLEMENT#${entitlement.key}`,

        userId: entitlement.userId,
        entitlementKey: entitlement.key,
        role: entitlement.role,
        status: entitlement.status,

        grantedAt: entitlement.grantedAt.toISOString(),
      };

      if (entitlement.expiresAt != null) {
        item.expiresAt = entitlement.expiresAt.toISOString();
      }

      if (entitlement.usage) {
        const usage: Record<string, any> = {
          limit: entitlement.usage.limit,
          used: entitlement.usage.used,
          permanentLimit: entitlement.usage.permanentLimit ?? 0,
        };
        if (entitlement.usage.resetAt != null) {
          usage.resetAt = entitlement.usage.resetAt.toISOString();
        }
        if (entitlement.usage.resetStrategy != null) {
          usage.resetStrategy = this.omitUndefined(
            entitlement.usage.resetStrategy as unknown as Record<string, unknown>
          ) as Record<string, any>;
        }
        item.usage = usage;
      }

      return item;
    }
  
    private toDomain(item: Record<string, any>): Entitlement {
      return new Entitlement(
        item.userId,
        item.entitlementKey,
        item.role,
        item.status as EntitlementStatus,
        new Date(item.grantedAt),
        item.expiresAt ? new Date(item.expiresAt) : undefined,
        item.usage
          ? new EntitlementUsage(
              item.usage.limit,
              item.usage.used,
              item.usage.resetAt
                ? new Date(item.usage.resetAt)
                : undefined,
              item.usage.resetStrategy,
              item.usage.permanentLimit
            )
          : undefined
      );
    }
  }
  