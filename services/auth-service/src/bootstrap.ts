import { GoogleOAuthClient } from "./infrastructure/google-oauth.client";
import { JwtGenerator } from "./infrastructure/jwt.generator";
import { DynamoUserRepository } from "./infrastructure/repositories/user.repository";
import { DynamoAuthenticationRepository } from "./infrastructure/repositories/authentication.repository";
import { GoogleAuthUseCase } from "./app/usecases/google.auth.usecase";
import { GoogleAuthController } from "./app/controllers/google.auth.controller";
import { UpdatePreferredLanguageUseCase } from "./app/usecases/update.user.preferred.language.usecase";
import { UpdatePreferredLanguageController } from "./app/controllers/update.user.preferred.language.controller";
import { GetCurrentUserUseCase } from "./app/usecases/get.current.user.usecase";
import { GetCurrentUserController } from "./app/controllers/get.current.user.controller";
import { UserEventPublisher } from "./infrastructure/event.publisher";
import { WelcomeEmailSender } from "./infrastructure/welcome.email.sender";

export function bootstrap() {
  const usersTableName = process.env.USERS_TABLE;
  const authenticationsTableName = process.env.AUTHENTICATIONS_TABLE;
  const projectName = process.env.PROJECT_NAME || "eislett-education";
  const environment = process.env.ENVIRONMENT || "dev";

  if (!usersTableName) {
    throw new Error("USERS_TABLE environment variable is not set");
  }

  if (!authenticationsTableName) {
    throw new Error("AUTHENTICATIONS_TABLE environment variable is not set");
  }

  const authRepo = new DynamoAuthenticationRepository(authenticationsTableName);
  const userRepo = new DynamoUserRepository(usersTableName, undefined, authRepo);
  
  const googleOAuthClient = new GoogleOAuthClient();
  const jwtGenerator = new JwtGenerator();

  // Initialize async clients - must be done before use
  // Note: In Lambda, this will be called on cold start
  // For production, consider lazy initialization or Lambda layers
  let initPromise: Promise<void> | null = null;
  
  const ensureInitialized = async () => {
    if (!initPromise) {
      initPromise = Promise.all([
        googleOAuthClient.initialize(projectName, environment),
        jwtGenerator.initialize(projectName, environment),
      ]).then(() => {
        console.log("Auth service clients initialized");
      }).catch((error) => {
        console.error("Failed to initialize auth clients:", error);
        throw error;
      });
    }
    return initPromise;
  };

  // Store init function for use cases to call
  (global as any).__authServiceEnsureInit = ensureInitialized;

  // Initialize event publisher (optional - won't fail if topic ARN not set)
  let eventPublisher: UserEventPublisher | undefined;
  try {
    eventPublisher = new UserEventPublisher();
  } catch (error) {
    console.warn("UserEventPublisher not initialized - user events will not be published:", error);
  }

  const welcomeEmailSender = new WelcomeEmailSender();

  const googleAuthUseCase = new GoogleAuthUseCase(
    googleOAuthClient,
    jwtGenerator,
    userRepo,
    authRepo,
    eventPublisher,
    welcomeEmailSender
  );

  const googleAuthController = new GoogleAuthController(googleAuthUseCase);

  const updatePreferredLanguageUseCase = new UpdatePreferredLanguageUseCase(userRepo);
  const updatePreferredLanguageController = new UpdatePreferredLanguageController(updatePreferredLanguageUseCase);

  const getCurrentUserUseCase = new GetCurrentUserUseCase(userRepo);
  const getCurrentUserController = new GetCurrentUserController(getCurrentUserUseCase);

  return {
    googleAuthController,
    updatePreferredLanguageController,
    getCurrentUserController,
  };
}
