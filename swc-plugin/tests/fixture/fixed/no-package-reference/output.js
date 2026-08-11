// Модуль без ссылки на пакет: обход дерева пропускается (ранний выход),
// код остаётся нетронутым — включая одноимённые с хелперами локальные функции
import { other } from './other';
function isBuildConditions(value) {
    return other(value);
}
export function main(arg) {
    if (isBuildConditions('desktop')) {
        return 1;
    }
    return 2;
}
