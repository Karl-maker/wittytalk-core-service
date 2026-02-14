import { SQSEvent, SQSBatchResponse, SQSBatchItemFailure } from "aws-lambda";
import { bootstrap } from "../bootstrap";
import type { EmailQueueMessage } from "../types";

export const handler = async (
  event: SQSEvent
): Promise<SQSBatchResponse> => {
  const { sendEmailUseCase } = bootstrap();
  const batchItemFailures: SQSBatchItemFailure[] = [];

  for (let i = 0; i < event.Records.length; i++) {
    const record = event.Records[i];
    let body: EmailQueueMessage;

    try {
      body = JSON.parse(record.body) as EmailQueueMessage;
    } catch (e) {
      console.error("Invalid JSON in SQS message:", record.messageId, e);
      batchItemFailures.push({ itemIdentifier: record.messageId });
      continue;
    }

    const result = await sendEmailUseCase.execute(body, record.messageId);

    if (!result.success) {
      console.error("Send failed:", record.messageId, result.error);
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};
