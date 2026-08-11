/* eslint-disable @typescript-eslint/no-explicit-any -- обобщённые типы карт условий */

import type { BuildConditionGroups } from './index';

export type GroupName = keyof BuildConditionGroups;

/** Любое значение условия из любой группы */
export type Condition = BuildConditionGroups[GroupName];

/** Полный набор условий: для каждой группы задано конкретное значение */
export type BuildConditions = {
    [G in GroupName]: BuildConditionGroups[G];
};

/** Частичный набор условий */
export type PartialBuildConditions = Partial<BuildConditions>;

export type AllowedValue = ((...args: any[]) => any) | Record<string, unknown>;

/**
 * Экзотические React-компоненты (`memo`, `forwardRef`): их типы являются
 * вызываемыми, но в рантайме `typeof` для них — `'object'`, поэтому при
 * проверке однородности они классифицируются как объекты.
 */
type ExoticLike = { readonly $$typeof: symbol };

/** Все значения — функции */
type AllFunctions<M> = {
    [K in keyof M]: M[K] extends ExoticLike ? never : M[K] extends (...args: any[]) => any ? M[K] : never;
};

/** Все значения — объекты */
type AllObjects<M> = {
    [K in keyof M]: M[K] extends ExoticLike
        ? M[K]
        : M[K] extends (...args: any[]) => any
          ? never
          : M[K] extends Record<string, unknown>
            ? M[K]
            : never;
};

/** Однородность: функции XOR объекты (запрет смешивания в одном вызове) */
export type Homogeneous<M> = M extends AllFunctions<M> ? M : M extends AllObjects<M> ? M : never;

/** Ключи (кроме 'default') принадлежат ровно одной группе условий */
export type SingleGroup<M> = {
    [G in GroupName]: Exclude<keyof M, 'default'> extends BuildConditionGroups[G] ? M : never;
}[GroupName];

/** Группа, которой принадлежит значение условия */
export type GroupOf<C extends Condition> = {
    [G in GroupName]: C extends BuildConditionGroups[G] ? G : never;
}[GroupName];

/** Массив условий: не более одного значения из каждой группы */
export type UniqueGroups<L extends readonly Condition[]> = L extends readonly [
    infer Head extends Condition,
    ...infer Tail extends readonly Condition[],
]
    ? [Extract<Tail[number], BuildConditionGroups[GroupOf<Head>]>] extends [never]
        ? [UniqueGroups<Tail>] extends [never]
            ? never
            : L
        : never
    : L;

/** Значения всех групп, кроме G */
type OtherGroupsValues<G extends GroupName> = BuildConditionGroups[Exclude<GroupName, G>];

/** Пересечение значений каждой группы с остальными — должно быть never */
type DuplicateConditionValues = {
    [G in GroupName]: BuildConditionGroups[G] & OtherGroupsValues<G>;
}[GroupName];

/**
 * Если значения групп пересекаются, тип разворачивается в строку-ошибку,
 * иначе — в BuildConditions. Используется как ограничение на публичный API.
 */
export type AssertUniqueConditionValues = [DuplicateConditionValues] extends [never]
    ? BuildConditions
    : 'Error: condition value is used in more than one group';

/**
 * Ограничение публичного API: пока значения групп уникальны, тип прозрачен (unknown
 * в интерсекции), при нарушении инварианта параметр разворачивается в строку-ошибку
 * и вызовы хелперов не компилируются.
 */
export type UniqueConditionValuesGuard = [DuplicateConditionValues] extends [never]
    ? unknown
    : 'Error: condition value is used in more than one group';

/** Конфигурация SWC-плагина */
export interface PluginOptions {
    /**
     * Полный состав групп условий: группа → все её значения.
     * По нему плагин разрешает значение условия в группу и отличает
     * значение чужой группы от опечатки (ошибка сборки).
     */
    groups: {
        [G in GroupName]: readonly BuildConditionGroups[G][];
    };
    /**
     * Выбранные значения групп: строка — группа зафиксирована и её вызовы
     * трансформируются, null — группа переключается в runtime.
     */
    conditions: {
        [G in GroupName]: BuildConditionGroups[G] | null;
    };
}

/**
 * Хранилище текущих условий сборки.
 *
 * Пакет не привязан к конкретному способу хранения: окружение может подменить
 * хранилище через `setBuildConditionsStorage`. Например, сервер регистрирует
 * хранилище поверх собственного `AsyncLocalStorage`, чтобы изолировать условия
 * конкурентных запросов, — при этом `node:async_hooks` не попадает ни в пакет,
 * ни в клиентские бандлы.
 */
export interface BuildConditionsStorage {
    get(): PartialBuildConditions | undefined;
    /**
     * Установка условий. Хранилище может не поддерживать прямую запись
     * (например, серверное на `AsyncLocalStorage`, где условия задаются
     * только через `als.run`) — тогда `setBuildConditions` бросает ошибку.
     */
    set?(conditions: PartialBuildConditions): void;
}
