import jwt from "jsonwebtoken";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

export class JwtGenerator {
  private secret: string | null = null;

  async initialize(projectName: string, environment: string): Promise<void> {
    // Must match secret name used by services that verify this token (e.g. conversation-user-service)
    const secretName = `${projectName}-${environment}-jwt-access-token-secret`;
    const secretsClient = new SecretsManagerClient({ region: "us-east-1" });

    try {
      const response = await secretsClient.send(
        new GetSecretValueCommand({ SecretId: secretName })
      );

      const secretString = response.SecretString || "";
      // Parse same as Terraform/verifying services: use "key" from JSON, else raw string
      try {
        const parsed = JSON.parse(secretString) as Record<string, unknown>;
        const fromKey = parsed?.key;
        this.secret =
          typeof fromKey === "string" ? fromKey : (secretString as string);
      } catch {
        this.secret = secretString;
      }
      if (!this.secret || typeof this.secret !== "string") {
        throw new Error("JWT secret from Secrets Manager is empty or invalid");
      }
    } catch (error) {
      throw new Error(
        `Failed to load JWT secret from Secrets Manager: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  generateToken(userId: string, role: string): string {
    if (!this.secret) {
      throw new Error("JwtGenerator not initialized");
    }

    return jwt.sign(
      {
        id: userId,
        role: role,
      },
      this.secret,
      {
        expiresIn: "7d", // Token expires in 7 days
      }
    );
  }
}

