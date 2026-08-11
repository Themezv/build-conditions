import { mergeRsbuildConfig } from '@rsbuild/core';
import type { StorybookConfig } from 'storybook-react-rsbuild';

/**
 * Демо-стенд пакета: vanilla storybook-react-rsbuild.
 * JSX runtime включается напрямую через swc — без @rsbuild/plugin-react.
 */
const config: StorybookConfig = {
    stories: ['../../src/**/*.story.tsx'],
    framework: 'storybook-react-rsbuild',
    rsbuildFinal: rsbuildConfig =>
        mergeRsbuildConfig(rsbuildConfig, {
            tools: {
                swc: {
                    jsc: {
                        parser: { syntax: 'typescript', tsx: true },
                        transform: { react: { runtime: 'automatic' } },
                    },
                },
            },
        }),
};

export default config;
