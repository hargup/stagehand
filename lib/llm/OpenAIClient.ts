import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { LLMClient, ChatCompletionOptions } from "./LLMClient";
import { LLMCache } from "./LLMCache";

export class OpenAIClient implements LLMClient {
  private client: OpenAI;
  private cache: LLMCache;
  public logger: (message: {
    category?: string;
    message: string;
    level?: number;
  }) => void;
  private enableCaching: boolean;

  constructor(
    logger: (message: {
      category?: string;
      message: string;
      level?: number;
    }) => void,
    enableCaching = false,
  ) {
    this.client = new OpenAI();
    this.logger = logger;
    this.cache = new LLMCache(logger);
    this.enableCaching = enableCaching;
  }

  async createChatCompletion(options: ChatCompletionOptions) {
    const cacheOptions = {
      model: options.model,
      messages: options.messages,
      temperature: options.temperature,
      top_p: options.top_p,
      frequency_penalty: options.frequency_penalty,
      presence_penalty: options.presence_penalty,
      image: options.image,
      response_model: options.response_model,
    };

    if (this.enableCaching) {
      const cachedResponse = this.cache.get(cacheOptions);
      if (cachedResponse) {
        return cachedResponse;
      }
    }

    if (options.image) {
      const screenshotMessage: any = {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${options.image.buffer.toString("base64")}`,
            },
          },
          ...(options.image.description
            ? [{ type: "text", text: options.image.description }]
            : []),
        ],
      };

      options.messages = [...options.messages, screenshotMessage];
    }

    const { image, response_model, ...openAiOptions } = options;

    let responseFormat = undefined;
    if (options.response_model) {
      responseFormat = zodResponseFormat(
        options.response_model.schema,
        options.response_model.name,
      );
    }

    const response = await this.client.chat.completions.create({
      ...openAiOptions,
      response_format: responseFormat,
    });

    if (this.enableCaching) {
      this.cache.set(cacheOptions, response);
    }

    if (response_model) {
      const extractedData = response.choices[0].message.content;
      const parsedData = JSON.parse(extractedData);

      return {
        ...parsedData,
      };
    }

    return response;
  }
}
