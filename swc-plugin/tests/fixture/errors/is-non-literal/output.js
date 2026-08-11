import { isBuildConditions } from 'build-conditions';
export function check(condition) {
    return isBuildConditions(condition);
}
