// Minimal headless Domo Code Engine client. Mirrors the four calls the Domo
// Toolkit extension makes (getPackageVersions / getPackageVersion /
// postPackageVersion / releaseVersion), but authenticates with a developer
// token header instead of relying on a live browser session's cookies.

export function createDomoClient({ baseUrl, fetchImpl = fetch, token }) {
  if (!baseUrl) throw new Error('createDomoClient: baseUrl is required');
  if (!token) throw new Error('createDomoClient: token is required');

  async function call(method, path, body) {
    const res = await fetchImpl(`${baseUrl}${path}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        Accept: 'application/json',
        'X-Domo-Developer-Token': token,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      method
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`${method} ${path} -> HTTP ${res.status}${text ? `: ${text.slice(0, 500)}` : ''}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  return {
    // Create (or overwrite) a package version. Returns the created version object.
    createVersion: (definition) => call('POST', '/api/codeengine/v2/packages', definition),
    // Package envelope: version list (with release status) + configuration. Used
    // to pick the baseline and target version. Deliberately omits functions.
    getPackageEnvelope: (packageId) =>
      call('GET', `/api/codeengine/v2/packages/${packageId}?parts=versions,configuration`),
    // One version's full manifest + code, the diff baseline.
    getPackageVersion: (packageId, version) =>
      call('GET', `/api/codeengine/v2/packages/${packageId}/versions/${version}?parts=functions,code,privateFunctions`),
    // Release (deploy) a saved version.
    releaseVersion: (packageId, version) =>
      call('POST', `/api/codeengine/v2/packages/${packageId}/versions/${version}/release`)
  };
}
