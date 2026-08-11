import { isBuildConditions } from 'build-conditions';
import { desktopOnly } from './desktopOnly';
export function run() {
    if (!isBuildConditions('desktop')) {
        throw new Error('not desktop');
    }
    desktopOnly();
}
