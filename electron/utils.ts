import { PromptMessage } from "@modelcontextprotocol/sdk/types.js";
import OpenAI from "openai";

function convToLlmMessages(
  messages: PromptMessage[]
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  return messages.map((m) => ({
    role: m.role,
    content: [
      {
        type: m.content.type as "text",
        text: m.content.text as string,
      },
    ],
  }));
}

export default {
  convToLlmMessages,
}