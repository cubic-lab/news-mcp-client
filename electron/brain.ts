import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import llm from "./llm";
import {
  GetPromptRequest,
  ListToolsResult,
  PromptMessage,
} from "@modelcontextprotocol/sdk/types.js";
import ui from "./ui";
import newsClient from "./news-mcp-client";
import utils from "./utils";

export type RunToolsPayload = {
  messages: PromptMessage[];
  tools: ListToolsResult["tools"];
  mcpClient: string;
};

class Brain {
  clients: Record<string, Client> = {};

  constructor({ clients }: { clients: Record<string, Client> }) {
    this.clients = clients;
  }

  async usePrompt(
    params: GetPromptRequest["params"],
  ) {
    const client = this.clients[newsClient.name];
    const { tools } = await client.listTools();
    const prompt = await client.getPrompt(params);

    const { chatId } = newsClient.createChat("user", `使用提示词模版「${params.name}」`);

    return this.runTools(
      {
        messages: prompt.messages,
        tools,
        mcpClient: newsClient.name,
      },
      (m) => {
        newsClient.addChatMessage(chatId, m);
      }
    )
      .then((result) => {
        newsClient.finishChat(chatId, "success");
        return result;
      })
      .catch((error) => {
        console.error(error); // log to UI
        newsClient.finishChat(chatId, "error");
      });
  }

  private async runTools(
    { messages, tools, mcpClient = newsClient.name }: RunToolsPayload,
    onMessage: (message: unknown) => void
  ) {
    try {
      const _messages = utils.convToLlmMessages(messages);
      _messages.forEach(onMessage);
      const runner = llm.runTools(
          {
            messages: _messages,
            tools: tools.map((t) => {
              return {
                type: "function" as const,
                function: {
                  parse: JSON.parse,
                  description: t.description ?? "",
                  function: async (input) => {
                    await ui.userConfirm({
                      type: "confirm-tool-call",
                      payload: {
                        toolName: t.name,
                        input,
                      },
                    });
                    console.log('start to call tool', t.name, input);
                    const { content } = await this.clients[mcpClient].callTool({
                      name: t.name,
                      arguments: input as unknown as Record<string, string>,
                    });

                    await ui.userConfirm({
                      type: "confirm-tool-result",
                      payload: {
                        toolName: t.name,
                        result: content,
                      },
                    });

                    return content;
                  },
                  name: t.name,
                  parameters: t.inputSchema as Record<string, string>,
                },
              };
            }),
          },
          {
            // FIXME: https://github.com/deepseek-ai/DeepSeek-V3/issues/15
            maxChatCompletions: 1,
          }
        )
        .on("message", (m) => {
          onMessage(m);
        });

      await runner.finalFunctionCallResult();
    } catch(err) {
      console.error('failed to run tools', err);
    }
  }
}

const brain = new Brain({
  clients: {
    [newsClient.name]: newsClient,
  },
});

export default brain;