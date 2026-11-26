import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const required =
    command === "build" && process.env.CENTRAL_REQUIRE_SUPABASE === "1";

  if (required || url || key) {
    let endpoint: URL | undefined;
    try {
      endpoint = new URL(url ?? "");
    } catch {
      // The diagnostic below does not echo configuration values.
    }
    const secureEndpoint =
      endpoint &&
      !endpoint.username &&
      !endpoint.password &&
      !endpoint.search &&
      !endpoint.hash &&
      endpoint.pathname === "/" &&
      (endpoint.protocol === "https:" ||
        (!required &&
          endpoint.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)));
    if (!secureEndpoint || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key ?? "")) {
      throw new Error(
        "Configure a URL base do Supabase e uma chave sb_publishable_. Credenciais privilegiadas e chaves JWT legadas não são aceitas.",
      );
    }
  }
  if (
    command === "build" &&
    Object.keys(env).some(
      (name) =>
        !["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"].includes(name),
    )
  ) {
    throw new Error(
      "O build aceita somente as duas variáveis VITE_SUPABASE_* documentadas.",
    );
  }

  return {
    plugins: [react()],
    base: "./",
    build: {
      rollupOptions: {
        output: { manualChunks: { supabase: ["@supabase/supabase-js"] } },
      },
    },
    test: { environment: "jsdom", include: ["tests/**/*.test.{ts,tsx}"] },
  };
});
