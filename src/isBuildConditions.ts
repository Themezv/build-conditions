import type { Condition, UniqueConditionValuesGuard, UniqueGroups } from './types';
import { getBuildConditions } from './storage';

/**
 * Проверяет, активны ли указанные условия. Принимает либо одно условие строкой,
 * либо массив условий — тогда возвращает `true`, только когда все они активны
 * одновременно.
 *
 * Имя группы не указывается — оно однозначно восстанавливается по значению,
 * т.к. значения условий уникальны между группами.
 *
 * Без SWC-плагина работает в runtime через `getBuildConditions()`; при
 * неустановленных условиях бросает ошибку. SWC-плагин при сборке с
 * зафиксированными условиями сворачивает вызов в `true` / `false`.
 */
export function isBuildConditions(condition: Condition & UniqueConditionValuesGuard): boolean;
export function isBuildConditions<const L extends readonly Condition[]>(
    conditions: L & UniqueGroups<L> & UniqueConditionValuesGuard
): boolean;
export function isBuildConditions(conditions: Condition | readonly Condition[]): boolean {
    const active = getBuildConditions();
    const activeValues: unknown[] = Object.values(active);
    const list = Array.isArray(conditions) ? conditions : [conditions];

    return list.every(condition => activeValues.includes(condition));
}
