import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

/**
 * Minimal user shape for email templates and unsubscribe (name, profile image, email).
 * Fetched from the auth-service users table by userId.
 */
export interface UserProfile {
  name?: string;
  profileImageUrl?: string;
  email?: string;
}

/**
 * Reads user profile (name, picture) from the users DynamoDB table by userId.
 * Table key: PK = USER#${userId}, SK = PROFILE. Field "picture" is exposed as profileImageUrl.
 */
export class UserClient {
  constructor(
    private readonly tableName: string,
    private readonly client: DynamoDBDocumentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}))
  ) {}

  async getProfileByUserId(userId: string): Promise<UserProfile | null> {
    if (!userId?.trim()) return null;
    try {
      const result = await this.client.send(
        new GetCommand({
          TableName: this.tableName,
          Key: {
            PK: `USER#${userId.trim()}`,
            SK: "PROFILE",
          },
        })
      );
      if (!result.Item) return null;
      const item = result.Item as Record<string, unknown>;
      return {
        name: item.name != null ? String(item.name) : undefined,
        profileImageUrl: item.picture != null ? String(item.picture) : undefined,
        email: item.email != null ? String(item.email) : undefined,
      };
    } catch {
      return null;
    }
  }
}
