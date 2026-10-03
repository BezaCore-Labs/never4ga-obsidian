/**
 * Whether the service address stays on this machine.
 *
 * The plugin sends the local API credential with every request, and the
 * address comes from a setting stored inside the vault, where anyone who can
 * change the vault's files can change it. So the credential is sent only to a
 * loopback address -- `127.0.0.0/8`, `::1` or `localhost` -- which is the only
 * kind the Never4gA service binds.
 */

/** Why ``address`` may not be used, or `null` when it may. */
export function loopbackProblem(address: string): string | null {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return `"${address}" is not a valid address; use one like http://127.0.0.1:7377`;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return `"${address}" must use http or https`;
  }
  const host = url.hostname;
  const loopback =
    host === "localhost" || host === "[::1]" || /^127(\.\d{1,3}){3}$/.test(host);
  if (!loopback) {
    return (
      `"${address}" is not a loopback address, so the plugin will not send the ` +
      "service's credential there; use 127.0.0.1, ::1 or localhost"
    );
  }
  return null;
}
