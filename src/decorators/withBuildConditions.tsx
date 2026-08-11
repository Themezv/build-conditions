import type { ReactElement, ReactNode } from 'react';

import type { PartialBuildConditions } from '../types';
import { setBuildConditions } from '../storage';

export type BuildConditionsDecorator = (story: () => ReactNode) => ReactElement;

/**
 * Storybook/тестовый декоратор: устанавливает условия сборки перед рендером story.
 *
 * ```typescript
 * import { withBuildConditions } from 'build-conditions/testing';
 *
 * export default {
 *     title: 'MyComponent',
 *     decorators: [withBuildConditions({ platform: 'desktop', runtime: 'client' })],
 * };
 * ```
 */
export function withBuildConditions(conditions: PartialBuildConditions): BuildConditionsDecorator {
    return function BuildConditionsDecorator(story) {
        setBuildConditions(conditions);

        return <>{story()}</>;
    };
}
