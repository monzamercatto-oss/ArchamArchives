import { GoogleGenAI } from "@google/genai";
import { CoC7Actor } from "../types";
import { TEMPLATE_INVESTIGATOR, TEMPLATE_NPC, TEMPLATE_CREATURE } from "../constants";

export type ActorType = 'character' | 'npc' | 'creature';

export const extractCharacterData = async (
  files: { data: string; mimeType: string }[],
  userExampleJson: string,
  actorType: ActorType
): Promise<CoC7Actor> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing.");
  }

  const ai = new GoogleGenAI({ apiKey });

  let targetTemplate: CoC7Actor;
  let typeSpecificInstructions = "";

  switch (actorType) {
    case 'npc':
      targetTemplate = TEMPLATE_NPC;
      typeSpecificInstructions = `
        - This is an NPC (Non-Player Character) sheet.
        - Extract simple attributes.
        - Look for "Occupation" or role.
        - Ensure "actorLink" in prototypeToken is false.
        - BIOGRAPHY/NOTES: Extract any flavor text or generate a mysterious 1920s description in Russian.
      `;
      break;
    case 'creature':
      targetTemplate = TEMPLATE_CREATURE;
      typeSpecificInstructions = `
        - This is a MONSTER / CREATURE stat block.
        - Skills might be listed as attacks. Add these to 'items'.
        - BIOGRAPHY/NOTES: Extract or generate a terrifying Lovecraftian description in Russian.
      `;
      break;
    default:
      targetTemplate = TEMPLATE_INVESTIGATOR;
      typeSpecificInstructions = `
        - This is a standard INVESTIGATOR sheet.
        - Ensure "actorLink" is true.
        - BIOGRAPHY/NOTES: Extract Backstory/Personal Description text in Russian.
      `;
      break;
  }

  const prompt = `
    ROLE: OCR and Data Mapping AI for "Call of Cthulhu 7th Edition".
    CONTEXT: Extracting data for a ${actorType.toUpperCase()}.
    INPUT: Character sheet images.
    OUTPUT: Valid JSON matching the provided template.
    
    CRITICAL RULES:
    1. Output language MUST be RUSSIAN for all text.
    2. Skill values: Extract the largest number (Base Value).
    3. Biography: HTML string with <p> tags.
    
    Template:
    ${JSON.stringify(targetTemplate)}
  `;

  try {
    const parts = files.map(file => ({
      inlineData: {
        mimeType: file.mimeType,
        data: file.data
      }
    }));
    parts.push({ text: prompt } as any);

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: parts },
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '');
    return JSON.parse(cleanText) as CoC7Actor;
  } catch (error) {
    console.error("Gemini Extraction Error:", error);
    throw error;
  }
};

export const generateTokenImage = async (description: string, actorType: ActorType): Promise<string> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key is missing.");
  const ai = new GoogleGenAI({ apiKey });

  let stylePrompt = actorType === 'creature' 
    ? "Real life photograph, flash photography, 1920s grainy blurry photo, terrifying monster, found footage."
    : "1920s vintage portrait photograph, sepia, heavy grain, scratches.";

  const cleanDescription = description.replace(/<[^>]*>?/gm, '');
  const prompt = `Portrait of a Call of Cthulhu ${actorType}: ${cleanDescription}. ${stylePrompt}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: prompt }] }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData && part.inlineData.data) {
        return part.inlineData.data;
      }
    }
    throw new Error("No image generated.");
  } catch (error) {
    console.error("Token Generation Error:", error);
    throw error;
  }
};