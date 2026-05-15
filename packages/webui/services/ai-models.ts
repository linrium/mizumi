export type ModelId =
  | "deepseek-chat"
  | "gpt-5.4-mini"
  | "mlx-community/Qwen3.5-9B-MLX-4bit"
  | "mlx-community/Qwen3.6-35B-A3B-4bit"

export const MODELS: { id: ModelId; label: string }[] = [
  { id: "deepseek-chat", label: "DeepSeek Chat" },
  { id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
  { id: "mlx-community/Qwen3.5-9B-MLX-4bit", label: "Qwen 3.5 9B MLX 4bit" },
  { id: "mlx-community/Qwen3.6-35B-A3B-4bit", label: "Qwen 3.6 35B A3B 4bit" },
]
