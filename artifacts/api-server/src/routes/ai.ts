import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

interface ChatMessage {
  sender: "me" | "them";
  text: string;
}

router.post("/api/ai/suggest-reply", async (req, res) => {
  const { messages, peerName, myName, peerProfile } = req.body as {
    messages: ChatMessage[];
    peerName?: string;
    myName?: string;
    peerProfile?: { lookingFor?: string; position?: string; age?: string };
  };

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: "messages array required" });
    return;
  }

  const recentMessages = messages.slice(-12);

  const systemPrompt = [
    `You are helping someone reply on Radarchat, a gay men's hookup/social app in Denver.`,
    `You are writing as ${myName ?? "the user"}, replying to ${peerName ?? "someone"}.`,
    peerProfile?.age ? `${peerName ?? "They"} are ${peerProfile.age} years old.` : "",
    peerProfile?.position ? `Position: ${peerProfile.position}.` : "",
    peerProfile?.lookingFor ? `Looking for: ${peerProfile.lookingFor}.` : "",
    ``,
    `Write a single short, natural, flirty reply (1-2 sentences max). Match the vibe of the conversation.`,
    `Be direct, casual, and genuinely interested. No hashtags, no emojis unless the conversation uses them, no sign-offs.`,
    `Reply with ONLY the message text — nothing else.`,
  ].filter(Boolean).join("\n");

  const chatMessages = recentMessages.map((m) => ({
    role: m.sender === "me" ? ("user" as const) : ("assistant" as const),
    content: m.text,
  }));

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: 120,
    messages: [
      { role: "system", content: systemPrompt },
      ...chatMessages,
      { role: "user", content: "[suggest a reply for me to send next]" },
    ],
  });

  const suggestion = response.choices[0]?.message?.content?.trim() ?? "";
  res.json({ suggestion });
});

export default router;
