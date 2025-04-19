import { Client, ClientOptions } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import {
  CreateMessageRequestSchema,
  Implementation,
  LoggingMessageNotificationSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { BrowserWindow } from "electron";
import { v4 } from "uuid";
import utils from "./utils";
import llm from "./llm";
import ui from "./ui";

const CLIENT_NAME = "tech-news";

export class NewsMcPClient extends Client {

  constructor(info: Implementation, options?: ClientOptions) {
    super(info, options);
    this.init();
  }

  get name() {
    return CLIENT_NAME;
  }

  private init() {
    this.setNotificationHandler(
      LoggingMessageNotificationSchema,
      ({ params }) => {
        console.log(params.data);
      }
    );
    
    this.setRequestHandler(CreateMessageRequestSchema, async (request) => {
      console.log('received message', request.params);
      const { messages, maxTokens, systemPrompt } = request.params;
      const { chatId } = this.createChat("background", `数据取样`);
      const fullMessages = utils.convToLlmMessages(messages);

      if (systemPrompt) {
        fullMessages.unshift({
          role: "system",
          content: systemPrompt,
        });
      }
    
      fullMessages.forEach((m) => {
        this.addChatMessage(chatId, m);
      });
    
      await ui.userConfirm({
        type: "confirm-sampling-request",
        payload: {
          messages: fullMessages,
        },
      });
    
      const completion = await llm.createChatCompletion(fullMessages, maxTokens);
    
      await ui.userConfirm({
        type: "confirm-sampling-result",
        payload: {
          result: completion.choices[0].message.content,
        },
      });
    
      completion.choices.forEach((c) => {
        this.addChatMessage(chatId, c.message);
      });
    
      // handle error
      this.finishChat(chatId, "success");
    
      return {
        content: {
          type: "text",
          text: completion.choices[0].message.content,
        },
        model: llm.model,
        role: "assistant",
      };
    });
  }

  createChat(initiator: "user" | "background", summary: string) {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    const chatId = v4();
    mainWindow.webContents.send("createChat", {
      chatId,
      initiator,
      summary,
    });
  
    return { chatId };
  }
  
  addChatMessage(chatId: string, message: unknown) {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    mainWindow.webContents.send("addMessage", {
      chatId,
      message,
    });
  }
  
  finishChat(chatId: string, state: "error" | "success") {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    mainWindow.webContents.send("finishChat", {
      chatId,
      state,
    });
  }
  
  async connectServer() {
    console.log('sse url: ', process.env.MCP_SERVER_URL || '')
    const transport = new SSEClientTransport(
      new URL(process.env.MCP_SERVER_URL || '')
    );
  
    await this.connect(transport);
  }
}

const newsClient = new NewsMcPClient(
  { name: CLIENT_NAME, version: '1.0.0' }, 
  { capabilities: { sampling: {} } }
);

export default newsClient;