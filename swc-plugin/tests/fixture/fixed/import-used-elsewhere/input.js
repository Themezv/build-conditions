import { isBuildConditions } from 'build-conditions';
import { format } from './format';
export function run() {
    if (isBuildConditions('mobile')) {
        format('mobile');
    }
    return format('common');
}
