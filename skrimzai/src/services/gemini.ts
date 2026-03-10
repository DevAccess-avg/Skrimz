import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface Message {
  id?: string;
  role: "user" | "model";
  text: string;
  images?: string[];
}

export async function chatWithGemini(
  prompt: string, 
  images: string[] = [], 
  history: Message[] = [], 
  mode: 'regular' | 'coding' | 'ultra' = 'regular'
) {
  const model = "gemini-3-flash-preview";
  
  // Format history for Gemini API
  const contents = history.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.text }]
  }));

  // Add the current message
  const currentParts: any[] = [{ text: prompt }];
  
  for (const base64Image of images) {
    const [mimeType, data] = base64Image.split(";base64,");
    const mime = mimeType.split(":")[1];
    currentParts.push({
      inlineData: {
        mimeType: mime,
        data: data
      }
    });
  }

  contents.push({
    role: "user",
    parts: currentParts
  });

  const systemInstructions = {
    regular: "You are SkrimzAI. Be simple, direct, and helpful. Do exactly what the user wants without unnecessary fluff.",
    coding: "You are SkrimzAI (Coding Mode). Provide clean, efficient code and technical explanations simply and directly.",
    ultra: "You are SkrimzAI (UltraSearch Mode). Use Google Search to provide accurate, up-to-date info. Be concise and cite sources."
  };

  const config: any = {
    systemInstruction: systemInstructions[mode]
  };

  if (mode === 'ultra') {
    config.tools = [{ googleSearch: {} }];
  }

  const response: GenerateContentResponse = await ai.models.generateContent({
    model,
    contents,
    config
  });

  let text = response.text || "I'm sorry, I couldn't generate a response.";
  
  // Append grounding sources if in ultra mode
  if (mode === 'ultra' && response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
    const chunks = response.candidates[0].groundingMetadata.groundingChunks;
    const sources = chunks
      .map((c: any) => c.web?.uri)
      .filter((uri: string | undefined): uri is string => !!uri);
    
    if (sources.length > 0) {
      text += "\n\n**Sources:**\n" + Array.from(new Set(sources)).map(s => `- [${s}](${s})`).join('\n');
    }
  }

  return text;
}
