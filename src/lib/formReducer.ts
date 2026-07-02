// ── Reducer del formulario de censo ─────────────────────────────────────────
// useReducer elimina bugs de stale-closure de useState en callbacks.

import type { FormData, FormAction } from "@/types";
import { INITIAL_FORM } from "@/lib/constants";

export function formReducer(state: FormData, action: FormAction): FormData {
  switch (action.type) {
    case "SET":      return { ...state, [action.field]: action.value };
    case "SET_MANY": return { ...state, ...action.patch };
    case "RESET":    return { ...INITIAL_FORM };
    default:         return state;
  }
}
