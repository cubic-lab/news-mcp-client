import OpenAI from "openai";
import { RunnerOptions } from "openai/lib/AbstractChatCompletionRunner.mjs";
import { ChatCompletionToolRunnerParams } from "openai/lib/ChatCompletionRunner.mjs";

export interface LlmProvider {
  baseURL: string;
  apiKey: string;
  model: string;
}

export class LlmClient {
  private provider: LlmProvider;
  private ai: OpenAI;

  constructor() {
    this.provider = {
      baseURL: process.env.LLM_BASE_URL || '',
      apiKey: process.env.LLM_API_KEY || '',
      model: process.env.LLM_MODEL || '',
    };
    this.ai = new OpenAI({
      ...this.provider,
      fetch: async (url: RequestInfo, init?: RequestInit): Promise<Response> => {
        const response = await fetch(url, init);

        if (response.status >= 400) {
          const reason = await response.text();
          throw new Error(`Failed to fetch ${url} ${reason}`);
        }
        return response;
      },

      timeout: 300_000,
    });
  }

  get model(): string {
    return this.provider.model;
  }

  async createChatCompletion(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[], maxTokens: number) {
    return this.ai.chat.completions.create({
      messages: messages,
      max_tokens: maxTokens,
      model: this.provider.model,
    }); 
  }

runTools<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Params extends Omit<ChatCompletionToolRunnerParams<any>, 'model'>,
>(body: Params, options?: RunnerOptions) {
    return this.ai.beta.chat.completions.runTools({...body, model: this.model}, options);
  }
}

const llm = new LlmClient();

export default llm;