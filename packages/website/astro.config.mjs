import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  integrations: [
    starlight({
      title: 'Repobase',
      description: 'Index and search your Git repositories with AI',
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

