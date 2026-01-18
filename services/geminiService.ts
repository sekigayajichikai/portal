import { GoogleGenAI, Type, Modality } from "@google/genai";
import { PublicEvent } from "../types";

// Initialize Gemini Client
// NOTE: process.env.API_KEY is injected by the environment.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Event Extraction ---

export const extractEventsFromText = async (text: string): Promise<PublicEvent[]> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Extract all community events, meetings, or gatherings from the following circular text. 
      Return them as a structured JSON list. If specific times or locations are missing, infer 'TBD' or the general community area.
      
      Circular Text:
      ${text}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: "Name of the event" },
              date: { type: Type.STRING, description: "Date of the event (YYYY-MM-DD format if possible)" },
              time: { type: Type.STRING, description: "Time of the event (e.g., 10:00 AM)" },
              location: { type: Type.STRING, description: "Location where the event takes place" },
              description: { type: Type.STRING, description: "Short summary of the event details" },
            },
            required: ["title", "date", "location", "description"],
          },
        },
      },
    });

    if (response.text) {
      const rawEvents = JSON.parse(response.text);
      return rawEvents.map((e: any, index: number) => ({
        ...e,
        id: `extracted-${Date.now()}-${index}`,
        isPublic: true,
      }));
    }
    return [];
  } catch (error) {
    console.error("Error extracting events:", error);
    throw error;
  }
};

// --- Radio Script Generation ---

export const generateRadioScript = async (sourceText: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", // Good for creative writing
      contents: `You are a friendly local radio DJ for a neighborhood community.
      Convert the following newsletter/circular text into a lively, engaging 30-60 second radio script.
      Start with a cheerful greeting ("Hello neighbors!").
      Keep it warm, clear, and informative. Use simple Japanese suitable for all ages.
      Do not include stage directions like [Sound Effect], just the spoken text.

      Source Text:
      ${sourceText}`,
    });
    return response.text || "";
  } catch (error) {
    console.error("Error generating radio script:", error);
    throw error;
  }
};

// --- TTS Audio Generation ---

// Helper to decode Base64
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Helper to decode raw PCM data into an AudioBuffer
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// Helper to convert AudioBuffer to WAV Blob for playback
function bufferToWave(abuffer: AudioBuffer, len: number) {
  let numOfChan = abuffer.numberOfChannels,
      length = len * numOfChan * 2 + 44,
      buffer = new ArrayBuffer(length),
      view = new DataView(buffer),
      channels = [], i, sample,
      offset = 0,
      pos = 0;

  // write WAVE header
  setUint32(0x46464952);                         // "RIFF"
  setUint32(length - 8);                         // file length - 8
  setUint32(0x45564157);                         // "WAVE"

  setUint32(0x20746d66);                         // "fmt " chunk
  setUint32(16);                                 // length = 16
  setUint16(1);                                  // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(abuffer.sampleRate);
  setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2);                      // block-align
  setUint16(16);                                 // 16-bit (hardcoded in this example)

  setUint32(0x61746164);                         // "data" - chunk
  setUint32(length - pos - 4);                   // chunk length

  // write interleaved data
  for(i = 0; i < abuffer.numberOfChannels; i++)
      channels.push(abuffer.getChannelData(i));

  while(pos < len) {
      for(i = 0; i < numOfChan; i++) {             // interleave channels
          sample = Math.max(-1, Math.min(1, channels[i][pos])); // clamp
          sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0; // scale to 16-bit signed int
          view.setInt16(44 + offset, sample, true);          // write 16-bit sample
          offset += 2;
      }
      pos++;
  }

  return new Blob([buffer], {type: "audio/wav"});

  function setUint16(data: number) {
      view.setUint16(pos, data, true);
      pos += 2;
  }

  function setUint32(data: number) {
      view.setUint32(pos, data, true);
      pos += 4;
  }
}

export const generateRadioAudio = async (script: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: script }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    
    if (!base64Audio) {
        throw new Error("No audio data returned");
    }

    const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
    const audioBytes = decode(base64Audio);
    
    const audioBuffer = await decodeAudioData(
        audioBytes,
        outputAudioContext,
        24000,
        1,
    );

    // Convert to Blob for URL creation
    const wavBlob = bufferToWave(audioBuffer, audioBuffer.length);
    const audioUrl = URL.createObjectURL(wavBlob);
    
    // Close context to free resources
    outputAudioContext.close();

    return audioUrl;

  } catch (error) {
    console.error("Error generating audio:", error);
    throw error;
  }
};
