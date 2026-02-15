# Email Service

Sends emails from an SQS queue using Handlebars (HBS) templates stored in S3. Tracks sent emails in DynamoDB and supports unsubscribe via API Gateway.

## Queue message shape

Send a message to the email queue with:

- **template** (optional): S3 key of the HBS file (e.g. `welcome.hbs`). If omitted, the body is taken from `content.message` (plain text/no template).
- **header**: Subject line.
- **to**: Recipient email address.
- **content**: Object passed to the Handlebars template (or `{ message: "..." }` when no template). The service **always injects** `year`, `name`, `email`, and `profileImageUrl`. When the SQS message includes optional **`content.userId`**, the service looks up that user in the **users DynamoDB table** (same table as auth-service: `{project}-{env}-users`) and uses the user’s `name` and `picture` (as `profileImageUrl`) for templates. **Name** resolution: `content.name` > DB user name > `content.user.name` > derived from email. **profileImageUrl**: `content.profileImageUrl` > DB user picture > `content.user.profileImageUrl`. The header partial shows the profile image when `profileImageUrl` is set. Top-level or `content.user` values override the DB lookup.

Example with template:

```json
{
  "template": "welcome.hbs",
  "header": "Welcome",
  "to": "user@example.com",
  "content": {
    "title": "Welcome",
    "message": "Thanks for signing up.",
    "siteName": "My App",
    "unsubscribeUrl": "https://api.example.com/v1/email/unsubscribe?email=user@example.com"
  }
}
```

Example without template:

```json
{
  "header": "Reminder",
  "to": "user@example.com",
  "content": {
    "message": "This is a plain text reminder."
  }
}
```

## Templates (S3)

Bucket: `{project_name}-{env}-email-service-templates`.

- **layout.hbs**: Optional layout partial (registered as `layout`).
- **partials/header.hbs**, **partials/footer.hbs**: Partials for header/footer.
- **partials/*.hbs**: Any other partials (name = filename without `.hbs`).
- **welcome.hbs**, **lesson.hbs**, etc.: Page templates; receive `content` and can use `{{> header}}`, `{{> footer}}`. For `lesson.hbs` (package/lesson created), see [templates/LESSON-TEMPLATE.md](templates/LESSON-TEMPLATE.md) for required and optional inputs.

Partials use the **same** `content` object as the main template. Any variable you put in `content` (e.g. `siteName`, `unsubscribeUrl`) is available in partials—e.g. `{{siteName}}` in `header.hbs` and `{{unsubscribeUrl}}` in `footer.hbs`.

Upload the files from `services/email-service/templates/` (e.g. `layout.hbs`, `partials/header.hbs`, `partials/footer.hbs`, `welcome.hbs`) to the bucket.

## No-reply secret (Secrets Manager)

Create a secret in AWS Secrets Manager with:

- **Name:** `{project_name}-{env}-no-reply-email` (e.g. `eislett-education-dev-no-reply-email`)

Store the value as **plaintext JSON** with these fields:

| Field      | Required | Description |
|-----------|----------|-------------|
| `user`    | Yes*     | SMTP login / sender email. Alternate key: `username`. |
| `password`| Yes*     | SMTP password (e.g. app password for Gmail). Alternate key: `pass`. |
| `service` | No       | SMTP host (e.g. `smtp.gmail.com`). Alternate key: `host`. Default: `smtp.gmail.com`. |
| `from`    | No       | From address shown in emails (e.g. `"My App <noreply@example.com>"`). Alternate key: `fromAddress`. If omitted, `user` is used. |

\* At least `user` and `password` (or their alternates) must be present.

**Example secret value (JSON):**

```json
{
  "user": "noreply@example.com",
  "password": "your-app-password",
  "service": "smtp.gmail.com",
  "from": "My App <noreply@example.com>"
}
```

**Minimal (Gmail):**

```json
{
  "user": "noreply@example.com",
  "password": "xxxx-xxxx-xxxx-xxxx"
}
```

## Unsubscribe API

- **By email:** **GET** `/v1/email/unsubscribe?email=user@example.com` or **POST** with body `{ "email": "user@example.com" }`. Query aliases: `e`. Body alias: `e`.
- **By userId:** **GET** `/v1/email/unsubscribe?userId=user-abc123` or **POST** with body `{ "userId": "user-abc123" }`. Query alias: `uid`. Body alias: `uid`. When `userId` is provided, the service looks up the user in the users DynamoDB table and unsubscribes that user’s email address.

No auth. Stores the resolved email in the unsubscribes table; the queue processor skips sending to any address in that table.

## Build and package

```bash
cd services/email-service
npm install
npm run package
```

Then deploy the Terraform in `infra/services/email-service/` (and ensure the S3 templates bucket is populated and the no-reply secret exists).
