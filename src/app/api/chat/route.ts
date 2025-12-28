import { google } from "@ai-sdk/google";
import { generateText } from 'ai';

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    console.log("Prompt received at server (GEMINI):", prompt);

    const { text } = await generateText({
      model: google('gemini-2.5-flash'),
      system:
    'You are a professional content writer. ' +
    'You need to Highligh heavy tasks , bold important points and make sure that the content is easily digestible and easy to understand.',
      prompt,
    });

    return Response.json({ text });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: 'Failed to generate response' }, { status: 500 });
  }
}