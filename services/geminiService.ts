import { GoogleGenAI, Type } from "@google/genai";
import { Subtitle } from "../types";

// Helper to convert File to Base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};

export const generateImageCaption = async (imageFile: File, context?: string): Promise<string> => {
    try {
        if (!process.env.API_KEY) {
            throw new Error("API Key is missing");
        }

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const base64Image = await fileToBase64(imageFile);

        const prompt = context 
            ? `Describe this image briefly in 3-5 words suitable for a music video caption. Context: ${context}`
            : `Describe this image briefly in 3-5 words suitable for a music video caption.`;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: {
                parts: [
                    {
                        inlineData: {
                            mimeType: imageFile.type || "image/jpeg",
                            data: base64Image,
                        },
                    },
                    { text: prompt },
                ],
            },
        });

        return response.text || "Cool Vibes";

    } catch (error) {
        console.error("Caption error:", error);
        return "Cool Vibes";
    }
};

export const generateLyrics = async (audioFile: File): Promise<Omit<Subtitle, 'id'>[]> => {
    try {
        if (!process.env.API_KEY) {
            throw new Error("API Key is missing");
        }

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const base64Audio = await fileToBase64(audioFile);

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: {
                parts: [
                    {
                        inlineData: {
                            mimeType: audioFile.type || "audio/mp3",
                            data: base64Audio,
                        },
                    },
                    { text: "Transcribe the lyrics of this song. Return a JSON array where each object represents a line of lyric and has 'startTime' (number, in seconds), 'endTime' (number, in seconds), and 'text' (string). Ensure timestamps are precise." },
                ],
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            startTime: { type: Type.NUMBER },
                            endTime: { type: Type.NUMBER },
                            text: { type: Type.STRING }
                        },
                        required: ["startTime", "endTime", "text"]
                    }
                }
            }
        });

        if (response.text) {
            return JSON.parse(response.text);
        }
        return [];

    } catch (error) {
        console.error("Lyrics generation error:", error);
        throw error;
    }
};