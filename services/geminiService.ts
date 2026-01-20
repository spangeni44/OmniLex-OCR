
import { GoogleGenAI, Type } from "@google/genai";
import { OCRBlock, BlockType } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

const SYSTEM_INSTRUCTION = `You are OmniLex, a high-speed Layout-Aware OCR Engine.
Detect language automatically (specializing in Nepali, Hindi, English).
Extract structure: headers, paragraphs, and tables.
For tables, provide row/col mapping in 'tableData'.
Output: JSON array of blocks.
Devanagari: Ensure one space before full stop (।).
Be fast and precise.`;

export async function performOCR(base64Image: string, mimeType: string): Promise<OCRBlock[]> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", 
      contents: [
        {
          parts: [
            { inlineData: { data: base64Image.split(',')[1], mimeType } },
            { text: "OCR this. Structured JSON only." }
          ]
        }
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              type: { type: Type.STRING },
              text: { type: Type.STRING },
              confidence: { type: Type.NUMBER },
              box_2d: {
                type: Type.ARRAY,
                items: { type: Type.NUMBER }
              },
              tableData: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    text: { type: Type.STRING },
                    row: { type: Type.NUMBER },
                    col: { type: Type.NUMBER }
                  }
                }
              }
            },
            required: ["type", "text", "box_2d"]
          }
        }
      }
    });

    const text = response.text || "[]";
    const blocks: OCRBlock[] = JSON.parse(text);
    return blocks.map(b => ({
        ...b,
        id: b.id || Math.random().toString(36).substr(2, 9),
        isSelected: true 
    }));
  } catch (error) {
    console.error("OmniLex OCR Error:", error);
    throw error;
  }
}
