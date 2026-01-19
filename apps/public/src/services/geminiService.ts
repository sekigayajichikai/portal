
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY || '' });

export const getNeighborhoodTips = async (query: string, isSimpleMode: boolean = false) => {
  try {
    const systemInstruction = isSimpleMode
      ? "あなたは親切で丁寧な自治会のコンシェルジュです。高齢の方にも分かりやすく、丁寧な言葉遣いで、正確な案内を心がけてください。絵文字は控えめに、読みやすさを重視してください。"
      : "あなたは活気あふれる自治会のAIアシスタントです。20代〜30代の若者が『この地域に住んでてよかった！』と思えるような情報を、明るく楽しく提供します。絵文字を使い、フレンドリーに接してください。";

    const prompt = isSimpleMode
      ? `自治会のWebアプリでの質問です。丁寧で分かりやすい日本語で回答してください。質問: ${query}`
      : `あなたは若者に大人気の地域コンシェルジュです。フレンドリーに回答してください。質問: ${query}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7,
      }
    });
    return response.text;
  } catch (error) {
    console.error("Gemini API Error:", error);
    return isSimpleMode 
      ? "申し訳ありません。現在システムが混み合っております。しばらく経ってから再度お試しください。" 
      : "ごめんね！ちょっと今、近所をパトロール中かも。後でもう一回聞いてみて！🔋";
  }
};
