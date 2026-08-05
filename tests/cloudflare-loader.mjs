export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return {
      url: "data:text/javascript,export const env = globalThis.__moaTestCloudflareEnv;",
      shortCircuit: true,
    };
  }
  if (specifier === "next/headers") {
    return {
      url: "data:text/javascript,export async function headers() { return new Headers(); }",
      shortCircuit: true,
    };
  }
  if (specifier === "next/navigation") {
    return {
      url: "data:text/javascript,export function redirect(url) { throw new Error(`redirect:${url}`); }",
      shortCircuit: true,
    };
  }
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (!["ERR_MODULE_NOT_FOUND", "ERR_UNSUPPORTED_DIR_IMPORT"].includes(error?.code) || !specifier.startsWith(".")) throw error;
    const { existsSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    for (const suffix of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
      const candidate = new URL(`${specifier}${suffix}`, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) return { url: candidate.href, shortCircuit: true };
    }
    throw error;
  }
}
