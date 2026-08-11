import type { BuildConditionGroups } from '../index';
import type { GroupName, PartialBuildConditions } from '../types';
import { setBuildConditions } from '../storage';

/** Префикс ключей в globals, чтобы не конфликтовать с другими аддонами */
export const BUILD_CONDITIONS_GLOBAL_PREFIX = 'buildConditions_';

export interface BuildConditionsToolbarGroup<G extends GroupName = GroupName> {
    /** Значения группы, доступные для переключения в toolbar */
    values: readonly BuildConditionGroups[G][];
    /** Значение группы по умолчанию */
    defaultValue: BuildConditionGroups[G];
    /** Заголовок пункта в toolbar (по умолчанию — имя группы) */
    title?: string;
    /** Имя иконки Storybook для пункта toolbar */
    icon?: string;
}

/** Конфигурация аддона: какие группы условий доступны для переключения в toolbar */
export type BuildConditionsAddonConfig = {
    [G in GroupName]?: BuildConditionsToolbarGroup<G>;
};

interface ToolbarItem {
    value: string;
    title: string;
}

interface GlobalType {
    name: string;
    description: string;
    defaultValue: string;
    toolbar: {
        icon: string;
        items: ToolbarItem[];
        dynamicTitle: boolean;
    };
}

/**
 * Пока группы условий не объявлены, mapped-тип конфига сворачивается в `{}` —
 * итерируемся по записям с явным типом группы.
 */
function configEntries(config: BuildConditionsAddonConfig): [string, BuildConditionsToolbarGroup | undefined][] {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Object.entries теряет типы mapped-типа
    return Object.entries(config) as [string, BuildConditionsToolbarGroup | undefined][];
}

/**
 * Создаёт `globalTypes` для preview-конфига Storybook: по toolbar-элементу
 * на каждую группу условий из конфигурации.
 *
 * ```typescript
 * // .config/storybook/preview.ts
 * export const globalTypes = createBuildConditionsGlobalTypes({
 *     platform: { values: ['desktop', 'mobile'], defaultValue: 'desktop' },
 * });
 * ```
 */
export function createBuildConditionsGlobalTypes(config: BuildConditionsAddonConfig): Record<string, GlobalType> {
    const globalTypes: Record<string, GlobalType> = {};

    for (const [group, groupConfig] of configEntries(config)) {
        if (!groupConfig) {
            continue;
        }

        globalTypes[BUILD_CONDITIONS_GLOBAL_PREFIX + group] = {
            name: groupConfig.title ?? group,
            description: `Build condition: ${group}`,
            defaultValue: groupConfig.defaultValue,
            toolbar: {
                icon: groupConfig.icon ?? 'beaker',
                items: groupConfig.values.map(value => ({ value, title: value })),
                dynamicTitle: true,
            },
        };
    }

    return globalTypes;
}

interface StoryContextLike {
    globals?: Record<string, unknown>;
}

/**
 * Создаёт глобальный декоратор для preview-конфига Storybook: читает выбранные
 * в toolbar значения из `context.globals` и устанавливает их через
 * `setBuildConditions` перед рендером story.
 *
 * ```typescript
 * // .config/storybook/preview.ts
 * export const decorators = [createBuildConditionsDecorator(addonConfig)];
 * ```
 */
export function createBuildConditionsDecorator(config: BuildConditionsAddonConfig) {
    return function buildConditionsDecorator<T>(story: () => T, context: StoryContextLike): T {
        const conditions: Record<string, unknown> = {};

        for (const [group, groupConfig] of configEntries(config)) {
            if (!groupConfig) {
                continue;
            }

            conditions[group] = context.globals?.[BUILD_CONDITIONS_GLOBAL_PREFIX + group] ?? groupConfig.defaultValue;
        }

        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- ключи собраны из BuildConditionsAddonConfig
        setBuildConditions(conditions as PartialBuildConditions);

        return story();
    };
}
