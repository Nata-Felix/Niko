const agente = typeof navigator === "undefined" ? "" : navigator.userAgent;

export const NO_LINUX = /Linux/i.test(agente) && !/Android/i.test(agente);
