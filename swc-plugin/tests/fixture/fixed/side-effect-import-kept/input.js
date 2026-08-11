import { isBuildConditions } from 'build-conditions';
import './globalStyles.css';
import { mobilePolyfill } from './polyfill@mobile';
export function run() {
    if (isBuildConditions('mobile')) {
        mobilePolyfill();
    }
}
