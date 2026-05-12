// Gemini Vision API — identifies artist and album title from a photo of a record
// Get a free API key at https://ai.google.dev
// Model: gemini-2.5-flash (fast, cheap, excellent vision)

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

export interface RecordIdentification {
  artist: string | null;
  album: string | null;
}

/**
 * Send a base64-encoded image to Gemini Vision and ask it to identify
 * the artist name and album title visible in the photo.
 *
 * Returns { artist, album } or null if the API call fails entirely.
 * Either field may be null if Gemini can't identify it.
 */
export async function identifyRecordFromImage(
  base64: string
): Promise<RecordIdentification | null> {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('EXPO_PUBLIC_GEMINI_API_KEY is not set');
    return null;
  }

  try {
    const res = await fetch(`${BASE_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `You are identifying a vinyl record from a photo of its cover, label, or sleeve.
Extract the artist name and album title from the image.

Respond with ONLY valid JSON in this exact format, no other text:
{"artist": "Artist Name", "album": "Album Title"}

If you cannot determine one or both fields, use null for that field:
{"artist": null, "album": null}`,
              },
              {
                inline_data: {
                  mime_type: 'image/jpeg',
                  data: base64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 500,
          thinkingConfig: { thinkingBudget: 0 }, // Disable thinking — not needed for simple extraction
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn('Gemini API error:', res.status, err);
      return null;
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!text) return null;

    // Strip markdown code fences if Gemini wraps the JSON
    const cleaned = text.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed: RecordIdentification = JSON.parse(cleaned);
    return parsed;
  } catch (e) {
    console.warn('Gemini identification error:', e);
    return null;
  }
}
