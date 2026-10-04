// ── Wrapper de fetch del cliente ────────────────────────────────────────────
// (1) Añade el header `x-user-id` (identidad para las guardas del backend), leído
//     de localStorage/sessionStorage — funciona también en la cola de sync que
//     corre en segundo plano, fuera de React.
// (2) Aplica un timeout con AbortController para que, con señal intermitente, un
//     request colgado no bloquee la cola de sincronización.

function getUserId(): string {
  try {
    const saved =
      localStorage.getItem("sismo_operator") ||
      sessionStorage.getItem("sismo_operator");
    if (saved) return JSON.parse(saved)?.id || "";
  } catch {
    /* ignore */
  }
  return "";
}

export interface ApiFetchOptions extends RequestInit {
  timeoutMs?: number;
}

export async function apiFetch(
  input: string,
  init: ApiFetchOptions = {}
): Promise<Response> {
  const { timeoutMs = 45000, headers, signal: callerSignal, ...rest } = init;

  const h = new Headers(headers || {});
  const userId = getUserId();
  if (userId) h.set("x-user-id", userId);

  const controller = new AbortController();

  // Si el llamador pasó una señal, la vinculamos para respetar cancelaciones del usuario
  if (callerSignal?.aborted) {
    try {
      controller.abort(callerSignal.reason);
    } catch {
      controller.abort();
    }
  } else if (callerSignal) {
    callerSignal.addEventListener(
      "abort",
      () => {
        try {
          controller.abort(callerSignal.reason);
        } catch {
          controller.abort();
        }
      },
      { once: true }
    );
  }

  const timer = setTimeout(() => {
    try {
      controller.abort(
        new DOMException(
          "Tiempo de espera agotado al conectar con el servidor",
          "TimeoutError"
        )
      );
    } catch {
      controller.abort();
    }
  }, timeoutMs);

  try {
    return await fetch(input, { ...rest, headers: h, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
