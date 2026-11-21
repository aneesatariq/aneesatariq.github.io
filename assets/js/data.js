// Module-relative resolution supports both a user site and a project subpath.
export const baseURL = new URL('../../', import.meta.url);

export async function loadSiteData() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const [content, settings, version] = await Promise.all(['content', 'settings', 'version'].map(async (name) => {
      const response = await fetch(new URL(`assets/json/${name}.json`, baseURL), { signal: controller.signal, credentials: 'same-origin', cache: 'no-cache' });
      if (!response.ok) throw new Error(`Could not load ${name} configuration (${response.status}).`);
      return response.json();
    }));
    if (!content?.profile || !content?.ui || !settings?.features || !settings?.pwa || typeof version?.version !== 'string') {
      throw new Error('Incomplete site configuration. Static content remains available.');
    }
    const renderedRelease = document.querySelector('meta[name="portfolio-release"]')?.content;
    if (renderedRelease && renderedRelease !== version.version) throw new Error('HTML and configuration releases differ. Static content remains authoritative.');
    return { content, settings, version, baseURL };
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}
