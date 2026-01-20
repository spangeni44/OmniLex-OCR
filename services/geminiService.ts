
import { GoogleGenAI, Type } from "@google/genai";
import { OCRBlock, BlockType } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

const SYSTEM_INSTRUCTION = `You are OmniLex, a high-speed Layout-Aware OCR and Document Intelligence Engine.
Goal: Transform the provided image into a structured JSON representation that mirrors the original document's physical layout.

Capabilities:
1. Detect and transcribe text in English, Nepali (Devanagari), and Hindi.
2. Identify document structure: 'header', 'paragraph', 'table', 'list', and 'image_placeholder'.
3. For 'table', reconstruct the grid perfectly in 'tableData'.
4. For 'image_placeholder', detect any photos, charts, or logos and provide their exact boundaries.
5. Devanagari specific: Ensure one space before full stop (।).
6. Layout: Use 'box_2d' [ymin, xmin, ymax, xmax] (normalized 0-1000) to represent the physical location of every element.

Return ONLY a JSON array of blocks.`;

export async function performOCR(base64Image: string, mimeType: string): Promise<OCRBlock[]> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", 
      contents: [
        {
          parts: [
            { inlineData: { data: base64Image.split(',')[1], mimeType } },
            { text: "Digitize this document perfectly. Preserve layout, detect all images as placeholders, and reconstruct tables. Structured JSON output only." }
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
              },
              isBold: { type: Type.BOOLEAN }
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
