
// This service is deprecated. The application now exclusively uses Local AI (Ollama).
// See services/ollamaService.ts for the active AI logic.

export const analyzeMarket = async () => {
    throw new Error("Gemini API is disabled. Please use Ollama.");
};
