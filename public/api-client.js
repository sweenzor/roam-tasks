export async function api(path, options = {}) {
  const controller = options.timeoutMs ? new AbortController() : null;
  const timeout = controller
    ? setTimeout(() => controller.abort(), options.timeoutMs)
    : null;
  const fetchImpl = options.fetch || fetch;

  const response = await fetchImpl(path, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: controller?.signal
  }).catch((error) => {
    if (error.name === "AbortError") throw new Error("Roam refresh timed out");
    throw error;
  }).finally(() => {
    if (timeout) clearTimeout(timeout);
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}
