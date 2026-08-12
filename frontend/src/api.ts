export type Room = { id: string; title: string; updated_at: string };

export type MessageAttachment = { id: string; filename: string; mime_type: string; size: number };

export type Message = {
  id: string;
  role: "user" | "council";
  content: string;
  council_run_id: string | null;
  created_at: string;
  attachments: MessageAttachment[];
};

export type AgentRunView = {
  provider: string;
  role: "member" | "chairman";
  status: string;
  model: string | null;
  content: string;
  error: string | null;
  duration_ms: number;
  attachment_supported: boolean;
};

export type RunView = {
  id: string;
  message_id: string;
  mode: "quick" | "deep";
  status: "pending" | "running" | "completed" | "failed";
  chairman: string;
  answer: string;
  error: string | null;
  responses: AgentRunView[];
  peer_reviews: { reviewer: string; content: string; error: string | null }[];
};

export type Provider = {
  name: string;
  label: string;
  available: boolean;
  authenticated: boolean;
  version: string | null;
  models: string[];
};

export type Settings = {
  council: { members: string[]; chairman: string; default_mode: "quick" | "deep"; minimum_successful_members: number };
  execution: { timeout_seconds: number };
  attachments: { max_files_per_message: number; max_file_size_mb: number; allowed_mime_types: string[] };
  providers: Record<string, { model: string | null; effort: string | null }>;
  auth: { mode: string };
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: init?.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(detail.detail ?? response.statusText);
  }
  return response.json() as Promise<T>;
}

export const api = {
  me: () => request<{ mode: string; authenticated: boolean; username: string | null }>("/auth/me"),
  login: (password: string) =>
    request<{ ok: true }>("/auth/login", { method: "POST", body: JSON.stringify({ password }) }),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),

  providers: () => request<Provider[]>("/providers"),
  settings: () => request<Settings>("/config"),
  saveSettings: (body: Partial<Settings>) =>
    request<Settings>("/config", { method: "PUT", body: JSON.stringify(body) }),

  rooms: () => request<Room[]>("/rooms"),
  createRoom: () => request<Room>("/rooms", { method: "POST", body: JSON.stringify({}) }),
  renameRoom: (id: string, title: string) =>
    request<Room>(`/rooms/${id}`, { method: "PATCH", body: JSON.stringify({ title }) }),
  deleteRoom: (id: string) => request<{ ok: true }>(`/rooms/${id}`, { method: "DELETE" }),

  messages: (roomId: string) => request<Message[]>(`/rooms/${roomId}/messages`),
  upload: (roomId: string, file: File) => {
    const form = new FormData();
    form.append("room_id", roomId);
    form.append("file", file);
    return request<MessageAttachment>("/attachments", { method: "POST", body: form });
  },
  ask: (roomId: string, body: { content: string; attachment_ids: string[]; mode: string; chairman?: string }) =>
    request<{ message_id: string; run_id: string }>(`/rooms/${roomId}/messages`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  run: (runId: string) => request<RunView>(`/runs/${runId}`),
  retry: (runId: string, chairman?: string) =>
    request<{ run_id: string; message_id: string }>(`/runs/${runId}/retry`, {
      method: "POST",
      body: JSON.stringify({ chairman: chairman ?? null }),
    }),
};

export type CouncilEvent = {
  event: string;
  provider?: string;
  error?: string;
  duration_ms?: number;
  answer?: string;
  chairman?: string;
  attachment_supported?: boolean;
};

/** Subscribe to a run's SSE stream; returns an unsubscribe function. */
export function watchRun(runId: string, onEvent: (event: CouncilEvent) => void): () => void {
  const source = new EventSource(`/api/runs/${runId}/events`);
  const forward = (e: MessageEvent) => onEvent(JSON.parse(e.data) as CouncilEvent);
  for (const name of [
    "council.started",
    "agent.started",
    "agent.completed",
    "agent.failed",
    "peer_review.started",
    "peer_review.completed",
    "synthesis.started",
    "synthesis.completed",
    "council.completed",
    "council.failed",
  ]) {
    source.addEventListener(name, forward as EventListener);
  }
  return () => source.close();
}
