/**
 * Расширяемый интерфейс для определения групп условий.
 *
 * Пользователи расширяют его через declaration merging:
 *
 * ```typescript
 * declare module 'build-conditions' {
 *     interface BuildConditionGroups {
 *         platform: 'desktop' | 'mobile';
 *         runtime: 'server' | 'client';
 *     }
 * }
 * ```
 *
 * Значения условий должны быть уникальны между всеми группами:
 * разрешение значения в группу (в типах, в runtime и в SWC-плагине)
 * идёт по самому значению, а не по паре «группа → значение».
 *
 * Интерфейс объявлен прямо в entrypoint'е намеренно: module augmentation
 * в TypeScript мержится только с интерфейсом, объявленным в самом
 * аугментируемом модуле, и не работает через реэкспорт. Остальные типы
 * пакета живут в ./types.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface -- интерфейс наполняется через declaration merging
export interface BuildConditionGroups {}

export type {
    GroupName,
    Condition,
    BuildConditions,
    PartialBuildConditions,
    AllowedValue,
    Homogeneous,
    SingleGroup,
    GroupOf,
    UniqueGroups,
    AssertUniqueConditionValues,
    UniqueConditionValuesGuard,
    PluginOptions,
    BuildConditionsStorage,
} from './types';
export { getBuildConditions, setBuildConditions, setBuildConditionsStorage } from './storage';
export { switchBuildCondition } from './switchBuildCondition';
export { isBuildConditions } from './isBuildConditions';
