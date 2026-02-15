# Lesson email template (`lesson.hbs`)

Used when a user has a **package** (lesson pack) created for them. Renders a clear white background with greeting ("Hey" or "Hey {name}"), labeled sections (Lesson, Note, About this lesson, Past feedback), distinct styling for notes (left-accent bar) and feedback (labeled light boxes), and a flat purple CTA button.

---

## Required `content` inputs

| Field          | Type   | Description |
|----------------|--------|--------------|
| `lessonName`   | string | Name/title of the lesson (headline). |
| `description`  | string | Lesson description. HTML is allowed (use `{{{description}}}` in template). |
| `lessonUrl`    | string | Full URL for the "Continue to latest lesson" button. |

---

## Optional `content` inputs

| Field          | Type     | Description |
|----------------|----------|-------------|
| `name`         | string   | Recipient’s first name for the greeting. If provided, the email starts with "Hey {name},"; otherwise "Hey,". |
| `note`         | string   | Short note shown under the lesson name with a "Note" label and left-accent bar. Omitted if not provided. |
| `pastFeedback` | string[] | List of past feedback items. Each is shown with a "Feedback" label in a light box under "Past feedback from your lessons". |
| `isDark`       | boolean  | Currently unused; template uses a clear white background. Reserved for future use. |

---

## Auto-injected (can override in content)

The email service **always** injects these before rendering. You can override them by including them in `content`:

| Field   | Type   | Default | Description |
|---------|--------|--------|-------------|
| `year`  | string | Current year (e.g. `"2025"`) | For footer copyright. Override with `content.year` if needed. |
| `name`  | string | From recipient email | Local part of `to` with first letter capitalized (e.g. `karl@example.com` → `Karl`). Override with `content.name` for a custom greeting. |
| `email` | string | Recipient `to` address | For footer “sent to” line. Override with `content.email` if needed. |

---

## Shared inputs (for header/footer partials)

These are typically passed for all templates so the header and footer render correctly:

| Field            | Type   | Description |
|------------------|--------|-------------|
| `siteName`       | string | App/brand name (e.g. "WittyTalk"). |
| `unsubscribeUrl` | string | Full URL for unsubscribe (e.g. `https://api.example.com/v1/email/unsubscribe?email=...`). |
| `email`          | string | Recipient email (shown in footer). |

---

## Example queue message (light mode)

```json
{
  "template": "lesson.hbs",
  "header": "Your lesson is ready",
  "to": "user@example.com",
  "content": {
    "name": "Alex",
    "lessonName": "Shopping and restaurants",
    "description": "Practice ordering food and asking for the bill. This lesson focuses on common phrases and pronunciation.",
    "lessonUrl": "https://app.wittytalk.ai/lesson/abc123",
    "note": "We've added new exercises based on your last session.",
    "pastFeedback": [
      "Good pronunciation on \"I'd like the bill\".",
      "Try to slow down on numbers when giving your order."
    ],
    "siteName": "WittyTalk",
    "unsubscribeUrl": "https://api.wittytalk.ai/v1/email/unsubscribe?email=user@example.com",
    "email": "user@example.com",
    "year": "2025"
  }
}
```

---

## Example queue message (dark mode)

Same as above, but add `"isDark": true` to `content`:

```json
{
  "template": "lesson.hbs",
  "header": "Your lesson is ready",
  "to": "user@example.com",
  "content": {
    "lessonName": "Shopping and restaurants",
    "description": "Practice ordering food and asking for the bill.",
    "lessonUrl": "https://app.wittytalk.ai/lesson/abc123",
    "isDark": true,
    "siteName": "WittyTalk",
    "unsubscribeUrl": "https://api.wittytalk.ai/v1/email/unsubscribe?email=user@example.com",
    "email": "user@example.com",
    "year": "2025"
  }
}
```

---

## Sections in the email

1. **Greeting** – "Hey," or "Hey {name}," if `name` is provided.
2. **Intro** – Short line explaining that the next lesson is prepared.
3. **Lesson** – Label + lesson name (with extra space above).
4. **Note** (optional) – Label "Note" + left purple accent bar and note text (no card).
5. **About this lesson** – Label + description in a light card.
6. **CTA** – Flat purple button "Continue to latest lesson" linking to `lessonUrl`.
7. **Past feedback** (optional) – Section label "Past feedback from your lessons", short explanation, then each item in a light box with a "Feedback" label.

Upload `lesson.hbs` (and any partials it uses: `header`, `footer`) to the email-service S3 templates bucket so the Lambda can render this template.
