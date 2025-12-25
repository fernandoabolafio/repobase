import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://repobase.dev', // Update this to your actual domain
  integrations: [
    starlight({
      title: 'Repobase',
      description: 'Index and search your Git repositories with AI. Local indexing, semantic search, and MCP integration for Cursor, Claude, and more.',
      logo: {
        light: './src/assets/logo-light.svg',
        dark: './src/assets/logo-dark.svg',
        replacesTitle: false,
      },
      social: {
        github: 'https://github.com/fernandoabolafio/repobase',
      },
      customCss: [
        './src/styles/custom.css',
      ],
      // SEO and Social Media configuration
      head: [
        // Favicon
        { tag: 'link', attrs: { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' } },
        { tag: 'link', attrs: { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' } },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' } },
        // Theme color
        { tag: 'meta', attrs: { name: 'theme-color', content: '#20a1a1' } },
        // Open Graph
        { tag: 'meta', attrs: { property: 'og:image', content: 'https://repobase.dev/og-image.png' } },
        { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
        { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
        { tag: 'meta', attrs: { property: 'og:site_name', content: 'Repobase' } },
        { tag: 'meta', attrs: { property: 'og:type', content: 'website' } },
        // Twitter Card
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
        { tag: 'meta', attrs: { name: 'twitter:image', content: 'https://repobase.dev/og-image.png' } },
      ],
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Introduction', link: '/introduction/' },
            { label: 'Quick Start', link: '/quick-start/' },
            { label: 'Why Repobase', link: '/why-repobase/' },
          ],
        },
      ],
      // Disable the default landing page, we'll use a custom one
      components: {
        // Use our custom homepage
      },
    }),
  ],
});

