/* eslint-disable @typescript-eslint/no-explicit-any -- универсальные обёртки над функциями и объектами */
/* eslint-disable @typescript-eslint/consistent-type-assertions -- Proxy-ловушки делегируют значению разрешённой ветки */

import type { AllowedValue, Homogeneous, SingleGroup, UniqueConditionValuesGuard } from './types';
import { getBuildConditions } from './storage';

/**
 * Выбирает значение в зависимости от активного условия. Значения — функции или объекты.
 *
 * Без SWC-плагина работает в runtime: возвращает обёртку, которая при каждом
 * обращении определяет активное условие через `getBuildConditions()` и делегирует
 * нужной ветке. SWC-плагин при сборке с зафиксированными условиями инлайнит
 * результат совпавшей ветки и удаляет мёртвый код.
 *
 * ```typescript
 * const Component = switchBuildCondition({
 *     desktop: DesktopComponent,
 *     mobile: MobileComponent,
 * });
 * ```
 *
 * Ветка `default` используется, если ни один ключ не совпал с активными условиями.
 */
export function switchBuildCondition<M extends Record<string, AllowedValue>>(
    conditions: SingleGroup<M> & Homogeneous<M> & UniqueConditionValuesGuard
): M[keyof M];
export function switchBuildCondition(conditions: Record<string, AllowedValue>): AllowedValue {
    const resolve = () => {
        const active = getBuildConditions();
        const activeValues: unknown[] = Object.values(active);

        for (const key of Object.keys(conditions)) {
            if (key === 'default') {
                continue;
            }

            if (activeValues.includes(key)) {
                return conditions[key];
            }
        }

        if ('default' in conditions) {
            return conditions.default;
        }

        throw new Error(`switchBuildCondition: нет значения для текущих условий ${JSON.stringify(active)}`);
    };

    const allFunctions = Object.values(conditions).every(value => typeof value === 'function');

    if (allFunctions) {
        const wrapper = function (this: any, ...args: any[]) {
            return Reflect.apply(resolve() as (...fnArgs: any[]) => any, this, args);
        };

        return new Proxy(wrapper, {
            get: (target, property, receiver) => {
                if (property === 'length' || property === 'name') {
                    return Reflect.get(target, property, receiver);
                }

                return Reflect.get(resolve() as object, property, receiver);
            },
            set: (_target, property, value, receiver) => Reflect.set(resolve() as object, property, value, receiver),
            has: (_target, property) => Reflect.has(resolve() as object, property),
            getPrototypeOf: () => Reflect.getPrototypeOf(resolve() as object),
        });
    }

    const target = {};

    return new Proxy(target, {
        get: (_target, property, receiver) => Reflect.get(resolve() as object, property, receiver),
        set: (_target, property, value, receiver) => Reflect.set(resolve() as object, property, value, receiver),
        has: (_target, property) => Reflect.has(resolve() as object, property),
        deleteProperty: (_target, property) => Reflect.deleteProperty(resolve() as object, property),
        getPrototypeOf: () => Reflect.getPrototypeOf(resolve() as object),
        ownKeys: () => Reflect.ownKeys(resolve() as object),
        getOwnPropertyDescriptor: (_target, property) => {
            const descriptor = Reflect.getOwnPropertyDescriptor(resolve() as object, property);

            if (descriptor) {
                descriptor.configurable = true;
            }

            return descriptor;
        },
    });
}
